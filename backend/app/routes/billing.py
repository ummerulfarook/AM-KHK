"""
Billing (POS) blueprint — full retail sale implementation.

Create sale is atomic:
  1. Validate products and stock
  2. Write RetailSale + SaleItems
  3. Decrement stock on each product
  4. Write CreditLedger if payment_method == 'credit'
  5. Increment invoice sequence in settings
  All in one db.session.commit() — rolls back on any error.
"""
import io
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal

from flask import Blueprint, request, jsonify, send_file, Response
from flask_login import login_required, current_user
from sqlalchemy import func

from app import db
from app.models.sale import RetailSale, SaleItem
from app.models.product import Product
from app.models.customer import Customer
from app.models.credit import CreditLedger, Payment
from app.models.settings import Setting
from app.schemas.billing_schema import CreateSaleRequest
from app.services.invoice_service import (
    render_invoice_html, generate_invoice_pdf, print_thermal_receipt
)
from app.utils.role_guard import require_roles

billing_bp = Blueprint("billing", __name__, url_prefix="/api/billing")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_settings() -> dict:
    """Fetch all settings as a plain dict."""
    rows = db.session.execute(db.select(Setting)).scalars().all()
    return {r.key: r.value for r in rows}


def _next_invoice_number(settings: dict) -> str:
    """Generate invoice number and bump the sequence."""
    prefix = settings.get("invoice_prefix", "INV")
    seq = int(settings.get("invoice_next", "1"))
    now = datetime.now(timezone.utc)
    inv_num = f"{prefix}-{now.year}{now.month:02d}-{seq:04d}"

    # Bump the counter
    row = db.session.execute(
        db.select(Setting).where(Setting.key == "invoice_next")
    ).scalar_one_or_none()
    if row:
        row.value = str(seq + 1)
    else:
        db.session.add(Setting(key="invoice_next", value=str(seq + 1)))

    return inv_num


# ── Create sale ────────────────────────────────────────────────────────────────

@billing_bp.route("/", methods=["POST"])
@login_required
@require_roles("owner", "manager", "cashier")
def create_sale():
    """Atomic POS sale creation."""
    try:
        req = CreateSaleRequest.from_json(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify({"error": "Validation failed", "details": exc.args[0]}), 422

    # Validate customer
    customer = None
    if req.customer_id:
        customer = db.session.get(Customer, req.customer_id)
        if not customer:
            return jsonify({"error": "Customer not found"}), 404

    # Validate products and stock
    products_map: dict[int, Product] = {}
    for item_req in req.items:
        p = db.session.get(Product, item_req.product_id)
        if not p:
            return jsonify({"error": f"Product {item_req.product_id} not found"}), 404
        if not p.is_active:
            return jsonify({"error": f"Product '{p.name}' is inactive"}), 422
        # Note: Stock checks bypassed per requirements. Out of stock products can be billed.
        products_map[item_req.product_id] = p

    try:
        settings = _get_settings()
        inv_num = _next_invoice_number(settings)

        # Compute totals
        subtotal = sum(i.subtotal for i in req.items)
        total = subtotal - req.discount + req.tax

        # Determine previous balance
        prev_bal = customer.outstanding_balance if customer else 0
        
        # Calculate amount paid
        amt_paid = 0
        if req.payment_method in ("upi", "bank", "cash"):
            amt_paid = req.cash_paid if req.cash_paid is not None else total
        elif req.payment_method == "credit":
            amt_paid = req.cash_paid if req.cash_paid is not None else 0

        # Write sale
        sale = RetailSale(
            invoice_number=inv_num,
            customer_id=req.customer_id,
            cashier_id=current_user.id,
            payment_method=req.payment_method,
            upi_id=req.upi_id,
            bank_name=req.bank_name,
            subtotal=subtotal,
            discount=req.discount,
            tax=req.tax,
            total=total,
            notes=req.notes,
            amount_paid=amt_paid,
            previous_balance=prev_bal,
            partner=customer.partner if customer else "neutral",
            billing_customer_name=req.billing_customer_name,
            billing_customer_phone=req.billing_customer_phone,
        )
        db.session.add(sale)
        db.session.flush()  # get sale.id before commit

        # Write items + decrement stock
        for item_req in req.items:
            p = products_map[item_req.product_id]
            db.session.add(SaleItem(
                sale_id=sale.id,
                product_id=item_req.product_id,
                quantity=item_req.quantity,
                unit_price=item_req.unit_price,
                subtotal=item_req.subtotal,
            ))
            p.current_stock = round(p.current_stock - item_req.quantity, 4)
            p.selling_price = item_req.unit_price

        # Handle Cash/UPI/Bank Payment differences
        if req.payment_method in ("cash", "upi", "bank") and customer and req.cash_paid is not None:
            if req.cash_paid < total:
                # Less than bill: add shortage to outstanding credit
                shortage = total - req.cash_paid
                customer.outstanding_balance += shortage
                customer.opening_balance = customer.outstanding_balance
                sale.notes = f"{sale.notes or ''}\nReceived: Rs{req.cash_paid/100:.2f} | Shortage: Rs{shortage/100:.2f} (added to dues)".strip()
                
                credit_days = req.credit_days if req.credit_days is not None else int(settings.get("credit_days", "30"))
                due = date.today() + timedelta(days=credit_days)
                db.session.add(CreditLedger(
                    customer_id=req.customer_id,
                    sale_id=sale.id,
                    invoice_ref=inv_num,
                    amount=shortage,
                    amount_paid=0,
                    due_date=due,
                    status="due",
                ))
            elif req.cash_paid > total:
                # Greater than bill: apply surplus to outstanding credit
                surplus = req.cash_paid - total
                customer.outstanding_balance = max(0, customer.outstanding_balance - surplus)
                customer.opening_balance = customer.outstanding_balance
                sale.notes = f"{sale.notes or ''}\nReceived: Rs{req.cash_paid/100:.2f} | Surplus: Rs{surplus/100:.2f} (applied to dues)".strip()
                
                # Check if specific invoice to pay
                applied_amount = surplus
                if req.invoice_to_pay:
                    ledger_entry = db.session.execute(
                        db.select(CreditLedger)
                        .where(CreditLedger.customer_id == customer.id)
                        .where(CreditLedger.invoice_ref == req.invoice_to_pay)
                        .where(CreditLedger.status != "paid")
                    ).scalar_one_or_none()
                    if ledger_entry:
                        rem = ledger_entry.amount - ledger_entry.amount_paid
                        applied = min(applied_amount, rem)
                        p = Payment(
                            credit_ledger_id=ledger_entry.id,
                            amount=applied,
                            method=req.payment_method,
                            recorded_by_id=current_user.id,
                            notes=f"[{req.payment_method.upper()}-SURPLUS] Applied from Sale {inv_num}"
                        )
                        db.session.add(p)
                        ledger_entry.amount_paid += applied
                        if ledger_entry.amount_paid >= ledger_entry.amount:
                            ledger_entry.status = "paid"
                            ledger_entry.paid_at = datetime.now(timezone.utc)
                        applied_amount -= applied
                        
                        sale.notes = f"{sale.notes or ''}\n[Prev Bill Pay] Paid Rs{applied/100:.2f} to {req.invoice_to_pay}".strip()

                # Apply remaining surplus to oldest unpaid entries
                if applied_amount > 0:
                    unpaid_entries = db.session.execute(
                        db.select(CreditLedger)
                        .where(CreditLedger.customer_id == customer.id)
                        .where(CreditLedger.status != "paid")
                        .order_by(CreditLedger.due_date.asc())
                    ).scalars().all()
                    for entry in unpaid_entries:
                        if applied_amount <= 0:
                            break
                        rem = entry.amount - entry.amount_paid
                        applied = min(applied_amount, rem)
                        p = Payment(
                            credit_ledger_id=entry.id,
                            amount=applied,
                            method=req.payment_method,
                            recorded_by_id=current_user.id,
                            notes=f"[{req.payment_method.upper()}-SURPLUS] Applied from Sale {inv_num}"
                        )
                        db.session.add(p)
                        entry.amount_paid += applied
                        if entry.amount_paid >= entry.amount:
                            entry.status = "paid"
                            entry.paid_at = datetime.now(timezone.utc)
                        applied_amount -= applied
            elif req.cash_paid == total:
                sale.notes = f"{sale.notes or ''}\nReceived: Rs{req.cash_paid/100:.2f} (exact payment)".strip()

        # Write credit ledger if credit payment
        elif req.payment_method == "credit":
            paid_now = min(amt_paid, total)
            credit_amount = total - paid_now
            
            if customer:
                customer.outstanding_balance += credit_amount
                customer.opening_balance = customer.outstanding_balance
            
            credit_days = req.credit_days if req.credit_days is not None else int(settings.get("credit_days", "30"))
            due = date.today() + timedelta(days=credit_days)
            
            ledger = CreditLedger(
                customer_id=req.customer_id,
                sale_id=sale.id,
                invoice_ref=inv_num,
                amount=total,
                amount_paid=paid_now,
                due_date=due,
                status="paid" if paid_now >= total else "due_soon" if paid_now > 0 else "due",
            )
            db.session.add(ledger)
            db.session.flush()
            
            if paid_now > 0:
                p = Payment(
                    credit_ledger_id=ledger.id,
                    amount=paid_now,
                    method="cash",
                    recorded_by_id=current_user.id,
                    notes=f"[POS Credit Downpayment] Paid Rs{paid_now/100:.2f} during checkout"
                )
                db.session.add(p)
                sale.notes = f"{sale.notes or ''}\nCredit Sale. Paid: Rs{paid_now/100:.2f} | Remaining: Rs{credit_amount/100:.2f} (added to dues)".strip()
            else:
                sale.notes = f"{sale.notes or ''}\nCredit Sale (Full Amount added to dues)".strip()

        db.session.commit()
        db.session.refresh(sale)

        return jsonify({"data": sale.to_dict(), "invoiceNumber": inv_num}), 201

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Sale creation failed: {exc}"}), 500


# ── List sales ─────────────────────────────────────────────────────────────────

@billing_bp.route("/", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def list_sales():
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, request.args.get("perPage", 25, type=int))
    date_from = request.args.get("dateFrom")
    date_to = request.args.get("dateTo")
    customer_id = request.args.get("customerId", type=int)
    payment_method = request.args.get("paymentMethod")

    stmt = db.select(RetailSale)

    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            stmt = stmt.where(RetailSale.created_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
            stmt = stmt.where(RetailSale.created_at <= dt_to)
        except ValueError:
            pass
    if customer_id:
        stmt = stmt.where(RetailSale.customer_id == customer_id)
    if payment_method:
        stmt = stmt.where(RetailSale.payment_method == payment_method)

    total = db.session.execute(
        db.select(func.count()).select_from(stmt.subquery())
    ).scalar() or 0

    sales = db.session.execute(
        stmt.order_by(RetailSale.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).scalars().all()

    return jsonify({
        "data": [s.to_dict() for s in sales],
        "pagination": {
            "page": page, "perPage": per_page, "total": total,
            "totalPages": max(1, -(-total // per_page)),
        },
    }), 200


# ── Single sale ────────────────────────────────────────────────────────────────

@billing_bp.route("/<int:sale_id>", methods=["GET"])
@login_required
def get_sale(sale_id: int):
    sale = db.session.get(RetailSale, sale_id)
    if not sale:
        return jsonify({"error": "Sale not found"}), 404
    return jsonify({"data": sale.to_dict()}), 200


# ── PDF invoice ────────────────────────────────────────────────────────────────

@billing_bp.route("/<int:sale_id>/pdf", methods=["GET"])
@login_required
def get_invoice_pdf(sale_id: int):
    sale = db.session.get(RetailSale, sale_id)
    if not sale:
        return jsonify({"error": "Sale not found"}), 404

    settings = _get_settings()
    html = render_invoice_html(sale, settings)

    try:
        pdf_bytes = generate_invoice_pdf(html)
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{sale.invoice_number}.pdf",
        )
    except ImportError:
        # WeasyPrint / GTK not available — serve HTML as fallback
        return Response(
            html,
            mimetype="text/html",
            headers={
                "Content-Disposition": f'attachment; filename="{sale.invoice_number}.html"'
            },
        )


# ── Invoice HTML preview ───────────────────────────────────────────────────────

@billing_bp.route("/<int:sale_id>/preview", methods=["GET"])
@login_required
def get_invoice_preview(sale_id: int):
    sale = db.session.get(RetailSale, sale_id)
    if not sale:
        return jsonify({"error": "Sale not found"}), 404
    settings = _get_settings()
    html = render_invoice_html(sale, settings)
    
    # If print query param is present, inject auto-print script
    if request.args.get("print") == "true":
        html = html.replace("</body>", "<script>window.onload = function() { window.print(); }</script></body>")
        
    return Response(html, mimetype="text/html")


# ── Thermal print ──────────────────────────────────────────────────────────────

@billing_bp.route("/<int:sale_id>/print", methods=["POST"])
@login_required
@require_roles("owner", "manager", "cashier")
def print_receipt(sale_id: int):
    sale = db.session.get(RetailSale, sale_id)
    if not sale:
        return jsonify({"error": "Sale not found"}), 404

    settings = _get_settings()
    printer_config = {k: v for k, v in settings.items() if k.startswith("printer_")}

    try:
        print_thermal_receipt(sale, printer_config)
        return jsonify({"message": "Receipt printed successfully"}), 200
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 422


@billing_bp.route("/return", methods=["POST"])
@login_required
@require_roles("owner", "manager", "cashier")
def record_sale_return():
    """Record product return, update product stock, and optionally credit/refund customer dues based on invoice."""
    data = request.get_json(silent=True) or {}
    invoice_number = data.get("invoiceNumber")
    product_id = data.get("productId")
    qty_val = data.get("quantity")
    refund_method = (data.get("refundMethod") or "cash").strip() # cash or credit
    notes = (data.get("notes") or "").strip() or None

    if not product_id or qty_val is None:
        return jsonify({"error": "ProductId and Quantity are required"}), 422

    try:
        quantity = float(qty_val)
        if quantity <= 0:
            return jsonify({"error": "Quantity must be greater than zero"}), 422
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid quantity format"}), 422

    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found"}), 404

    sale = None
    customer_id = data.get("customerId")
    unit_price = product.selling_price

    if invoice_number:
        # Find invoice
        sale = db.session.execute(
            db.select(RetailSale).where(RetailSale.invoice_number == invoice_number.strip())
        ).scalar_one_or_none()
        if not sale:
            return jsonify({"error": f"Invoice '{invoice_number}' not found"}), 404
        
        # Check if product is in the invoice
        sale_item = next((item for item in sale.items if item.product_id == product_id), None)
        if not sale_item:
            return jsonify({"error": f"Product '{product.name}' was not purchased in invoice {invoice_number}"}), 422
        
        # Use selling price from invoice
        unit_price = sale_item.unit_price
        
        # Validate returned quantity
        if quantity > sale_item.quantity:
            return jsonify({"error": f"Cannot return {quantity} {product.unit}; only {sale_item.quantity} was purchased"}), 422
        
        # Get customer from invoice
        if sale.customer_id:
            customer_id = sale.customer_id

    # Calculate refund value based on the selling price used
    refund_value = int(Decimal(str(quantity)) * unit_price)

    try:
        # 1. Update product stock (rounded to 4 decimal places)
        product.current_stock = round(product.current_stock + quantity, 4)

        # 2. Handle refund as credit if requested and customer is set
        customer = None
        if refund_method == "credit" and customer_id:
            customer = db.session.get(Customer, customer_id)
            if not customer:
                return jsonify({"error": "Customer not found"}), 404

            # Update customer balance
            customer.outstanding_balance = max(0, customer.outstanding_balance - refund_value)
            customer.opening_balance = customer.outstanding_balance

            # If return is linked to an invoice, pay off that invoice's credit entry first
            applied_amount = refund_value
            if sale:
                specific_ledger = db.session.execute(
                    db.select(CreditLedger)
                    .where(CreditLedger.sale_id == sale.id)
                    .where(CreditLedger.status != "paid")
                ).scalar_one_or_none()
                if specific_ledger:
                    rem = specific_ledger.amount - specific_ledger.amount_paid
                    applied = min(applied_amount, rem)
                    p = Payment(
                        credit_ledger_id=specific_ledger.id,
                        amount=applied,
                        method="cash",
                        recorded_by_id=current_user.id,
                        notes=f"[RETURN-REFUND] Returned {quantity} {product.unit} of {product.name} from Invoice {invoice_number}"
                    )
                    db.session.add(p)
                    specific_ledger.amount_paid += applied
                    if specific_ledger.amount_paid >= specific_ledger.amount:
                        specific_ledger.status = "paid"
                        specific_ledger.paid_at = datetime.now(timezone.utc)
                    applied_amount -= applied

            # Apply remaining refund value to oldest unpaid credit ledger entries first
            if applied_amount > 0:
                unpaid_entries = db.session.execute(
                    db.select(CreditLedger)
                    .where(CreditLedger.customer_id == customer.id)
                    .where(CreditLedger.status != "paid")
                    .order_by(CreditLedger.due_date.asc())
                ).scalars().all()

                for entry in unpaid_entries:
                    if applied_amount <= 0:
                        break

                    rem = entry.amount - entry.amount_paid
                    if applied_amount >= rem:
                        p = Payment(
                            credit_ledger_id=entry.id,
                            amount=rem,
                            method="cash",
                            recorded_by_id=current_user.id,
                            notes=f"[RETURN-REFUND] Returned {quantity} {product.unit} of {product.name}"
                        )
                        db.session.add(p)
                        entry.amount_paid = entry.amount
                        entry.status = "paid"
                        entry.paid_at = datetime.now(timezone.utc)
                        applied_amount -= rem
                    else:
                        p = Payment(
                            credit_ledger_id=entry.id,
                            amount=applied_amount,
                            method="cash",
                            recorded_by_id=current_user.id,
                            notes=f"[RETURN-REFUND] Returned {quantity} {product.unit} of {product.name}"
                        )
                        db.session.add(p)
                        entry.amount_paid += applied_amount
                        entry.status = "due"
                        applied_amount = 0

        db.session.commit()
        return jsonify({
            "message": "Product return processed successfully",
            "refundAmount": refund_value,
            "newStock": product.current_stock,
            "customerOutstanding": customer.outstanding_balance if customer else None
        }), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Return failed: {exc}"}), 500


@billing_bp.route("/<int:sale_id>", methods=["PUT"])
@login_required
@require_roles("owner", "manager", "accountant")
def update_sale(sale_id: int):
    """Update a retail sale, reverting old stocks and applying new ones, adjusting dues."""
    sale = db.session.get(RetailSale, sale_id)
    if not sale:
        return jsonify({"error": "Sale not found"}), 404

    data = request.get_json(silent=True) or {}
    raw_items = data.get("items") or []
    if not raw_items:
        return jsonify({"error": "At least one item is required"}), 422

    discount_rs = data.get("discount", 0)
    discount = _rupees_to_paise(discount_rs)
    payment_method = data.get("paymentMethod") or sale.payment_method
    cash_paid_rs = data.get("cashPaid")
    cash_paid = _rupees_to_paise(cash_paid_rs) if cash_paid_rs is not None else None

    try:
        # 1. Revert old stock changes
        for item in sale.items:
            prod = item.product
            if prod:
                prod.current_stock = round(prod.current_stock + item.quantity, 4)

        # 2. Delete old SaleItems
        db.session.execute(
            db.delete(SaleItem).where(SaleItem.sale_id == sale.id)
        )

        # 3. Process new items and calculate subtotal
        subtotal = 0
        new_items = []
        for i, item_data in enumerate(raw_items):
            prod_id = item_data.get("productId")
            qty = float(item_data.get("quantity", 0))
            rate_rs = item_data.get("unitPrice")
            rate = _rupees_to_paise(rate_rs)

            if not prod_id or qty <= 0:
                db.session.rollback()
                return jsonify({"error": f"Invalid product or quantity for item at index {i}"}), 422

            prod = db.session.get(Product, prod_id)
            if not prod:
                db.session.rollback()
                return jsonify({"error": f"Product {prod_id} not found"}), 404

            item_subtotal = int(Decimal(str(qty)) * rate)
            subtotal += item_subtotal

            # Decrement new stock
            prod.current_stock = round(prod.current_stock - qty, 4)
            prod.selling_price = rate

            new_items.append(SaleItem(
                sale_id=sale.id,
                product_id=prod_id,
                quantity=qty,
                unit_price=rate,
                subtotal=item_subtotal
            ))

        for ni in new_items:
            db.session.add(ni)

        new_total = subtotal - discount + sale.tax
        old_total = sale.total

        # 4. Handle Customer Dues Adjustment if customer is set
        customer = sale.customer
        if customer:
            old_net_due_change = old_total - sale.amount_paid
            customer.outstanding_balance = max(0, customer.outstanding_balance - old_net_due_change)

            # Delete old credit ledger entries and payment entries
            for ledger in list(sale.credit_entries):
                db.session.execute(
                    db.delete(Payment).where(Payment.credit_ledger_id == ledger.id)
                )
            sale.credit_entries.clear()
            db.session.flush()

            # Now recalculate and apply new dues change
            amt_paid = 0
            if payment_method in ("upi", "bank"):
                amt_paid = new_total
            elif payment_method == "cash":
                amt_paid = cash_paid if cash_paid is not None else new_total
            elif payment_method == "credit":
                amt_paid = cash_paid if cash_paid is not None else 0

            # Update sale totals
            sale.subtotal = subtotal
            sale.discount = discount
            sale.total = new_total
            sale.payment_method = payment_method
            sale.amount_paid = amt_paid
            
            # Apply new dues change
            if payment_method in ("cash", "upi", "bank"):
                if amt_paid < new_total:
                    shortage = new_total - amt_paid
                    customer.outstanding_balance += shortage
                    db.session.add(CreditLedger(
                        customer_id=customer.id,
                        sale_id=sale.id,
                        invoice_ref=sale.invoice_number,
                        amount=shortage,
                        amount_paid=0,
                        due_date=date.today() + timedelta(days=30),
                        status="due"
                    ))
                elif amt_paid > new_total:
                    surplus = amt_paid - new_total
                    customer.outstanding_balance = max(0, customer.outstanding_balance - surplus)
                    applied_amount = surplus
                    unpaid_entries = db.session.execute(
                        db.select(CreditLedger)
                        .where(CreditLedger.customer_id == customer.id)
                        .where(CreditLedger.status != "paid")
                        .order_by(CreditLedger.due_date.asc())
                    ).scalars().all()
                    for entry in unpaid_entries:
                        if applied_amount <= 0:
                            break
                        rem = entry.amount - entry.amount_paid
                        applied = min(applied_amount, rem)
                        p = Payment(
                            credit_ledger_id=entry.id,
                            amount=applied,
                            method=payment_method,
                            recorded_by_id=current_user.id,
                            notes=f"[{payment_method.upper()}-SURPLUS] Applied from edited Sale {sale.invoice_number}"
                        )
                        db.session.add(p)
                        entry.amount_paid += applied
                        if entry.amount_paid >= entry.amount:
                            entry.status = "paid"
                            entry.paid_at = datetime.now(timezone.utc)
                        applied_amount -= applied

            elif payment_method == "credit":
                paid_now = min(amt_paid, new_total)
                credit_amount = new_total - paid_now
                customer.outstanding_balance += credit_amount
                
                ledger = CreditLedger(
                    customer_id=customer.id,
                    sale_id=sale.id,
                    invoice_ref=sale.invoice_number,
                    amount=new_total,
                    amount_paid=paid_now,
                    due_date=date.today() + timedelta(days=30),
                    status="paid" if paid_now >= new_total else "due_soon" if paid_now > 0 else "due",
                )
                db.session.add(ledger)
                db.session.flush()
                if paid_now > 0:
                    p = Payment(
                        credit_ledger_id=ledger.id,
                        amount=paid_now,
                        method="cash",
                        recorded_by_id=current_user.id,
                        notes=f"[POS Credit Downpayment] Paid Rs{paid_now/100:.2f} during edited checkout"
                    )
                    db.session.add(p)
            
            customer.opening_balance = customer.outstanding_balance

        else:
            # Non-registered customer
            sale.subtotal = subtotal
            sale.discount = discount
            sale.total = new_total
            sale.payment_method = payment_method
            sale.amount_paid = new_total

        sale.notes = f"{sale.notes or ''}\n[EDIT LOG - {datetime.now().strftime('%Y-%m-%d')}] Edited invoice items/pricing.".strip()
        db.session.commit()
        return jsonify({"data": sale.to_dict(), "message": "Invoice updated successfully"}), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to edit invoice: {exc}"}), 500


@billing_bp.route("/sale/<int:sale_id>", methods=["DELETE"])
@login_required
@require_roles("owner", "manager")
def delete_sale(sale_id: int):
    """Delete a sale, restore inventory stock, and reconcile customer balances/credit ledger."""
    sale = db.session.get(RetailSale, sale_id)
    if not sale:
        return jsonify({"error": "Sale not found"}), 404
        
    try:
        # 1. Restore product inventory stock
        for item in sale.items:
            if item.product:
                # Add back the quantity sold
                item.product.stock = (item.product.stock or 0) + item.quantity
                
        # 2. Reconcile customer balances if customer is linked
        if sale.customer:
            # We need to deduct the total sale amount from customer's outstanding balance
            # and add back the amount paid!
            # Since sale.total was added to the outstanding balance and sale.amount_paid was paid,
            # the net increase was: sale.total - sale.amount_paid.
            # So we subtract (sale.total - sale.amount_paid) from customer's outstanding_balance!
            net_sale_effect = sale.total - sale.amount_paid
            sale.customer.outstanding_balance = max(0, sale.customer.outstanding_balance - net_sale_effect)
            sale.customer.opening_balance = sale.customer.outstanding_balance
            
            # 3. Delete associated payments first to avoid foreign key violations
            # First fetch ledger IDs
            ledgers = db.session.execute(
                db.select(CreditLedger.id).where(CreditLedger.sale_id == sale_id)
            ).scalars().all()
            if ledgers:
                db.session.execute(
                    db.delete(Payment).where(Payment.credit_ledger_id.in_(ledgers))
                )
            
            # 4. Now delete CreditLedger entries
            db.session.execute(
                db.delete(CreditLedger).where(CreditLedger.sale_id == sale_id)
            )

        # 5. Delete the sale itself (will cascade delete SaleItems)
        db.session.delete(sale)
        db.session.commit()
        return jsonify({"message": "Sale deleted and inventory restored successfully"}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete sale: {exc}"}), 500


