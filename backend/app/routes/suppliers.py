"""
Suppliers blueprint — full implementation for Supplier Directory and Purchase Orders (PO) (Milestone 5).
"""
from datetime import datetime, date, timezone
from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import func, or_
from app import db
from app.models.supplier import Supplier
from app.models.order import PurchaseOrder, PurchaseOrderItem
from app.models.product import Product, Category
from app.utils.role_guard import require_roles

suppliers_bp = Blueprint("suppliers", __name__, url_prefix="/api/suppliers")


def _rupees_to_paise(val) -> int:
    try:
        return int(Decimal(str(val)) * 100)
    except (TypeError, ValueError):
        return 0


# ── Supplier CRUD ─────────────────────────────────────────────────────────────

@suppliers_bp.route("/", methods=["GET"])
@login_required
def list_suppliers():
    """List suppliers with search and pagination."""
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, request.args.get("perPage", 25, type=int))
    search = request.args.get("search", "").strip()

    stmt = db.select(Supplier)
    if search:
        stmt = stmt.where(
            or_(
                Supplier.name.ilike(f"%{search}%"),
                Supplier.phone.ilike(f"%{search}%"),
                Supplier.location.ilike(f"%{search}%")
            )
        )

    total = db.session.execute(
        db.select(func.count()).select_from(stmt.subquery())
    ).scalar() or 0

    suppliers = db.session.execute(
        stmt.order_by(Supplier.name)
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).scalars().all()

    return jsonify({
        "data": [s.to_dict() for s in suppliers],
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, -(-total // per_page))
        }
    }), 200


@suppliers_bp.route("/", methods=["POST"])
@login_required
@require_roles("owner", "manager", "accountant")
def create_supplier():
    """Create a new supplier."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 422

    phone = (data.get("phone") or "").strip() or None
    location = (data.get("location") or "").strip() or None
    payment_terms = (data.get("paymentTerms") or "").strip() or None
    rating = data.get("rating")
    if rating is not None:
        try:
            rating = float(rating)
        except ValueError:
            rating = None

    supplier = Supplier(
        name=name,
        phone=phone,
        location=location,
        payment_terms=payment_terms,
        rating=rating,
        is_active=1
    )
    db.session.add(supplier)
    db.session.commit()

    return jsonify({"data": supplier.to_dict(), "message": "Supplier created successfully"}), 201


@suppliers_bp.route("/<int:supplier_id>", methods=["PUT"])
@login_required
@require_roles("owner", "manager", "accountant")
def update_supplier(supplier_id: int):
    """Update supplier details."""
    supplier = db.session.get(Supplier, supplier_id)
    if not supplier:
        return jsonify({"error": "Supplier not found"}), 404

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 422

    supplier.name = name
    supplier.phone = (data.get("phone") or "").strip() or None
    supplier.location = (data.get("location") or "").strip() or None
    supplier.payment_terms = (data.get("paymentTerms") or "").strip() or None

    rating = data.get("rating")
    if rating is not None:
        try:
            supplier.rating = float(rating)
        except ValueError:
            pass

    db.session.commit()
    return jsonify({"data": supplier.to_dict(), "message": "Supplier updated successfully"}), 200


@suppliers_bp.route("/<int:supplier_id>", methods=["DELETE"])
@login_required
@require_roles("owner", "manager")
def toggle_supplier_active(supplier_id: int):
    """Toggle supplier active/inactive state (soft deactivation)."""
    supplier = db.session.get(Supplier, supplier_id)
    if not supplier:
        return jsonify({"error": "Supplier not found"}), 404

    supplier.is_active = 0 if supplier.is_active else 1
    db.session.commit()

    status_str = "deactivated" if not supplier.is_active else "activated"
    return jsonify({
        "data": supplier.to_dict(),
        "message": f"Supplier successfully {status_str}"
    }), 200


# ── Purchase Orders (PO) CRUD & Lifecycle ──────────────────────────────────────

@suppliers_bp.route("/po/", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def list_purchase_orders():
    """List purchase orders with pagination and filters."""
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, request.args.get("perPage", 25, type=int))
    status = request.args.get("status", "").strip()
    payment_status = request.args.get("paymentStatus", "").strip()
    supplier_id = request.args.get("supplierId", type=int)

    stmt = db.select(PurchaseOrder)
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    if payment_status:
        stmt = stmt.where(PurchaseOrder.payment_status == payment_status)
    if supplier_id:
        stmt = stmt.where(PurchaseOrder.supplier_id == supplier_id)

    total = db.session.execute(
        db.select(func.count()).select_from(stmt.subquery())
    ).scalar() or 0

    orders = db.session.execute(
        stmt.order_by(PurchaseOrder.created_at.desc())
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


@suppliers_bp.route("/po/", methods=["POST"])
@login_required
@require_roles("owner", "manager", "accountant")
def create_purchase_order():
    """Create a draft Purchase Order."""
    data = request.get_json(silent=True) or {}
    supplier_id = data.get("supplierId")
    if not supplier_id:
        return jsonify({"error": "supplierId is required"}), 422

    supplier = db.session.get(Supplier, supplier_id)
    if not supplier:
        return jsonify({"error": "Supplier not found"}), 404

    raw_items = data.get("items") or []
    if not raw_items:
        return jsonify({"error": "At least one item is required in PO"}), 422

    expected_delivery_str = data.get("expectedDelivery")
    expected_delivery = None
    if expected_delivery_str:
        try:
            expected_delivery = date.fromisoformat(expected_delivery_str)
        except ValueError:
            return jsonify({"error": "expectedDelivery must be YYYY-MM-DD"}), 422

    notes = (data.get("notes") or "").strip() or None

    try:
        po = PurchaseOrder(
            supplier_id=supplier_id,
            expected_delivery=expected_delivery,
            status="draft",
            payment_status="pending",
            notes=notes,
            created_by_id=current_user.id
        )
        db.session.add(po)
        db.session.flush()

        total_amount = 0
        for item in raw_items:
            prod_id = item.get("productId")
            prod_name = item.get("productName")
            unit_cost_rs = item.get("unitCost")
            
            unit_cost = 0
            if unit_cost_rs is not None:
                unit_cost = _rupees_to_paise(unit_cost_rs)

            # Get or create a default "General" category for dynamically created products
            cat = db.session.execute(
                db.select(Category).where(func.lower(Category.name) == "general")
            ).scalar_one_or_none()
            if not cat:
                cat = Category(name="General", icon_key="local_grocery_store")
                db.session.add(cat)
                db.session.flush()
            category_id = cat.id

            if prod_id:
                prod = db.session.get(Product, prod_id)
                if not prod:
                    db.session.rollback()
                    return jsonify({"error": f"Product {prod_id} not found"}), 404
                if unit_cost_rs is None:
                    unit_cost = prod.purchase_price or 0
                else:
                    if prod.purchase_price != unit_cost:
                        prod.purchase_price = unit_cost
            elif prod_name:
                prod_name_clean = prod_name.strip()
                prod = db.session.execute(
                    db.select(Product).where(func.lower(Product.name) == prod_name_clean.lower())
                ).scalar_one_or_none()
                if not prod:
                    prod = Product(
                        name=prod_name_clean,
                        category_id=category_id,
                        unit=item.get("unit") or "kg",
                        purchase_price=unit_cost,
                        selling_price=0,
                        current_stock=0,
                        is_active=1,
                        supplier_id=supplier_id
                    )
                    db.session.add(prod)
                    db.session.flush()
                else:
                    if prod.purchase_price != unit_cost:
                        prod.purchase_price = unit_cost
                prod_id = prod.id
            else:
                db.session.rollback()
                return jsonify({"error": "Either productId or productName is required"}), 422

            qty = float(item.get("quantity", 0))
            if qty <= 0:
                db.session.rollback()
                return jsonify({"error": "Quantity must be greater than zero"}), 422

            subtotal = int(Decimal(str(qty)) * unit_cost)
            total_amount += subtotal

            db.session.add(PurchaseOrderItem(
                order_id=po.id,
                product_id=prod_id,
                quantity=qty,
                unit_cost=unit_cost,
                subtotal=subtotal
            ))

        po.total_amount = total_amount
        db.session.commit()
        return jsonify({"data": po.to_dict(), "message": "Purchase order draft created"}), 201

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to create PO: {exc}"}), 500


@suppliers_bp.route("/po/<int:po_id>", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def get_purchase_order(po_id: int):
    """Retrieve details of a single Purchase Order."""
    po = db.session.get(PurchaseOrder, po_id)
    if not po:
        return jsonify({"error": "Purchase order not found"}), 404
    return jsonify({"data": po.to_dict()}), 200


@suppliers_bp.route("/po/<int:po_id>", methods=["PUT"])
@login_required
@require_roles("owner", "manager", "accountant")
def update_purchase_order(po_id: int):
    """Update a draft Purchase Order."""
    po = db.session.get(PurchaseOrder, po_id)
    if not po:
        return jsonify({"error": "Purchase order not found"}), 404
    if po.status != "draft":
        return jsonify({"error": "Only draft purchase orders can be modified"}), 422

    data = request.get_json(silent=True) or {}
    expected_delivery_str = data.get("expectedDelivery")
    if expected_delivery_str:
        try:
            po.expected_delivery = date.fromisoformat(expected_delivery_str)
        except ValueError:
            return jsonify({"error": "expectedDelivery must be YYYY-MM-DD"}), 422

    po.notes = (data.get("notes") or "").strip() or None

    raw_items = data.get("items") or []
    if not raw_items:
        return jsonify({"error": "At least one item is required in PO"}), 422

    try:
        # Clear existing items
        db.session.execute(
            db.delete(PurchaseOrderItem).where(PurchaseOrderItem.order_id == po.id)
        )

        total_amount = 0
        for item in raw_items:
            prod_id = item.get("productId")
            prod_name = item.get("productName")
            unit_cost_rs = item.get("unitCost")
            
            unit_cost = 0
            if unit_cost_rs is not None:
                unit_cost = _rupees_to_paise(unit_cost_rs)

            # Get or create a default "General" category for dynamically created products
            cat = db.session.execute(
                db.select(Category).where(func.lower(Category.name) == "general")
            ).scalar_one_or_none()
            if not cat:
                cat = Category(name="General", icon_key="local_grocery_store")
                db.session.add(cat)
                db.session.flush()
            category_id = cat.id

            if prod_id:
                prod = db.session.get(Product, prod_id)
                if not prod:
                    db.session.rollback()
                    return jsonify({"error": f"Product {prod_id} not found"}), 404
                if unit_cost_rs is None:
                    unit_cost = prod.purchase_price or 0
                else:
                    if prod.purchase_price != unit_cost:
                        prod.purchase_price = unit_cost
            elif prod_name:
                prod_name_clean = prod_name.strip()
                prod = db.session.execute(
                    db.select(Product).where(func.lower(Product.name) == prod_name_clean.lower())
                ).scalar_one_or_none()
                if not prod:
                    prod = Product(
                        name=prod_name_clean,
                        category_id=category_id,
                        unit=item.get("unit") or "kg",
                        purchase_price=unit_cost,
                        selling_price=0,
                        current_stock=0,
                        is_active=1,
                        supplier_id=po.supplier_id
                    )
                    db.session.add(prod)
                    db.session.flush()
                else:
                    if prod.purchase_price != unit_cost:
                        prod.purchase_price = unit_cost
                prod_id = prod.id
            else:
                db.session.rollback()
                return jsonify({"error": "Either productId or productName is required"}), 422

            qty = float(item.get("quantity", 0))
            if qty <= 0:
                db.session.rollback()
                return jsonify({"error": "Quantity must be greater than zero"}), 422

            subtotal = int(Decimal(str(qty)) * unit_cost)
            total_amount += subtotal

            db.session.add(PurchaseOrderItem(
                order_id=po.id,
                product_id=prod_id,
                quantity=qty,
                unit_cost=unit_cost,
                subtotal=subtotal
            ))

        po.total_amount = total_amount
        db.session.commit()
        return jsonify({"data": po.to_dict(), "message": "Purchase order draft updated"}), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to update PO: {exc}"}), 500


@suppliers_bp.route("/po/<int:po_id>/status", methods=["PATCH"])
@login_required
@require_roles("owner", "manager", "accountant")
def transition_po_status(po_id: int):
    """Transition purchase order status (draft -> ordered -> received -> cancelled)."""
    po = db.session.get(PurchaseOrder, po_id)
    if not po:
        return jsonify({"error": "Purchase order not found"}), 404

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    if new_status not in ("draft", "ordered", "received", "cancelled"):
        return jsonify({"error": "Invalid PO status"}), 422

    old_status = po.status
    if old_status == new_status:
        return jsonify({"data": po.to_dict(), "message": "Status remains unchanged"}), 200

    if old_status == "received":
        return jsonify({"error": "A received purchase order cannot be modified"}), 422

    try:
        # If transitioning to "received", increment product stocks & update cost_price in DB
        if new_status == "received":
            for item in po.items:
                prod = item.product
                if prod:
                    # Update stock
                    prod.current_stock = round(prod.current_stock + item.quantity, 4)
                    # Update product cost price
                    prod.purchase_price = item.unit_cost

            po.actual_delivery = date.today()

        po.status = new_status
        db.session.commit()

        return jsonify({"data": po.to_dict(), "message": f"PO status updated to {new_status}"}), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"PO status update failed: {exc}"}), 500


@suppliers_bp.route("/po/<int:po_id>/pay", methods=["POST"])
@login_required
@require_roles("owner", "manager", "accountant")
def record_po_payment(po_id: int):
    """Record supplier payment for a Purchase Order (updates paymentStatus)."""
    po = db.session.get(PurchaseOrder, po_id)
    if not po:
        return jsonify({"error": "Purchase order not found"}), 404

    data = request.get_json(silent=True) or {}
    payment_status = data.get("paymentStatus")
    amount_paid_rs = data.get("amountPaid")
    
    payment_method = data.get("paymentMethod")
    if payment_method and payment_method not in ("cash", "upi", "bank", "credit"):
        return jsonify({"error": "Invalid paymentMethod"}), 422

    notes = (data.get("notes") or "").strip()

    try:
        if amount_paid_rs is not None:
            try:
                amount_paid_paise = _rupees_to_paise(float(amount_paid_rs))
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid amountPaid value"}), 422
                
            po.amount_paid = amount_paid_paise
            if amount_paid_paise >= po.total_amount:
                po.payment_status = "paid"
            elif amount_paid_paise > 0:
                po.payment_status = "partial"
            else:
                po.payment_status = "pending"
        else:
            if payment_status:
                if payment_status not in ("pending", "partial", "paid"):
                    return jsonify({"error": "Invalid paymentStatus"}), 422
                po.payment_status = payment_status

        if payment_method:
            po.payment_method = payment_method
        
        # Log to notes as well for auditing visibility
        method_str = f" via {payment_method.upper()}" if payment_method else ""
        amt_str = f" | Amount: Rs{po.amount_paid/100:.2f}" if po.amount_paid > 0 else ""
        log_line = f"Logged payment status: {po.payment_status.upper()}{method_str}{amt_str}"
        if notes:
            log_line += f" | Notes: {notes}"
        po.notes = f"{po.notes or ''}\n[PAYMENT LOG - {datetime.now().strftime('%Y-%m-%d')}] {log_line}".strip()

        db.session.commit()
        return jsonify({"data": po.to_dict(), "message": "Supplier payment logged successfully"}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to record supplier payment: {exc}"}), 500
