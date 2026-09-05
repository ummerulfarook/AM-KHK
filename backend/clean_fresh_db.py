"""
clean_fresh_db.py — Initializes a 100% clean production database.
Contains ONLY default login users, default categories, branch, and settings.
Contains 0 sample customers, 0 sample products, 0 sample sales/orders.

Run from workspace root:
  python backend/clean_fresh_db.py
"""
import sys
import os

# Add the workspace root to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.user import User
from app.models.branch import Branch
from app.models.product import Category
from app.models.settings import Setting
from app.services.auth_service import hash_password


def init_clean_db():
    app = create_app()
    with app.app_context():
        # Close connection pool before removing file
        db.session.remove()
        db.engine.dispose()

        db_path = os.path.join(os.path.dirname(__file__), "data", "amkhk.db")
        if os.path.exists(db_path):
            print(f"Removing old database file: {db_path}")
            try:
                os.remove(db_path)
            except Exception:
                db.drop_all()

        print("Creating fresh database tables...")
        db.create_all()

        # ── 1. Default Users (ONLY Login Data) ──────────────────────────────
        users = [
            User(name="admin", phone="9876543210", role="owner",
                 password_hash=hash_password("admin123"), status="active"),
            User(name="manager", phone="9876543211", role="manager",
                 password_hash=hash_password("manager123"), status="active"),
            User(name="accountant", phone="9876543212", role="accountant",
                 password_hash=hash_password("account123"), status="active"),
            User(name="cashier1", phone="9876543213", role="cashier",
                 password_hash=hash_password("cashier123"), status="active"),
        ]
        db.session.add_all(users)
        print("OK: Created default users (admin / admin123)")

        # ── 2. Default Branch ───────────────────────────────────────────────
        branch = Branch(
            name="AM & KHK Vegetable Merchants",
            address="NH-17, Cheranalloor, Ernakulam, Kerala — 682 034",
            phone="0484-2345678",
        )
        db.session.add(branch)
        print("OK: Created default branch")

        # ── 3. Default Categories ───────────────────────────────────────────
        category_data = [
            ("Leafy Vegetables", "leafy"),
            ("Root Vegetables", "root"),
            ("Fruit Vegetables", "fruit_veg"),
            ("Pods & Beans", "pods"),
            ("Exotic Vegetables", "exotic"),
            ("Spices & Herbs", "spice"),
            ("Flowers", "flower"),
            ("None of the above", "other"),
        ]
        for cat_name, icon_key in category_data:
            db.session.add(Category(name=cat_name, icon_key=icon_key))
        print("OK: Created default categories")

        # ── 4. Default Settings ─────────────────────────────────────────────
        default_settings = [
            ("shop_name", "AM & KHK Vegetable Merchants", "Display name of the shop"),
            ("shop_address", "NH-17, Cheranalloor, Ernakulam, Kerala — 682 034", "Full address"),
            ("shop_phone", "0484-2345678", "Contact phone"),
            ("gstin", "", "GSTIN number (fill before generating invoices)"),
            ("currency_symbol", "₹", "Currency symbol"),
            ("printer_type", "usb", "ESC/POS printer connection type: usb | network | serial"),
            ("printer_address", "", "Printer IP or COM port"),
            ("whatsapp_number", "", "WhatsApp Business number (with country code, no +)"),
            ("invoice_prefix", "INV", "Invoice number prefix"),
            ("invoice_next", "1001", "Next invoice number"),
            ("theme", "light", "UI theme: light | dark"),
        ]
        for key, value, description in default_settings:
            db.session.add(Setting(key=key, value=value, description=description))
        print("OK: Created default settings")

        # Commit clean DB
        db.session.commit()

        print("\n==========================================================")
        print(" SUCCESS: Clean production database initialized!")
        print("   - Sample Customers: 0")
        print("   - Sample Products: 0")
        print("   - Sample Invoices / Sales: 0")
        print("\n Login Credentials:")
        print("   admin      / admin123   (Owner)")
        print("   manager    / manager123 (Manager)")
        print("   accountant / account123 (Accountant)")
        print("   cashier1   / cashier123 (Cashier)")
        print("==========================================================\n")


if __name__ == "__main__":
    init_clean_db()
