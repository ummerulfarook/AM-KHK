"""
Customers blueprint — full implementation for CRM (Milestone 4).
"""
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import func, or_
from app import db
from app.models.customer import Customer
from app.models.sale import RetailSale
from app.models.order import WholesaleOrder
from app.models.credit import CreditLedger, Payment
from app.utils.role_guard import require_roles

customers_bp = Blueprint("customers", __name__, url_prefix="/api/customers")


def _rupees_to_paise(val) -> int:
    try:
        return int(Decimal(str(val)) * 100)
    except (TypeError, ValueError, InvalidOperation):
        return 0


# Avoid decimal import error if InvalidOperation is raised
from decimal import InvalidOperation


@customers_bp.route("/", methods=["GET"])
@login_required
def list_customers():
    """List customers with search, type filter, and pagination."""
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, request.args.get("perPage", 25, type=int))
    search = request.args.get("search", "").strip()
    cust_type = request.args.get("type", "").strip()

    stmt = db.select(Customer)
    if search:
        stmt = stmt.where(
            or_(
                Customer.name.ilike(f"%{search}%"),
                Customer.phone.ilike(f"%{search}%")
            )
        )
    if cust_type in ("wholesale", "retail"):
        stmt = stmt.where(Customer.type == cust_type)

    total = db.session.execute(
        db.select(func.count()).select_from(stmt.subquery())
    ).scalar() or 0

    customers = db.session.execute(
        stmt.order_by(Customer.name)
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).scalars().all()

    return jsonify({
        "data": [c.to_dict() for c in customers],
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, -(-total // per_page))
        }
    }), 200


@customers_bp.route("/", methods=["POST"])
@login_required
@require_roles("owner", "manager", "accountant")
def create_customer():
    """Create a new customer."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 422

    phone = (data.get("phone") or "").strip() or None
    address = (data.get("address") or "").strip() or None
    cust_type = (data.get("type") or "retail").strip()
    if cust_type not in ("wholesale", "retail"):
        return jsonify({"error": "Type must be 'retail' or 'wholesale'"}), 422

    credit_limit = _rupees_to_paise(data.get("creditLimit", 0))
    opening_balance = _rupees_to_paise(data.get("openingBalance", 0))
    partner = (data.get("partner") or "neutral").strip()

    customer = Customer(
        name=name,
        phone=phone,
        address=address,
        type=cust_type,
        credit_limit=credit_limit,
        opening_balance=opening_balance,
        outstanding_balance=opening_balance,
        partner=partner,
        is_active=1
    )
    db.session.add(customer)
    db.session.flush()

    if opening_balance > 0:
        ledger_entry = CreditLedger(
            customer_id=customer.id,
            invoice_ref="OPENING-BAL",
            amount=opening_balance,
            amount_paid=0,
            due_date=date.today() + timedelta(days=30),
            status="due"
        )
        db.session.add(ledger_entry)

    db.session.commit()

    return jsonify({"data": customer.to_dict(), "message": "Customer created successfully"}), 201


@customers_bp.route("/<int:cust_id>", methods=["GET"])
@login_required
def get_customer(cust_id: int):
    """Get single customer details."""
    customer = db.session.get(Customer, cust_id)
    if not customer:
        return jsonify({"error": "Customer not found"}), 404
    return jsonify({"data": customer.to_dict()}), 200


@customers_bp.route("/<int:cust_id>", methods=["PUT"])
@login_required
@require_roles("owner", "manager", "accountant")
def update_customer(cust_id: int):
    """Update a customer."""
    customer = db.session.get(Customer, cust_id)
    if not customer:
        return jsonify({"error": "Customer not found"}), 404

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 422

    cust_type = (data.get("type") or "retail").strip()
    if cust_type not in ("wholesale", "retail"):
        return jsonify({"error": "Type must be 'retail' or 'wholesale'"}), 422

    new_ob = _rupees_to_paise(data.get("openingBalance", 0))

    # Sync CreditLedger entry for OPENING-BAL
    ledger_entry = db.session.execute(
        db.select(CreditLedger)
        .where(CreditLedger.customer_id == cust_id)
        .where(CreditLedger.invoice_ref == "OPENING-BAL")
    ).scalar_one_or_none()

    if ledger_entry:
        old_ob = customer.opening_balance
        diff = new_ob - old_ob
        ledger_entry.amount = new_ob
        if ledger_entry.amount_paid >= new_ob:
            ledger_entry.status = "paid"
            ledger_entry.paid_at = datetime.now(timezone.utc)
        else:
            ledger_entry.status = "due"
            ledger_entry.paid_at = None
        customer.outstanding_balance += diff
    else:
        if new_ob > 0:
            ledger_entry = CreditLedger(
                customer_id=customer.id,
                invoice_ref="OPENING-BAL",
                amount=new_ob,
                amount_paid=0,
                due_date=date.today() + timedelta(days=30),
                status="due"
            )
            db.session.add(ledger_entry)
            customer.outstanding_balance += new_ob

    customer.name = name
    customer.phone = (data.get("phone") or "").strip() or None
    customer.address = (data.get("address") or "").strip() or None
    customer.type = cust_type
    customer.credit_limit = _rupees_to_paise(data.get("creditLimit", 0))
    customer.opening_balance = new_ob
    customer.partner = (data.get("partner") or "neutral").strip()

    db.session.commit()
    return jsonify({"data": customer.to_dict(), "message": "Customer updated successfully"}), 200


@customers_bp.route("/<int:cust_id>", methods=["DELETE"])
@login_required
@require_roles("owner", "manager")
def toggle_customer_active(cust_id: int):
    """Toggle customer active/inactive status (soft-delete)."""
    customer = db.session.get(Customer, cust_id)
    if not customer:
        return jsonify({"error": "Customer not found"}), 404

    customer.is_active = 0 if customer.is_active else 1
    db.session.commit()

    status_str = "deactivated" if not customer.is_active else "activated"
    return jsonify({
        "data": customer.to_dict(),
        "message": f"Customer successfully {status_str}"
    }), 200


@customers_bp.route("/<int:cust_id>/history", methods=["GET"])
@login_required
def get_customer_history(cust_id: int):
    """Get customer purchase history (combined RetailSale and WholesaleOrder)."""
    customer = db.session.get(Customer, cust_id)
    if not customer:
        return jsonify({"error": "Customer not found"}), 404

    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(1000, request.args.get("perPage", 10, type=int)) # Support larger page sizes for statement prints
    date_from = request.args.get("dateFrom")
    date_to = request.args.get("dateTo")

    # Fetch retail sales
    stmt_rs = db.select(RetailSale).where(RetailSale.customer_id == cust_id)
    if date_from:
        stmt_rs = stmt_rs.where(RetailSale.created_at >= f"{date_from} 00:00:00")
    if date_to:
        stmt_rs = stmt_rs.where(RetailSale.created_at <= f"{date_to} 23:59:59")
    retail_sales = db.session.execute(stmt_rs).scalars().all()

    # Fetch wholesale orders
    stmt_wo = db.select(WholesaleOrder).where(WholesaleOrder.customer_id == cust_id)
    if date_from:
        stmt_wo = stmt_wo.where(WholesaleOrder.created_at >= f"{date_from} 00:00:00")
    if date_to:
        stmt_wo = stmt_wo.where(WholesaleOrder.created_at <= f"{date_to} 23:59:59")
    wholesale_orders = db.session.execute(stmt_wo).scalars().all()

    # Combine & format
    history = []
    for rs in retail_sales:
        payment_status = "paid"
        amount_paid = rs.total
        balance = 0
        if rs.payment_method == "credit":
            ledger = db.session.execute(
                db.select(CreditLedger).where(CreditLedger.sale_id == rs.id)
            ).scalar_one_or_none()
            if ledger:
                payment_status = ledger.status
                amount_paid = ledger.amount_paid
                balance = ledger.amount - ledger.amount_paid
            else:
                payment_status = "credit"
                amount_paid = 0
                balance = rs.total

        history.append({
            "id": rs.id,
            "type": "retail",
            "invoiceNumber": rs.invoice_number,
            "total": rs.total,
            "itemsCount": len(rs.items),
            "paymentMethod": rs.payment_method,
            "paymentStatus": payment_status,
            "amountPaid": amount_paid,
            "balance": balance,
            "createdAt": rs.created_at.isoformat(),
        })

    for wo in wholesale_orders:
        payment_status = "paid"
        amount_paid = wo.total_amount
        balance = 0
        if wo.payment_method == "credit":
            ledger = db.session.execute(
                db.select(CreditLedger).where(CreditLedger.wholesale_order_id == wo.id)
            ).scalar_one_or_none()
            if ledger:
                payment_status = ledger.status
                amount_paid = ledger.amount_paid
                balance = ledger.amount - ledger.amount_paid
            else:
                payment_status = "credit"
                amount_paid = 0
                balance = wo.total_amount

        history.append({
            "id": wo.id,
            "type": "wholesale",
            "invoiceNumber": f"WO-{wo.id:04d}",
            "total": wo.total_amount,
            "itemsCount": len(wo.items),
            "paymentMethod": wo.payment_method or "credit",
            "status": wo.status,
            "paymentStatus": payment_status,
            "amountPaid": amount_paid,
            "balance": balance,
            "createdAt": wo.created_at.isoformat(),
        })

    # Sort desc by date
    history.sort(key=lambda x: x["createdAt"], reverse=True)

    total = len(history)
    start = (page - 1) * per_page
    end = start + per_page
    paginated_data = history[start:end]

    return jsonify({
        "data": paginated_data,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, -(-total // per_page))
        }
    }), 200


@customers_bp.route("/<int:cust_id>/credit", methods=["GET"])
@login_required
def get_customer_credit(cust_id: int):
    """Get customer credit summary: limit, outstanding balance, credit entries."""
    customer = db.session.get(Customer, cust_id)
    if not customer:
        return jsonify({"error": "Customer not found"}), 404

    date_from = request.args.get("dateFrom")
    date_to = request.args.get("dateTo")

    stmt_entries = db.select(CreditLedger).where(CreditLedger.customer_id == cust_id)
    if date_from:
        stmt_entries = stmt_entries.where(CreditLedger.created_at >= f"{date_from} 00:00:00")
    if date_to:
        stmt_entries = stmt_entries.where(CreditLedger.created_at <= f"{date_to} 23:59:59")
    entries = db.session.execute(stmt_entries.order_by(CreditLedger.created_at.desc())).scalars().all()

    total_outstanding = customer.outstanding_balance

    stmt_payments = db.select(Payment).join(CreditLedger).where(CreditLedger.customer_id == cust_id)
    if date_from:
        stmt_payments = stmt_payments.where(Payment.recorded_at >= f"{date_from} 00:00:00")
    if date_to:
        stmt_payments = stmt_payments.where(Payment.recorded_at <= f"{date_to} 23:59:59")
    payments = db.session.execute(stmt_payments.order_by(Payment.recorded_at.desc())).scalars().all()

    return jsonify({
        "data": {
            "creditLimit": customer.credit_limit,
            "totalOutstanding": total_outstanding,
            "entries": [e.to_dict() for e in entries],
            "payments": [p.to_dict() for p in payments]
        }
    }), 200


@customers_bp.route("/<int:cust_id>/pay", methods=["POST"])
@login_required
@require_roles("owner", "manager", "accountant")
def clear_customer_dues(cust_id: int):
    """Record a general or invoice-specific customer payment."""
    customer = db.session.get(Customer, cust_id)
    if not customer:
        return jsonify({"error": "Customer not found"}), 404

    data = request.get_json(silent=True) or {}
    amount_rs = data.get("amount")
    if amount_rs is None:
        return jsonify({"error": "Amount is required"}), 422

    amount = _rupees_to_paise(amount_rs)
    if amount <= 0:
        return jsonify({"error": "Amount must be greater than zero"}), 422

    method = (data.get("method") or "cash").strip()
    if method not in ("cash", "upi", "bank"):
        return jsonify({"error": "Method must be cash, upi, or bank"}), 422

    notes = (data.get("notes") or "").strip() or None
    upi_id = data.get("upiId")
    bank_name = data.get("bankName")
    invoice_ref = data.get("invoiceRef")

    try:
        # 1. Update customer's outstanding balance
        customer.outstanding_balance = max(0, customer.outstanding_balance - amount)
        customer.opening_balance = customer.outstanding_balance

        applied_amount = amount

        # 2. If specific invoiceRef is provided, apply payment to that entry first
        if invoice_ref:
            entry = db.session.execute(
                db.select(CreditLedger)
                .where(CreditLedger.customer_id == cust_id)
                .where(CreditLedger.invoice_ref == invoice_ref)
                .where(CreditLedger.status != "paid")
            ).scalar_one_or_none()
            if entry:
                rem = entry.amount - entry.amount_paid
                applied = min(applied_amount, rem)
                
                p = Payment(
                    credit_ledger_id=entry.id,
                    amount=applied,
                    method=method,
                    upi_id=upi_id,
                    bank_name=bank_name,
                    recorded_by_id=current_user.id,
                    notes=f"[Invoice Payment: {invoice_ref}] {notes or ''}".strip()
                )
                db.session.add(p)
                entry.amount_paid += applied
                if entry.amount_paid >= entry.amount:
                    entry.status = "paid"
                    entry.paid_at = datetime.now(timezone.utc)
                    # Update wholesale order payment status if linked
                    if entry.wholesale_order_id:
                        order = db.session.get(WholesaleOrder, entry.wholesale_order_id)
                        if order:
                            order.payment_status = "paid"
                else:
                    entry.status = "partial"
                    # Update wholesale order payment status if linked
                    if entry.wholesale_order_id:
                        order = db.session.get(WholesaleOrder, entry.wholesale_order_id)
                        if order:
                            order.payment_status = "partial"
                
                applied_amount -= applied

        # 3. Distribute remaining payment across unpaid CreditLedger entries (oldest first)
        if applied_amount > 0:
            unpaid_entries = db.session.execute(
                db.select(CreditLedger)
                .where(CreditLedger.customer_id == cust_id)
                .where(CreditLedger.status != "paid")
                .order_by(CreditLedger.due_date.asc())
            ).scalars().all()

            for entry in unpaid_entries:
                if applied_amount <= 0:
                    break

                rem = entry.amount - entry.amount_paid
                if applied_amount >= rem:
                    # Fully pay this entry
                    p = Payment(
                        credit_ledger_id=entry.id,
                        amount=rem,
                        method=method,
                        upi_id=upi_id,
                        bank_name=bank_name,
                        recorded_by_id=current_user.id,
                        notes=f"[General Payment] {notes or ''}".strip()
                    )
                    db.session.add(p)
                    entry.amount_paid += rem
                    entry.status = "paid"
                    entry.paid_at = datetime.now(timezone.utc)
                    applied_amount -= rem

                    # Update wholesale order payment status if linked
                    if entry.wholesale_order_id:
                        order = db.session.get(WholesaleOrder, entry.wholesale_order_id)
                        if order:
                            order.payment_status = "paid"
                else:
                    # Partially pay this entry
                    p = Payment(
                        credit_ledger_id=entry.id,
                        amount=applied_amount,
                        method=method,
                        upi_id=upi_id,
                        bank_name=bank_name,
                        recorded_by_id=current_user.id,
                        notes=f"[General Payment] {notes or ''}".strip()
                    )
                    db.session.add(p)
                    entry.amount_paid += applied_amount
                    entry.status = "partial"
                    applied_amount = 0

                    # Update wholesale order payment status if linked
                    if entry.wholesale_order_id:
                        order = db.session.get(WholesaleOrder, entry.wholesale_order_id)
                        if order:
                            order.payment_status = "partial"

        db.session.commit()
        return jsonify({
            "data": customer.to_dict(),
            "message": f"Payment of ₹{amount_rs:.2f} successfully recorded and applied to dues."
        }), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to record customer payment: {exc}"}), 500
