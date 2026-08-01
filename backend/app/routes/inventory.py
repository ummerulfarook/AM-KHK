"""
Inventory blueprint — full CRUD for products and categories.
All prices stored/returned in paise. UI sends rupees, we convert here.
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import func, or_

from app import db
from app.models.product import Product, Category
from app.models.supplier import Supplier
from app.utils.role_guard import require_roles
from app.schemas.inventory_schema import ProductCreateRequest, StockAdjustRequest

inventory_bp = Blueprint("inventory", __name__, url_prefix="/api/inventory")

# ── Categories ────────────────────────────────────────────────────────────────

@inventory_bp.route("/categories", methods=["GET"])
@login_required
def list_categories():
    cats = db.session.execute(db.select(Category).order_by(Category.name)).scalars().all()
    return jsonify({"data": [c.to_dict() for c in cats]}), 200


@inventory_bp.route("/categories", methods=["POST"])
@login_required
@require_roles("owner", "manager")
def create_category():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required"}), 422
    existing = db.session.execute(
        db.select(Category).where(Category.name == name)
    ).scalar_one_or_none()
    if existing:
        return jsonify({"error": "Category already exists"}), 409
    cat = Category(name=name, icon_key=data.get("iconKey"))
    db.session.add(cat)
    db.session.commit()
    return jsonify({"data": cat.to_dict()}), 201


# ── Stats ─────────────────────────────────────────────────────────────────────

@inventory_bp.route("/stats", methods=["GET"])
@login_required
def get_stats():
    """Aggregate inventory statistics."""
    total_products = db.session.execute(
        db.select(func.count(Product.id)).where(Product.is_active == 1)
    ).scalar() or 0

    # Total stock value = SUM(current_stock * purchase_price)
    stock_value = db.session.execute(
        db.select(func.coalesce(func.sum(Product.current_stock * Product.purchase_price), 0))
        .where(Product.is_active == 1)
    ).scalar() or 0

    in_stock = db.session.execute(
        db.select(func.count(Product.id))
        .where(Product.is_active == 1, Product.current_stock > Product.low_stock_threshold)
    ).scalar() or 0

    low_stock = db.session.execute(
        db.select(func.count(Product.id))
        .where(
            Product.is_active == 1,
            Product.current_stock > 0,
            Product.current_stock <= Product.low_stock_threshold,
        )
    ).scalar() or 0

    out_of_stock = db.session.execute(
        db.select(func.count(Product.id))
        .where(Product.is_active == 1, Product.current_stock <= 0)
    ).scalar() or 0

    return jsonify({
        "totalProducts": total_products,
        "stockValue": int(stock_value),  # paise
        "inStock": in_stock,
        "lowStock": low_stock,
        "outOfStock": out_of_stock,
    }), 200


# ── Product list ──────────────────────────────────────────────────────────────

@inventory_bp.route("/", methods=["GET"])
@login_required
def list_products():
    """Paginated, filtered product list."""
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, request.args.get("perPage", 25, type=int))
    search = (request.args.get("search") or "").strip()
    category_id = request.args.get("categoryId", type=int)
    status_filter = request.args.get("status")  # in_stock | low_stock | out_of_stock | all
    include_inactive = request.args.get("includeInactive", "false").lower() == "true"

    stmt = db.select(Product)

    if not include_inactive:
        stmt = stmt.where(Product.is_active == 1)

    if search:
        stmt = stmt.where(Product.name.ilike(f"%{search}%"))

    if category_id:
        stmt = stmt.where(Product.category_id == category_id)

    if status_filter == "in_stock":
        stmt = stmt.where(Product.current_stock > Product.low_stock_threshold)
    elif status_filter == "low_stock":
        stmt = stmt.where(
            Product.current_stock > 0,
            Product.current_stock <= Product.low_stock_threshold,
        )
    elif status_filter == "out_of_stock":
        stmt = stmt.where(Product.current_stock <= 0)

    # Total count for pagination
    count_stmt = db.select(func.count()).select_from(stmt.subquery())
    total = db.session.execute(count_stmt).scalar() or 0

    products = db.session.execute(
        stmt.order_by(Product.name).offset((page - 1) * per_page).limit(per_page)
    ).scalars().all()

    return jsonify({
        "data": [p.to_dict() for p in products],
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, -(-total // per_page)),  # ceiling division
        },
    }), 200


# ── Single product ────────────────────────────────────────────────────────────

@inventory_bp.route("/<int:product_id>", methods=["GET"])
@login_required
def get_product(product_id: int):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found"}), 404
    return jsonify({"data": product.to_dict()}), 200


# ── Create product ────────────────────────────────────────────────────────────

@inventory_bp.route("/", methods=["POST"])
@login_required
@require_roles("owner", "manager", "cashier")
def create_product():
    try:
        req = ProductCreateRequest.from_json(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify({"error": "Validation failed", "details": exc.args[0]}), 422

    # Validate category and supplier exist
    cat = db.session.get(Category, req.category_id)
    if not cat:
        return jsonify({"error": "Category not found"}), 404

    if req.supplier_id:
        sup = db.session.get(Supplier, req.supplier_id)
        if not sup:
            return jsonify({"error": "Supplier not found"}), 404

    product = Product(
        name=req.name,
        category_id=req.category_id,
        unit=req.unit,
        purchase_price=req.purchase_price,
        selling_price=req.selling_price,
        current_stock=req.current_stock,
        low_stock_threshold=req.low_stock_threshold,
        supplier_id=req.supplier_id,
        icon_key=req.icon_key,
        addon_product_id=req.addon_product_id,
        addon_quantity=req.addon_quantity,
        is_active=True,
    )
    db.session.add(product)
    db.session.commit()
    # Reload with relationships
    db.session.refresh(product)
    return jsonify({"data": product.to_dict()}), 201


# ── Update product ────────────────────────────────────────────────────────────

@inventory_bp.route("/<int:product_id>", methods=["PUT"])
@login_required
@require_roles("owner", "manager")
def update_product(product_id: int):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found"}), 404

    try:
        req = ProductCreateRequest.from_json(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify({"error": "Validation failed", "details": exc.args[0]}), 422

    cat = db.session.get(Category, req.category_id)
    if not cat:
        return jsonify({"error": "Category not found"}), 404

    product.name = req.name
    product.category_id = req.category_id
    product.unit = req.unit
    product.purchase_price = req.purchase_price
    product.selling_price = req.selling_price
    product.low_stock_threshold = req.low_stock_threshold
    product.supplier_id = req.supplier_id
    product.icon_key = req.icon_key
    product.addon_product_id = req.addon_product_id
    product.addon_quantity = req.addon_quantity
    # Note: current_stock is NOT updated via PUT — use PATCH /stock

    db.session.commit()
    db.session.refresh(product)
    return jsonify({"data": product.to_dict()}), 200


# ── Stock adjustment ──────────────────────────────────────────────────────────

@inventory_bp.route("/<int:product_id>/stock", methods=["PATCH"])
@login_required
@require_roles("owner", "manager")
def adjust_stock(product_id: int):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found"}), 404

    try:
        req = StockAdjustRequest.from_json(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify({"error": "Validation failed", "details": exc.args[0]}), 422

    new_stock = product.current_stock + req.adjustment
    if new_stock < 0:
        return jsonify({"error": "Stock cannot go below zero", "currentStock": product.current_stock}), 422

    product.current_stock = new_stock
    db.session.commit()
    return jsonify({
        "data": {
            "productId": product.id,
            "name": product.name,
            "previousStock": product.current_stock - req.adjustment,
            "adjustment": req.adjustment,
            "currentStock": product.current_stock,
            "stockStatus": product.stock_status,
        }
    }), 200


# ── Deactivate product ────────────────────────────────────────────────────────

@inventory_bp.route("/<int:product_id>/deactivate", methods=["PATCH"])
@login_required
@require_roles("owner", "manager")
def deactivate_product(product_id: int):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found"}), 404
    product.is_active = False
    db.session.commit()
    return jsonify({"message": f"Product '{product.name}' deactivated"}), 200


@inventory_bp.route("/<int:product_id>/activate", methods=["PATCH"])
@login_required
@require_roles("owner", "manager")
def activate_product(product_id: int):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found"}), 404
    product.is_active = True
    db.session.commit()
    return jsonify({"message": f"Product '{product.name}' activated"}), 200
