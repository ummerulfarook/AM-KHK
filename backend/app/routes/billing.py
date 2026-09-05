"""
Billing (POS) blueprint — full retail sale implementation.

Create sale is atomic:
  1. Validate products and stock
  2. Write RetailSale + SaleItems
  3. Decrement stock on each product
  4. Write CreditLedger if payment_method == 'credit'
  5. Write ReturnTransaction + ReturnItems for any returns
  6. If return references an original invoice, process credit-ledger adjustment
  7. Increment invoice sequence in settings
  All in one db.session.commit() — rolls back on any error.
"""
import io
import json as _json
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal

from flask import Blueprint, request, jsonify, send_file, Response
from flask_login import login_required, current_user
from sqlalchemy import func, or_

from app import db
from app.models.sale import RetailSale, SaleItem, ReturnTransaction, ReturnItem
from app.models.product import Product
from app.models.customer import Customer
from app.models.credit import CreditLedger, Payment
from app.models.settings import Setting
from app.schemas.billing_schema import CreateSaleRequest
from app.services.invoice_service import (
    render_invoice_html, generate_invoice_pdf, print_thermal_receipt,
    render_return_bill_html,
)
from app.utils.role_guard import require_roles

billing_bp = Blueprint("billing", __name__, url_prefix="/api/billing")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _rupees_to_paise(val) -> int:
    try:
        return int(Decimal(str(val)) * 100)
    except Exception:
        return 0


def _get_settings() -> dict:
    """Fetch all settings as a plain dict."""
    rows = db.session.execute(db.select(Setting)).scalars().all()
    return {r.key: r.value for r in rows}


def _next_return_number(settings: dict, sale_date: datetime) -> str:
    """Generate return bill number and bump the sequence."""
    prefix = settings.get("return_prefix", "RET")
    seq = int(settings.get("return_next", "1"))
    ret_num = f"{prefix}-{sale_date.year}{sale_date.month:02d}-{seq:04d}"

    row = db.session.execute(
        db.select(Setting).where(Setting.key == "return_next")
    ).scalar_one_or_none()
    if row:
        row.value = str(seq + 1)
    else:
        db.session.add(Setting(key="return_next", value=str(seq + 1)))
    return ret_num


def allocate_sale_payments(customer, total, total_received, cash_received, upi_received, bank_received, invoice_number, sale_date, invoice_to_pay=None):
    # This helper function distributes the total payment received following the priority:
    # 1. Previous Customer Balance (unpaid CreditLedger entries)
    # 2. Current Invoice
    # 3. Remaining Advance (does not create Payment records, represented in the customer balance)
    # Returns (amt_paid_on_sale, shortage_on_sale, surplus_on_sale, current_sale_allocations, cash_received, upi_received, bank_received)

    remaining_payment = total_received

    def allocate_from_pools(amount, cash_pool, upi_pool, bank_pool):
        allocations = []
        left = amount
        if cash_pool > 0 and left > 0:
            alloc = min(left, cash_pool)
            allocations.append(("cash", alloc))
            cash_pool -= alloc
            left -= alloc
        if upi_pool > 0 and left > 0:
            alloc = min(left, upi_pool)
            allocations.append(("upi", alloc))
            upi_pool -= alloc
            left -= alloc
        if bank_pool > 0 and left > 0:
            alloc = min(left, bank_pool)
            allocations.append(("bank", alloc))
            bank_pool -= alloc
            left -= alloc
        return allocations, cash_pool, upi_pool, bank_pool

    allocated_to_prev = 0

    if customer and remaining_payment > 0:
        # Step 1: Allocate to previous dues first
        unpaid_entries = []

        # Check if there is a specific invoice to pay first
        if invoice_to_pay:
            specific_entry = db.session.execute(
                db.select(CreditLedger)
                .where(CreditLedger.customer_id == customer.id)
                .where(CreditLedger.invoice_ref == invoice_to_pay)
                .where(CreditLedger.status != "paid")
            ).scalar_one_or_none()
            if specific_entry:
                unpaid_entries.append(specific_entry)

        # Get all other unpaid entries ordered by due date
        stmt = db.select(CreditLedger).where(CreditLedger.customer_id == customer.id).where(CreditLedger.status != "paid")
        if invoice_to_pay:
            stmt = stmt.where(CreditLedger.invoice_ref != invoice_to_pay)

        other_unpaid = db.session.execute(
            stmt.order_by(CreditLedger.due_date.asc(), CreditLedger.id.asc())
        ).scalars().all()

        unpaid_entries.extend(other_unpaid)

        for entry in unpaid_entries:
            if remaining_payment <= 0:
                break
            rem = entry.amount - entry.amount_paid
            applied = min(remaining_payment, rem)
            if applied > 0:
                allocations, cash_received, upi_received, bank_received = allocate_from_pools(
                    applied, cash_received, upi_received, bank_received
                )
                for method, alloc_amt in allocations:
                    db.session.add(Payment(
                        credit_ledger_id=entry.id,
                        amount=alloc_amt,
                        method=method,
                        recorded_by_id=current_user.id,
                        notes=f"[{method.upper()}-PREV-DUE] Applied from Sale {invoice_number}",
                        recorded_at=sale_date,
                    ))
                entry.amount_paid += applied
                if entry.amount_paid >= entry.amount:
                    entry.status = "paid"
                    entry.paid_at = sale_date
                remaining_payment -= applied
                allocated_to_prev += applied

    # Step 2: Settle the current invoice
    amt_paid = min(remaining_payment, total)
    shortage = total - amt_paid
    surplus = remaining_payment - amt_paid

    current_sale_allocations = []
    if amt_paid > 0:
        current_sale_allocations, cash_received, upi_received, bank_received = allocate_from_pools(
            amt_paid, cash_received, upi_received, bank_received
        )

    return amt_paid, shortage, surplus, current_sale_allocations, cash_received, upi_received, bank_received


def _next_invoice_number(settings: dict, custom_date: datetime | None = None) -> str:
    """Generate invoice number and bump the sequence."""
    prefix = settings.get("invoice_prefix", "INV")
    seq = int(settings.get("invoice_next", "1"))
    now = custom_date if custom_date else datetime.now(timezone.utc)
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


def _process_return_line_credit(return_line_req, product, sale, quantity, refund_value, customer, current_sale_inv_num, sale_date):
    """
    When a return is linked to an original invoice and refund_method='credit',
    apply the refund_value against the original invoice's credit ledger entry,
    then spill to older dues.
    """
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
                notes=f"[RETURN-REFUND] Returned {quantity} of {return_line_req.label} from Invoice {sale.invoice_number}"
            )
            db.session.add(p)
            specific_ledger.amount_paid += applied
            if specific_ledger.amount_paid >= specific_ledger.amount:
                specific_ledger.status = "paid"
                specific_ledger.paid_at = sale_date
            applied_amount -= applied

    if applied_amount > 0 and customer:
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
                    notes=f"[RETURN-REFUND] Returned {quantity} of {return_line_req.label}"
                )
                db.session.add(p)
                entry.amount_paid = entry.amount
                entry.status = "paid"
                entry.paid_at = sale_date
                applied_amount -= rem
            else:
                p = Payment(
                    credit_ledger_id=entry.id,
                    amount=applied_amount,
                    method="cash",
                    recorded_by_id=current_user.id,
                    notes=f"[RETURN-REFUND] Returned {quantity} of {return_line_req.label}"
                )
                db.session.add(p)
                entry.amount_paid += applied_amount
                entry.status = "due"
                applied_amount = 0


# ── Create sale ────────────────────────────────────────────────────────────────

@billing_bp.route("/", methods=["POST"])
@login_required
@require_roles("owner", "manager", "cashier")
def create_sale():
    """Atomic POS sale creation with optional returns during billing."""
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
        products_map[item_req.product_id] = p

    try:
        from app.utils.date_helper import get_working_date
        sale_date = get_working_date()

        settings = _get_settings()
        inv_num = _next_invoice_number(settings, custom_date=sale_date)

        # Compute totals — standalone discount + return total both reduce the bill
        subtotal = sum(i.subtotal for i in req.items)
        total_discount = req.total_discount  # discount + returns
        total = subtotal - total_discount + req.tax

        # Determine previous balance
        prev_bal = customer.outstanding_balance if customer else 0

        # Calculate split payments received
        cash_received = 0
        upi_received = 0
        bank_received = 0

        # Check if explicit split amounts are sent
        if req.cash_paid is not None or req.upi_paid is not None or req.bank_paid is not None:
            cash_received = req.cash_paid or 0
            upi_received = req.upi_paid or 0
            bank_received = req.bank_paid or 0
        else:
            # Fallback to single payment method
            if req.payment_method == "cash":
                cash_received = total
            elif req.payment_method == "upi":
                upi_received = total
            elif req.payment_method == "bank":
                bank_received = total
            elif req.payment_method == "credit":
                pass

        total_received = cash_received + upi_received + bank_received

        amt_paid, shortage, surplus, current_sale_allocations, cash_rem, upi_rem, bank_rem = allocate_sale_payments(
            customer=customer,
            total=total,
            total_received=total_received,
            cash_received=cash_received,
            upi_received=upi_received,
            bank_received=bank_received,
            invoice_number=inv_num,
            sale_date=sale_date,
            invoice_to_pay=req.invoice_to_pay
        )

        # Serialise return lines (returns + deductions) to JSON for storage on invoice
        all_returns = req.all_return_lines
        deductions_json = None
        if all_returns:
            deductions_json = _json.dumps([
                {
                    "label": r.label,
                    "qty": r.qty,
                    "unitPrice": r.unit_price,
                    "subtotal": r.subtotal,
                    "productId": r.product_id,
                    "originalInvoiceRef": r.original_invoice_ref,
                }
                for r in all_returns
            ])

        # Write sale
        sale = RetailSale(
            invoice_number=inv_num,
            customer_id=req.customer_id,
            store_id=req.store_id,
            cashier_id=current_user.id,
            payment_method=req.payment_method,
            upi_id=req.upi_id,
            bank_name=req.bank_name,
            subtotal=subtotal,
            discount=total_discount,   # stored as combined discount+returns total
            tax=req.tax,
            total=total,
            notes=req.notes,
            amount_paid=total_received,
            cash_received=cash_received,
            upi_received=upi_received,
            bank_received=bank_received,
            previous_balance=prev_bal,
            partner=customer.partner if customer else "neutral",
            billing_customer_name=req.billing_customer_name,
            billing_customer_phone=req.billing_customer_phone,
            created_at=sale_date,
            deductions=deductions_json,
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
                boxes=item_req.boxes,
                box_weight=item_req.box_weight,
            ))
            p.current_stock = round(p.current_stock - item_req.quantity, 4)
            p.selling_price = item_req.unit_price

        # Update customer dues balance
        if customer:
            customer.outstanding_balance = customer.outstanding_balance + total - total_received

        # If it's a credit sale, or if there's any unpaid shortage left on a sale
        if customer and (req.payment_method == "credit" or shortage > 0):
            credit_days = req.credit_days if req.credit_days is not None else int(settings.get("credit_days", "30"))
            due = sale_date.date() + timedelta(days=credit_days)

            ledger = CreditLedger(
                customer_id=req.customer_id,
                sale_id=sale.id,
                invoice_ref=inv_num,
                amount=total,
                amount_paid=amt_paid,
                due_date=due,
                status="paid" if amt_paid >= total else "due_soon" if amt_paid > 0 else "due",
                created_at=sale_date,
            )
            db.session.add(ledger)
            db.session.flush()

            for method, alloc_amt in current_sale_allocations:
                db.session.add(Payment(
                    credit_ledger_id=ledger.id,
                    amount=alloc_amt,
                    method=method,
                    recorded_by_id=current_user.id,
                    notes=f"[POS Downpayment] {method.capitalize()} paid during checkout",
                    recorded_at=sale_date,
                ))

            sale.notes = f"{sale.notes or ''}\nPrevious Dues Priority Checkout. Total: Rs{total/100:.2f} | Paid: Rs{total_received/100:.2f} | Remaining Dues: Rs{max(0, shortage)/100:.2f}".strip()
        else:
            sale.notes = f"{sale.notes or ''}\nPaid: Rs{total_received/100:.2f} (exact payment)".strip()

        # ── Write ReturnTransactions for any return lines ─────────────────────
        if all_returns:
            # Group by original_invoice_ref so each unique invoice gets its own ReturnTransaction
            # Lines with no invoice ref all go into a single "unlinked" transaction
            groups: dict[str | None, list] = {}
            for r in all_returns:
                key = r.original_invoice_ref  # None or invoice string
                groups.setdefault(key, []).append(r)

            for inv_ref, lines in groups.items():
                ret_num = _next_return_number(settings, sale_date)
                original_sale = None
                if inv_ref:
                    original_sale = db.session.execute(
                        db.select(RetailSale).where(RetailSale.invoice_number == inv_ref)
                    ).scalar_one_or_none()

                grp_total = sum(r.subtotal for r in lines)

                rt = ReturnTransaction(
                    return_number=ret_num,
                    current_sale_id=sale.id,
                    original_sale_id=original_sale.id if original_sale else None,
                    original_invoice_ref=inv_ref,
                    customer_id=customer.id if customer else None,
                    cashier_id=current_user.id,
                    total_return_value=grp_total,
                    created_at=sale_date,
                )
                db.session.add(rt)
                db.session.flush()

                for r in lines:
                    product = db.session.get(Product, r.product_id) if r.product_id else None
                    # Restore stock for actual product returns
                    if product:
                        product.current_stock = round(product.current_stock + r.qty, 4)

                    db.session.add(ReturnItem(
                        return_transaction_id=rt.id,
                        product_id=r.product_id,
                        label=r.label,
                        quantity=r.qty,
                        unit_price=r.unit_price,
                        subtotal=r.subtotal,
                        original_invoice_ref=inv_ref,
                    ))

                # If linked to an original invoice and customer is set, credit the ledger
                if inv_ref and original_sale and customer:
                    customer.outstanding_balance = customer.outstanding_balance - grp_total
                    _process_return_line_credit(
                        return_line_req=type('R', (), {'label': f'Return for {inv_ref}'})(),
                        product=None,
                        sale=original_sale,
                        quantity=sum(r.qty for r in lines),
                        refund_value=grp_total,
                        customer=customer,
                        current_sale_inv_num=inv_num,
                        sale_date=sale_date,
                    )

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


# ── Invoice lookup (search by partial number or customer) ──────────────────────

@billing_bp.route("/invoice-lookup", methods=["GET"])
@login_required
def invoice_lookup():
    """
    Search for invoices by invoice number, customer_id, customer name, or phone.
    Returns matching sales.
    """
    query_str = (request.args.get("q") or "").strip()
    customer_id = request.args.get("customerId", type=int)
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(1000, request.args.get("perPage", 100, type=int))

    stmt = db.select(RetailSale)

    if query_str:
        stmt = stmt.where(
            or_(
                RetailSale.invoice_number.ilike(f"%{query_str}%"),
                RetailSale.billing_customer_name.ilike(f"%{query_str}%"),
                RetailSale.billing_customer_phone.ilike(f"%{query_str}%")
            )
        )

    if customer_id:
        customer = db.session.get(Customer, customer_id)
        if customer:
            conditions = [RetailSale.customer_id == customer_id]
            if customer.name:
                conditions.append(func.lower(RetailSale.billing_customer_name) == customer.name.lower())
            if customer.phone:
                conditions.append(RetailSale.billing_customer_phone == customer.phone)
            stmt = stmt.where(or_(*conditions))
        else:
            stmt = stmt.where(RetailSale.customer_id == customer_id)

    total = db.session.execute(
        db.select(func.count()).select_from(stmt.subquery())
    ).scalar() or 0

    sales = db.session.execute(
        stmt.order_by(RetailSale.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).scalars().all()

    return jsonify({
        "data": [
            {
                "id": s.id,
                "invoiceNumber": s.invoice_number,
                "customerName": s.customer.name if s.customer else (s.billing_customer_name or "Walk-in"),
                "total": s.total,
                "createdAt": s.created_at.isoformat(),
                "itemCount": len(s.items),
            }
            for s in sales
        ],
        "pagination": {"page": page, "perPage": per_page, "total": total},
    }), 200


# ── Items for return (shows qty already returned) ──────────────────────────────

@billing_bp.route("/<int:sale_id>/items-for-return", methods=["GET"])
@login_required
def get_items_for_return(sale_id: int):
    """
    Returns the items of an invoice with remaining returnable quantities.
    Validates already-returned quantities from ReturnItems.
    """
    sale = db.session.get(RetailSale, sale_id)
    if not sale:
        return jsonify({"error": "Sale not found"}), 404

    # Calculate already returned quantities per product for this original invoice
    already_returned: dict[int, float] = {}
    ret_items = db.session.execute(
        db.select(ReturnItem)
        .join(ReturnTransaction, ReturnItem.return_transaction_id == ReturnTransaction.id)
        .where(ReturnTransaction.original_sale_id == sale_id)
        .where(ReturnItem.product_id.isnot(None))
    ).scalars().all()

    for ri in ret_items:
        already_returned[ri.product_id] = already_returned.get(ri.product_id, 0) + ri.quantity

    result = []
    for item in sale.items:
        returned_qty = already_returned.get(item.product_id, 0)
        available = max(0, round(item.quantity - returned_qty, 4))
        result.append({
            "saleItemId": item.id,
            "productId": item.product_id,
            "productName": item.product.name if item.product else "Unknown",
            "unit": item.product.unit if item.product else "",
            "originalQty": item.quantity,
            "alreadyReturned": returned_qty,
            "availableToReturn": available,
            "unitPrice": item.unit_price,
        })

    return jsonify({"data": result, "invoiceNumber": sale.invoice_number}), 200


# ── Return transactions on a sale ──────────────────────────────────────────────

@billing_bp.route("/<int:sale_id>/returns", methods=["GET"])
@login_required
def get_sale_returns(sale_id: int):
    """List all return transactions that reference a sale (as original or current)."""
    sale = db.session.get(RetailSale, sale_id)
    if not sale:
        return jsonify({"error": "Sale not found"}), 404

    # Returns where this sale was the original invoice being returned against
    as_original = db.session.execute(
        db.select(ReturnTransaction).where(ReturnTransaction.original_sale_id == sale_id)
    ).scalars().all()

    # Returns created during this sale (embedded returns)
    as_current = sale.return_transactions

    all_rt = {rt.id: rt for rt in list(as_original) + list(as_current)}

    return jsonify({
        "data": [rt.to_dict() for rt in all_rt.values()],
        "originalInvoiceReturns": [rt.to_dict() for rt in as_original],
        "embeddedReturns": [rt.to_dict() for rt in as_current],
    }), 200


# ── Single return transaction ──────────────────────────────────────────────────

@billing_bp.route("/returns/<int:return_id>", methods=["GET"])
@login_required
def get_return_transaction(return_id: int):
    rt = db.session.get(ReturnTransaction, return_id)
    if not rt:
        return jsonify({"error": "Return transaction not found"}), 404
    return jsonify({"data": rt.to_dict()}), 200


# ── Return bill preview (HTML) ──────────────────────────────────────────────────

@billing_bp.route("/returns/<int:return_id>/preview", methods=["GET"])
@login_required
def get_return_bill_preview(return_id: int):
    rt = db.session.get(ReturnTransaction, return_id)
    if not rt:
        return jsonify({"error": "Return transaction not found"}), 404
    settings = _get_settings()
    html = render_return_bill_html(rt, settings)

    if request.args.get("print") == "true":
        print_script = """
        <script>
            window.onload = function() {
                setTimeout(function() {
                    window.print();
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'RETURN_PRINT_DONE' }, '*');
                        }
                    } catch (e) {}
                }, 250);
            };
        </script>
        """
        html = html.replace("</body>", f"{print_script}</body>")

    return Response(html, mimetype="text/html")


# ── Return bill PDF ─────────────────────────────────────────────────────────────

@billing_bp.route("/returns/<int:return_id>/pdf", methods=["GET"])
@login_required
def get_return_bill_pdf(return_id: int):
    rt = db.session.get(ReturnTransaction, return_id)
    if not rt:
        return jsonify({"error": "Return transaction not found"}), 404
    settings = _get_settings()
    html = render_return_bill_html(rt, settings)

    try:
        pdf_bytes = generate_invoice_pdf(html, sale=None, settings=settings)
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{rt.return_number or f'RET-{rt.id}'}.pdf",
        )
    except ImportError:
        return Response(
            html,
            mimetype="text/html",
            headers={"Content-Disposition": f'attachment; filename="{rt.return_number or rt.id}.html"'}
        )


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
        pdf_bytes = generate_invoice_pdf(html, sale=sale, settings=settings)
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{sale.invoice_number}.pdf",
        )
    except ImportError:
        import logging
        logging.getLogger(__name__).warning(
            "⚠️  PDF generation: Playwright/Chromium not installed on this machine. "
            "Run setup_pdf_engine.bat in the project root to install it. "
            "Serving HTML fallback instead."
        )
        return Response(
            html,
            mimetype="text/html",
            headers={
                "Content-Disposition": f'attachment; filename="{sale.invoice_number}.html"'
            },
        )


# ── PDF Diagnostics ────────────────────────────────────────────────────────────

@billing_bp.route("/pdf-diagnostics", methods=["GET"])
@login_required
def pdf_diagnostics():
    """
    Returns diagnostic info about the PDF generation setup on this machine.
    Open in browser: /api/billing/pdf-diagnostics
    """
    import os
    import sys
    from app.services.invoice_service import _TEMPLATE_DIR

    info = {
        "python_version": sys.version,
        "template_dir": _TEMPLATE_DIR,
        "invoice_html_path": os.path.join(_TEMPLATE_DIR, "invoice.html"),
        "invoice_html_exists": os.path.isfile(os.path.join(_TEMPLATE_DIR, "invoice.html")),
        "invoice_pdf_html_exists": os.path.isfile(os.path.join(_TEMPLATE_DIR, "invoice_pdf.html")),
    }

    # Check Playwright
    try:
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = r"C:\ms-playwright"
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            info["playwright_status"] = "✅ WORKING"
            info["chromium_version"] = browser.version
            browser.close()
    except ImportError:
        info["playwright_status"] = "❌ NOT INSTALLED"
        info["chromium_version"] = "N/A"
    except Exception as exc:
        info["playwright_status"] = f"❌ ERROR: {exc}"
        info["chromium_version"] = "N/A"

    # Check xhtml2pdf
    try:
        from xhtml2pdf import pisa
        info["xhtml2pdf_status"] = "✅ installed (fallback engine)"
    except ImportError:
        info["xhtml2pdf_status"] = "❌ not installed"

    if "✅ WORKING" in info.get("playwright_status", ""):
        info["active_pdf_engine"] = "✅ Playwright (NEW DESIGN - correct)"
    elif info["invoice_pdf_html_exists"]:
        info["active_pdf_engine"] = "⚠️ xhtml2pdf with OLD template invoice_pdf.html (WRONG)"
    else:
        info["active_pdf_engine"] = "⚠️ xhtml2pdf with invoice.html (partial fallback)"

    try:
        import subprocess
        result = subprocess.run(
            ["git", "log", "--oneline", "-3"],
            capture_output=True, text=True,
            cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        )
        info["git_log"] = result.stdout.strip()
    except Exception:
        info["git_log"] = "unavailable"

    return jsonify(info), 200


@billing_bp.route("/<int:sale_id>/preview", methods=["GET"])
@login_required
def get_invoice_preview(sale_id: int):
    sale = db.session.get(RetailSale, sale_id)
    if not sale:
        return jsonify({"error": "Sale not found"}), 404
    settings = _get_settings()
    html = render_invoice_html(sale, settings)

    # If print query param is present, inject auto-print script with postMessage signaling
    if request.args.get("print") == "true":
        print_script = """
        <script>
            window.onload = function() {
                setTimeout(function() {
                    window.print();
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'INVOICE_PRINT_DONE' }, '*');
                        }
                    } catch (e) {}
                }, 250);
            };
        </script>
        """
        html = html.replace("</body>", f"{print_script}</body>")

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


# ── Standalone return (existing endpoint — now also creates ReturnTransaction) ──

@billing_bp.route("/return", methods=["POST"])
@login_required
@require_roles("owner", "manager", "cashier")
def record_sale_return():
    """Record product return(s) (single or multi-item), update stock, original invoice deductions, total, credit/refund customer dues, and create ReturnTransaction record."""
    data = request.get_json(silent=True) or {}
    invoice_number = (data.get("invoiceNumber") or "").strip() or None
    refund_method = (data.get("refundMethod") or "cash").strip()  # cash or credit
    notes = (data.get("notes") or "").strip() or None
    customer_id = data.get("customerId")

    # Extract items payload: array of {productId, quantity}
    raw_items = data.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        # Fallback to single item payload for backward compat
        pid = data.get("productId")
        qval = data.get("quantity")
        if pid and qval is not None:
            raw_items = [{"productId": pid, "quantity": qval}]
        else:
            return jsonify({"error": "At least one product with quantity is required for return"}), 422

    sale = None
    if invoice_number:
        sale = db.session.execute(
            db.select(RetailSale).where(RetailSale.invoice_number == invoice_number)
        ).scalar_one_or_none()
        if not sale:
            return jsonify({"error": f"Invoice '{invoice_number}' not found"}), 404
        if sale.customer_id:
            customer_id = sale.customer_id

    validated_items = []
    total_refund_value = 0

    for item_data in raw_items:
        product_id = item_data.get("productId")
        qty_val = item_data.get("quantity")
        if not product_id or qty_val is None:
            return jsonify({"error": "Each item must have a valid productId and quantity"}), 422

        try:
            quantity = float(qty_val)
            if quantity <= 0:
                return jsonify({"error": "Item return quantity must be greater than zero"}), 422
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid quantity format"}), 422

        product = db.session.get(Product, product_id)
        if not product:
            return jsonify({"error": f"Product ID {product_id} not found"}), 404

        unit_price = product.selling_price

        if sale:
            sale_item = next((item for item in sale.items if item.product_id == product_id), None)
            if not sale_item:
                return jsonify({"error": f"Product '{product.name}' was not purchased in invoice {invoice_number}"}), 422

            unit_price = sale_item.unit_price

            # Calculate already returned quantity for this product on this original invoice
            already_returned = db.session.execute(
                db.select(func.sum(ReturnItem.quantity))
                .join(ReturnTransaction, ReturnItem.return_transaction_id == ReturnTransaction.id)
                .where(ReturnTransaction.original_sale_id == sale.id)
                .where(ReturnItem.product_id == product_id)
            ).scalar() or 0

            available = round(sale_item.quantity - already_returned, 4)
            if round(quantity, 4) > available + 0.0001:
                return jsonify({
                    "error": f"Cannot return {quantity} {product.unit} of '{product.name}'; only {available} available "
                             f"(originally purchased: {sale_item.quantity}, already returned: {already_returned})"
                }), 422

        item_refund = int(Decimal(str(quantity)) * unit_price)
        total_refund_value += item_refund

        validated_items.append({
            "product": product,
            "quantity": quantity,
            "unitPrice": unit_price,
            "subtotal": item_refund,
        })

    try:
        from app.utils.date_helper import get_working_date
        sale_date = get_working_date()
        settings = _get_settings()
        ret_num = _next_return_number(settings, sale_date)

        customer = None
        if customer_id:
            customer = db.session.get(Customer, customer_id)

        # 1. Create ReturnTransaction record
        rt = ReturnTransaction(
            return_number=ret_num,
            current_sale_id=None,
            original_sale_id=sale.id if sale else None,
            original_invoice_ref=invoice_number,
            customer_id=customer_id,
            cashier_id=current_user.id,
            total_return_value=total_refund_value,
            notes=notes,
            created_at=sale_date,
        )
        db.session.add(rt)
        db.session.flush()

        # 2. Add ReturnItems & update product stocks
        new_deductions_entries = []
        for v in validated_items:
            prod = v["product"]
            qty = v["quantity"]
            price = v["unitPrice"]
            sub = v["subtotal"]

            db.session.add(ReturnItem(
                return_transaction_id=rt.id,
                product_id=prod.id,
                label=prod.name,
                quantity=qty,
                unit_price=price,
                subtotal=sub,
                original_invoice_ref=invoice_number,
            ))

            # Restock inventory
            prod.current_stock = round(prod.current_stock + qty, 4)

            new_deductions_entries.append({
                "label": prod.name,
                "qty": qty,
                "unitPrice": price,
                "subtotal": sub,
                "productId": prod.id,
                "originalInvoiceRef": invoice_number,
            })

        # 3. Update original RetailSale deductions and total (if linked to an invoice)
        if sale:
            existing_deductions = []
            if sale.deductions:
                try:
                    existing_deductions = _json.loads(sale.deductions)
                except Exception:
                    existing_deductions = []
            existing_deductions.extend(new_deductions_entries)
            sale.deductions = _json.dumps(existing_deductions)

            # Update discount and total on sale
            sale.discount = (sale.discount or 0) + total_refund_value
            sale.total = max(0, sale.subtotal - sale.discount)

        # 4. Handle Customer Dues & Credit Ledger updates
        if customer:
            if refund_method == "credit" or (sale and sale.payment_method == "credit"):
                customer.outstanding_balance = customer.outstanding_balance - total_refund_value

            if sale and sale.payment_method == "credit":
                ledger = db.session.execute(
                    db.select(CreditLedger).where(CreditLedger.sale_id == sale.id)
                ).scalars().first()
                if ledger:
                    ledger.amount = max(0, ledger.amount - total_refund_value)
                    if ledger.amount <= ledger.amount_paid:
                        ledger.status = "paid"
                        ledger.paid_at = sale_date

        db.session.commit()

        return jsonify({
            "message": "Product return processed successfully",
            "refundAmount": total_refund_value,
            "returnNumber": ret_num,
            "returnTransactionId": rt.id,
            "customerOutstanding": customer.outstanding_balance if customer else None,
            "invoiceNumber": invoice_number,
            "updatedInvoiceTotal": sale.total if sale else None,
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

    # Parse itemised returns (new field) + backward-compat deductions
    raw_returns = (data.get("returns") or []) + (data.get("deductions") or [])
    returns_parsed = []
    for d in raw_returns:
        try:
            label = (d.get("label") or "").strip()
            if not label:
                continue
            qty = float(d.get("qty", 1))
            up = _rupees_to_paise(d.get("unitPrice", 0))
            subtotal_d = int(Decimal(str(qty)) * up)
            returns_parsed.append({
                "label": label, "qty": qty, "unitPrice": up, "subtotal": subtotal_d,
                "productId": d.get("productId"),
                "originalInvoiceRef": (d.get("originalInvoiceRef") or "").strip() or None,
            })
        except Exception:
            pass
    return_total = sum(d["subtotal"] for d in returns_parsed)
    discount += return_total
    deductions_json = _json.dumps(returns_parsed) if returns_parsed else None

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
            customer.outstanding_balance = customer.outstanding_balance - old_net_due_change

            # Delete old credit ledger entries and payment entries of this sale
            for ledger in list(sale.credit_entries):
                db.session.execute(
                    db.delete(Payment).where(Payment.credit_ledger_id == ledger.id)
                )
                db.session.delete(ledger)
            sale.credit_entries.clear()
            db.session.flush()

            # Find and revert any surplus payments applied from this sale to other credit ledger entries
            from sqlalchemy import or_
            pattern = f"%Applied from Sale {sale.invoice_number}"
            pattern_edit = f"%Applied from edited Sale {sale.invoice_number}"
            surplus_payments = db.session.execute(
                db.select(Payment).where(
                    or_(
                        Payment.notes.like(pattern),
                        Payment.notes.like(pattern_edit)
                    )
                )
            ).scalars().all()
            for sp in surplus_payments:
                target_ledger = sp.credit_entry
                if target_ledger:
                    target_ledger.amount_paid = max(0, target_ledger.amount_paid - sp.amount)
                    target_ledger.status = "due"
                    target_ledger.paid_at = None
                db.session.delete(sp)
            db.session.flush()

            sale.previous_balance = customer.outstanding_balance

            amt_paid = 0
            if payment_method in ("upi", "bank"):
                amt_paid = new_total
            elif payment_method == "cash":
                amt_paid = cash_paid if cash_paid is not None else new_total
            elif payment_method == "credit":
                amt_paid = cash_paid if cash_paid is not None else 0

            total_received = amt_paid
            cash_received = total_received if payment_method == "cash" else 0
            upi_received = total_received if payment_method == "upi" else 0
            bank_received = total_received if payment_method == "bank" else 0
            if payment_method == "credit" and cash_paid is not None:
                cash_received = cash_paid

            allocated_amt, shortage, surplus, current_sale_allocations, cash_rem, upi_rem, bank_rem = allocate_sale_payments(
                customer=customer,
                total=new_total,
                total_received=total_received,
                cash_received=cash_received,
                upi_received=upi_received,
                bank_received=bank_received,
                invoice_number=sale.invoice_number,
                sale_date=sale.created_at,
            )

            customer.outstanding_balance = customer.outstanding_balance + new_total - total_received

            sale.subtotal = subtotal
            sale.discount = discount
            sale.total = new_total
            sale.payment_method = payment_method
            sale.amount_paid = total_received

            if payment_method == "credit" or shortage > 0:
                ledger = CreditLedger(
                    customer_id=customer.id,
                    sale_id=sale.id,
                    invoice_ref=sale.invoice_number,
                    amount=new_total,
                    amount_paid=allocated_amt,
                    due_date=date.today() + timedelta(days=30),
                    status="paid" if allocated_amt >= new_total else "due_soon" if allocated_amt > 0 else "due",
                )
                db.session.add(ledger)
                db.session.flush()

                for method, alloc_amt in current_sale_allocations:
                    db.session.add(Payment(
                        credit_ledger_id=ledger.id,
                        amount=alloc_amt,
                        method=method,
                        recorded_by_id=current_user.id,
                        notes=f"[POS Downpayment] {method.capitalize()} paid during edited checkout",
                        recorded_at=sale.created_at,
                    ))
            pass

        else:
            sale.subtotal = subtotal
            sale.discount = discount
            sale.total = new_total
            sale.payment_method = payment_method
            sale.amount_paid = new_total

        sale.notes = f"{sale.notes or ''}\n[EDIT LOG - {datetime.now().strftime('%Y-%m-%d')}] Edited invoice items/pricing.".strip()
        sale.deductions = deductions_json
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
                item.product.current_stock = (item.product.current_stock or 0.0) + item.quantity

        # 2. Reconcile customer balances if customer is linked
        if sale.customer:
            net_sale_effect = sale.total - sale.amount_paid
            sale.customer.outstanding_balance = sale.customer.outstanding_balance - net_sale_effect

            # 3. Delete associated payments first to avoid foreign key violations
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

        # 5. Delete the sale itself (will cascade delete SaleItems and ReturnTransactions)
        db.session.delete(sale)
        db.session.commit()
        return jsonify({"message": "Sale deleted and inventory restored successfully"}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete sale: {exc}"}), 500
