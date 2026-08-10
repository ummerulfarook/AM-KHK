"""
Wholesale orders routes — full implementation of status lifecycle,
stock reservation/decrement, and credit ledger integration (Milestone 4).
"""
import io
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from flask import Blueprint, request, jsonify, send_file, Response
from flask_login import login_required, current_user
from sqlalchemy import func, or_
from app import db
from app.models.order import WholesaleOrder, WholesaleOrderItem
from app.models.product import Product
from app.models.customer import Customer, CustomerStore
from app.models.credit import CreditLedger
from app.models.settings import Setting
from app.services.invoice_service import render_invoice_html, generate_invoice_pdf
from app.utils.role_guard import require_roles

orders_bp = Blueprint("orders", __name__, url_prefix="/api/orders")


def _get_settings() -> dict:
    rows = db.session.execute(db.select(Setting)).scalars().all()
    return {r.key: r.value for r in rows}


def _rupees_to_paise(val) -> int:
    try:
        return int(Decimal(str(val)) * 100)
    except (TypeError, ValueError):
        return 0


class WholesaleOrderInvoiceWrapper:
    def __init__(self, order: WholesaleOrder):
        self._order = order
        self.invoice_number = f"WO-{order.id:04d}"
        self.created_at = order.created_at
        self.customer = order.customer
        self.items = order.items
        self.subtotal = sum(item.subtotal for item in order.items)
        self.discount = order.discount
        self.tax = 0
        self.total = order.total_amount
        self.payment_method = order.payment_method or "credit"
        self.notes = order.notes
        self.credit_entries = [] # Placeholder if needed

    @property
    def previous_balance(self):
        if not self.customer:
            return 0
        if self._order.status == "delivered":
            return self._order.customer.outstanding_balance - self.total
        else:
            return self._order.customer.outstanding_balance

    @property
    def amount_paid(self):
        return 0


@orders_bp.route("/", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def list_orders():
    """List wholesale orders with filters and pagination."""
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, request.args.get("perPage", 25, type=int))
    status = request.args.get("status", "").strip()
    payment_status = request.args.get("paymentStatus", "").strip()
    search = request.args.get("search", "").strip()

    stmt = db.select(WholesaleOrder)

    if status:
        stmt = stmt.where(WholesaleOrder.status == status)
    if payment_status:
        stmt = stmt.where(WholesaleOrder.payment_status == payment_status)
    if search:
        # Search by customer name
        stmt = stmt.join(Customer).where(Customer.name.ilike(f"%{search}%"))

    total = db.session.execute(
        db.select(func.count()).select_from(stmt.subquery())
    ).scalar() or 0

    orders = db.session.execute(
        stmt.order_by(WholesaleOrder.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).scalars().all()

    return jsonify({
        "data": [o.to_dict() for o in orders],
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, -(-total // per_page))
        }
    }), 200


@orders_bp.route("/", methods=["POST"])
@login_required
@require_roles("owner", "manager")
def create_order():
    """Create a wholesale order (status defaults to pending, no stock deducted yet)."""
    data = request.get_json(silent=True) or {}
    customer_id = data.get("customerId")
    if not customer_id:
        return jsonify({"error": "customerId is required"}), 422

    customer = db.session.get(Customer, customer_id)
    if not customer:
        return jsonify({"error": "Customer not found"}), 404
    if customer.type != "wholesale":
        return jsonify({"error": "Only wholesale customers can place wholesale orders"}), 422

    raw_items = data.get("items") or []
    if not raw_items:
        return jsonify({"error": "At least one item is required"}), 422

    delivery_date_str = data.get("deliveryDate")
    delivery_date = None
    if delivery_date_str:
        try:
            delivery_date = date.fromisoformat(delivery_date_str)
        except ValueError:
            return jsonify({"error": "Invalid deliveryDate format (YYYY-MM-DD)"}), 422

    payment_method = (data.get("paymentMethod") or "credit").strip()
    notes = (data.get("notes") or "").strip() or None
    discount = _rupees_to_paise(data.get("discount", 0))

    store_id = data.get("storeId")
    if store_id:
        try:
            store_id = int(store_id)
            # Check store belongs to this customer
            store_obj = db.session.get(CustomerStore, store_id)
            if not store_obj or store_obj.customer_id != customer_id:
                return jsonify({"error": "Store does not belong to this customer"}), 422
        except (ValueError, TypeError):
            store_id = None

    try:
        from app.utils.date_helper import get_working_date
        working_dt = get_working_date()
        # Build order
        order = WholesaleOrder(
            customer_id=customer_id,
            store_id=store_id,
            delivery_date=delivery_date,
            status="pending",
            notes=notes,
            discount=discount,
            payment_method=payment_method,
            payment_status="pending",
            upi_id=data.get("upiId"),
            created_by_id=current_user.id,
            partner=customer.partner if customer else "neutral",
            created_at=working_dt,
        )
        db.session.add(order)
        db.session.flush()

        subtotal = 0
        for item in raw_items:
            prod_id = item.get("productId")
            prod = db.session.get(Product, prod_id)
            if not prod:
                db.session.rollback()
                return jsonify({"error": f"Product {prod_id} not found"}), 404
            qty = float(item.get("quantity", 0))
            if qty <= 0:
                db.session.rollback()
                return jsonify({"error": f"Quantity for product '{prod.name}' must be > 0"}), 422
            # Use provided unit price or default to product's wholesale price (stored in DB)
            unit_price_rs = item.get("unitPrice")
            if unit_price_rs is not None:
                unit_price = _rupees_to_paise(unit_price_rs)
            else:
                unit_price = prod.wholesale_price or prod.sellingPrice

            item_subtotal = int(Decimal(str(qty)) * unit_price)
            subtotal += item_subtotal

            boxes = int(item.get("boxes", 0))
            box_weight = float(item.get("boxWeight", 0.0))

            db.session.add(WholesaleOrderItem(
                order_id=order.id,
                product_id=prod_id,
                quantity=qty,
                unit_price=unit_price,
                subtotal=item_subtotal,
                boxes=boxes,
                box_weight=box_weight,
            ))

        order.total_amount = max(0, subtotal - discount)
        db.session.commit()
        return jsonify({"data": order.to_dict(), "message": "Order created successfully"}), 201

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Order creation failed: {exc}"}), 500


@orders_bp.route("/<int:order_id>", methods=["GET"])
@login_required
def get_order(order_id: int):
    """Get wholesale order details."""
    order = db.session.get(WholesaleOrder, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    return jsonify({"data": order.to_dict()}), 200


@orders_bp.route("/<int:order_id>", methods=["PUT"])
@login_required
@require_roles("owner", "manager")
def update_order(order_id: int):
    """Update wholesale order (only allowed if status is 'pending')."""
    order = db.session.get(WholesaleOrder, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    if order.status != "pending":
        return jsonify({"error": "Only orders in 'pending' status can be modified"}), 422

    data = request.get_json(silent=True) or {}
    delivery_date_str = data.get("deliveryDate")
    if delivery_date_str:
        try:
            order.delivery_date = date.fromisoformat(delivery_date_str)
        except ValueError:
            return jsonify({"error": "Invalid deliveryDate format (YYYY-MM-DD)"}), 422

    order.notes = (data.get("notes") or "").strip() or None
    order.payment_method = (data.get("paymentMethod") or "credit").strip()
    order.upi_id = data.get("upiId")
    order.discount = _rupees_to_paise(data.get("discount", 0))

    raw_items = data.get("items") or []
    if not raw_items:
        return jsonify({"error": "At least one item is required"}), 422

    try:
        # Clear existing items
        db.session.execute(
            db.delete(WholesaleOrderItem).where(WholesaleOrderItem.order_id == order.id)
        )

        subtotal = 0
        for item in raw_items:
            prod_id = item.get("productId")
            prod = db.session.get(Product, prod_id)
            if not prod:
                db.session.rollback()
                return jsonify({"error": f"Product {prod_id} not found"}), 404
            qty = float(item.get("quantity", 0))
            if qty <= 0:
                db.session.rollback()
                return jsonify({"error": f"Quantity for product '{prod.name}' must be > 0"}), 422
            unit_price_rs = item.get("unitPrice")
            if unit_price_rs is not None:
                unit_price = _rupees_to_paise(unit_price_rs)
            else:
                unit_price = prod.wholesale_price or prod.sellingPrice

            item_subtotal = int(Decimal(str(qty)) * unit_price)
            subtotal += item_subtotal

            db.session.add(WholesaleOrderItem(
                order_id=order.id,
                product_id=prod_id,
                quantity=qty,
                unit_price=unit_price,
                subtotal=item_subtotal
            ))

        order.total_amount = max(0, subtotal - order.discount)
        db.session.commit()
        return jsonify({"data": order.to_dict(), "message": "Order updated successfully"}), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Order update failed: {exc}"}), 500


@orders_bp.route("/<int:order_id>/status", methods=["PATCH"])
@login_required
@require_roles("owner", "manager")
def transition_status(order_id: int):
    """Transition order status with stock verification and credit ledger integration."""
    order = db.session.get(WholesaleOrder, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    notes = data.get("notes") # optional delivery/dispatch note

    VALID_STATUSES = ("pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled")
    if new_status not in VALID_STATUSES:
        return jsonify({"error": f"Invalid status. Must be one of {VALID_STATUSES}"}), 422

    old_status = order.status
    if old_status == new_status:
        return jsonify({"data": order.to_dict(), "message": "Status remains unchanged"}), 200

    try:
        # Determine if we need to deduct stock:
        # Transitions from (pending, cancelled) -> (confirmed, packed, out_for_delivery, delivered)
        was_deducted = old_status not in ("pending", "cancelled")
        should_be_deducted = new_status not in ("pending", "cancelled")

        if should_be_deducted and not was_deducted:
            # Validate and deduct stock
            for item in order.items:
                prod = item.product
                if prod.current_stock < item.quantity:
                    return jsonify({
                        "error": f"Insufficient stock for '{prod.name}' to confirm order",
                        "available": prod.current_stock,
                        "requested": item.quantity
                    }), 422

            # All items have sufficient stock -> deduct
            for item in order.items:
                item.product.current_stock = round(item.product.current_stock - item.quantity, 4)

        elif not should_be_deducted and was_deducted:
            # Restore stock (transition to pending or cancelled)
            for item in order.items:
                item.product.current_stock = round(item.product.current_stock + item.quantity, 4)

        # Handle notes
        if notes:
            order.notes = f"{order.notes or ''}\n[{new_status.upper()} - {datetime.now().strftime('%Y-%m-%d %H:%M')}] {notes}".strip()

        # Update status
        order.status = new_status

        # If transitioning away from delivered, clean up credit ledger
        if old_status == "delivered" and order.payment_method == "credit":
            existing_credit = db.session.execute(
                db.select(CreditLedger).where(CreditLedger.wholesale_order_id == order.id)
            ).scalar_one_or_none()
            if existing_credit:
                unpaid = existing_credit.amount - existing_credit.amount_paid
                order.customer.outstanding_balance = order.customer.outstanding_balance - unpaid
                db.session.delete(existing_credit)

        # If order status becomes delivered, and payment method is credit, post to credit ledger
        if new_status == "delivered" and order.payment_method == "credit":
            # Check if already in credit ledger to avoid double entry
            existing_credit = db.session.execute(
                db.select(CreditLedger).where(CreditLedger.wholesale_order_id == order.id)
            ).scalar_one_or_none()

            if not existing_credit:
                order.customer.outstanding_balance += order.total_amount
                settings = _get_settings()
                credit_days = int(settings.get("credit_days", "30"))
                
                from app.utils.date_helper import get_working_date
                working_dt = get_working_date()
                due = working_dt.date() + timedelta(days=credit_days)
                
                db.session.add(CreditLedger(
                    customer_id=order.customer_id,
                    wholesale_order_id=order.id,
                    invoice_ref=f"WO-{order.id:04d}",
                    amount=order.total_amount,
                    amount_paid=0,
                    due_date=due,
                    status="due",
                    created_at=working_dt,
                ))

        db.session.commit()
        return jsonify({"data": order.to_dict(), "message": f"Order status updated to {new_status}"}), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Status transition failed: {exc}"}), 500


@orders_bp.route("/<int:order_id>/pdf", methods=["GET"])
@login_required
def get_order_invoice_pdf(order_id: int):
    """Generate and stream wholesale order invoice PDF."""
    order = db.session.get(WholesaleOrder, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    # Wrap the WholesaleOrder in a wrapper that behaves like RetailSale
    wrapped_sale = WholesaleOrderInvoiceWrapper(order)
    settings = _get_settings()
    html = render_invoice_html(wrapped_sale, settings)

    try:
        pdf_bytes = generate_invoice_pdf(html, sale=wrapped_sale, settings=settings)
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"Invoice_WO-{order.id:04d}.pdf"
        )
    except ImportError:
        # Fallback to serving HTML directly
        return Response(
            html,
            mimetype="text/html",
            headers={
                "Content-Disposition": f'attachment; filename="Invoice_WO-{order.id:04d}.html"'
            }
        )
