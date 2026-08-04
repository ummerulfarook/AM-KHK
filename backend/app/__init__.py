"""
AM & KHK Vegetable Merchants ERP — Flask App Factory
Uses Flask-SQLAlchemy for ORM integration.
"""
import os
from flask import Flask, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_cors import CORS
from flask_bcrypt import Bcrypt

# Initialise extensions (not yet tied to an app instance)
db = SQLAlchemy()
login_manager = LoginManager()
bcrypt = Bcrypt()


def create_app(test_config: dict | None = None) -> Flask:
    """Application factory — creates and wires up the Flask app."""

    # Resolve paths relative to this file's location
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)

    # Run auto-migrations on startup
    from app.utils.migrations import run_auto_migrations
    db_file_path = os.path.join(data_dir, "amkhk.db")
    run_auto_migrations(db_file_path)

    # Point at the pre-built React bundle when running in production
    static_folder = os.path.join(base_dir, "..", "frontend", "dist")
    static_folder = os.path.abspath(static_folder)

    app = Flask(
        __name__,
        static_folder=static_folder if os.path.isdir(static_folder) else None,
        static_url_path="/static",
    )

    # ── Configuration ─────────────────────────────────────────────────────────
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret-change-in-production"),
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{os.path.join(data_dir, 'amkhk.db')}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_HTTPONLY=True,
        REMEMBER_COOKIE_HTTPONLY=True,
    )

    if test_config:
        app.config.update(test_config)

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
    login_manager.init_app(app)
    bcrypt.init_app(app)
    CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://localhost:3000"])

    # ── Import all models so SQLAlchemy is aware of them ──────────────────────
    with app.app_context():
        from .models import (  # noqa: F401
            User, Branch, Category, Product, Customer, Supplier,
            WholesaleOrder, WholesaleOrderItem, PurchaseOrder, PurchaseOrderItem,
            RetailSale, SaleItem, CreditLedger, Payment, Expense, Income, Setting,
        )

    # ── Flask-Login user loader ───────────────────────────────────────────────
    from .models.user import User

    @login_manager.user_loader
    def load_user(user_id: str):
        return db.session.get(User, int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({"error": "Authentication required"}), 401

    # ── Blueprints ────────────────────────────────────────────────────────────
    from .routes.auth import auth_bp
    from .routes.inventory import inventory_bp
    from .routes.billing import billing_bp
    from .routes.orders import orders_bp
    from .routes.customers import customers_bp
    from .routes.suppliers import suppliers_bp
    from .routes.credit import credit_bp
    from .routes.expenses import expenses_bp
    from .routes.income import income_bp
    from .routes.reports import reports_bp
    from .routes.settings_routes import settings_bp
    from .routes.dashboard import dashboard_bp

    for bp in [
        auth_bp, inventory_bp, billing_bp, orders_bp, customers_bp,
        suppliers_bp, credit_bp, expenses_bp, income_bp, reports_bp,
        settings_bp, dashboard_bp,
    ]:
        app.register_blueprint(bp)

    # ── Serve React SPA (production) ──────────────────────────────────────────
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_spa(path):
        if static_folder and os.path.isdir(static_folder):
            target = os.path.join(static_folder, path)
            if path and os.path.isfile(target):
                return send_from_directory(static_folder, path)
            index = os.path.join(static_folder, "index.html")
            if os.path.isfile(index):
                return send_from_directory(static_folder, "index.html")
        return jsonify({"message": "AM & KHK ERP API running — frontend not built yet"}), 200

    # ── Health check ──────────────────────────────────────────────────────────
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "AM & KHK ERP"}), 200

    return app
