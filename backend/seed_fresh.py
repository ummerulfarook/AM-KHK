# seed_fresh.py
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.user import User
from app.models.branch import Branch
from app.models.product import Category
from app.models.settings import Setting
from app.services.auth_service import hash_password

def seed_fresh():
    app = create_app()
    with app.app_context():
        # Drop database file and tables to start fresh
        db_path = os.path.join(os.path.dirname(__file__), "data", "amkhk.db")
        if os.path.exists(db_path):
            print(f"Removing old database file: {db_path}")
            try:
                # We need to make sure connections are closed, but since this script is run alone, we can drop all tables first
                db.drop_all()
            except Exception as e:
                print(f"Could not drop all tables: {e}")
        
        print("Creating fresh database tables...")
        db.create_all()

        # ── Users ──────────────────────────────────────────────────────────
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
        print("OK: Default users created (admin / admin123)")

        # ── Branch ─────────────────────────────────────────────────────────
        branch = Branch(
            name="AM & KHK Vegetable Merchants",
            address="NH-17, Cheranalloor, Ernakulam, Kerala — 682 034",
            phone="0484-2345678",
        )
        db.session.add(branch)
        print("OK: Default branch created")

        # ── Categories ─────────────────────────────────────────────────────
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
        print("OK: Categories created")

        # ── Settings ───────────────────────────────────────────────────────
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
        print("OK: Default settings created")

        db.session.commit()
        print("\nFresh production database initialized successfully!")

if __name__ == "__main__":
    seed_fresh()
