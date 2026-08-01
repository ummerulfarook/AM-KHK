"""
Seed script — populates the database with realistic sample data.
Run once after creating the DB:  python seed.py (from the workspace root)

All prices in paise (1 INR = 100 paise).
"""
import sys
import os

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app import create_app, db
from app.models.user import User
from app.models.branch import Branch
from app.models.product import Category, Product
from app.models.customer import Customer
from app.models.supplier import Supplier
from app.models.settings import Setting
from app.services.auth_service import hash_password


def seed():
    app = create_app()
    with app.app_context():
        db.create_all()

        # ── Users ──────────────────────────────────────────────────────────
        if not db.session.execute(db.select(User).where(User.name == "admin")).scalar_one_or_none():
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
            db.session.flush()
            print("✓ Users seeded")
        else:
            print("- Users already exist, skipping")

        # ── Branch ─────────────────────────────────────────────────────────
        if not db.session.execute(db.select(Branch)).scalar_one_or_none():
            branch = Branch(
                name="AM & KHK Vegetable Merchants",
                address="NH-17, Cheranalloor, Ernakulam, Kerala — 682 034",
                phone="0484-2345678",
            )
            db.session.add(branch)
            print("✓ Branch seeded")

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
        cat_map: dict[str, Category] = {}
        for cat_name, icon_key in category_data:
            existing = db.session.execute(
                db.select(Category).where(Category.name == cat_name)
            ).scalar_one_or_none()
            if not existing:
                cat = Category(name=cat_name, icon_key=icon_key)
                db.session.add(cat)
                db.session.flush()
                cat_map[cat_name] = cat
            else:
                cat_map[cat_name] = existing
        print("✓ Categories seeded")

        # ── Suppliers ──────────────────────────────────────────────────────
        supplier_data = [
            ("Marthandom Farms", "Thiruvananthapuram", "9847100001", 4.5, "Net 7 days"),
            ("Wayanad Fresh Produce", "Wayanad", "9847100002", 4.8, "Cash on delivery"),
            ("Ernakulam Wholesale Market", "Ernakulam", "9847100003", 4.2, "Net 3 days"),
        ]
        supplier_map: dict[str, Supplier] = {}
        for s_name, location, phone, rating, terms in supplier_data:
            existing = db.session.execute(
                db.select(Supplier).where(Supplier.name == s_name)
            ).scalar_one_or_none()
            if not existing:
                s = Supplier(name=s_name, location=location, phone=phone,
                             rating=rating, payment_terms=terms)
                db.session.add(s)
                db.session.flush()
                supplier_map[s_name] = s
            else:
                supplier_map[s_name] = existing
        print("✓ Suppliers seeded")

        # ── Products ───────────────────────────────────────────────────────
        # (name, category, unit, buy_INR, sell_INR, stock_qty, low_threshold, supplier_name, icon_key)
        products_data = [
            ("Tomato", "Fruit Vegetables", "kg", 35, 45, 200.0, 30.0, "Wayanad Fresh Produce", "tomato"),
            ("Onion", "Root Vegetables", "kg", 28, 38, 300.0, 50.0, "Ernakulam Wholesale Market", "onion"),
            ("Carrot", "Root Vegetables", "kg", 40, 55, 150.0, 25.0, "Wayanad Fresh Produce", "carrot"),
            ("Cabbage", "Leafy Vegetables", "kg", 18, 28, 180.0, 30.0, "Marthandom Farms", "cabbage"),
            ("Brinjal", "Fruit Vegetables", "kg", 22, 32, 120.0, 20.0, "Marthandom Farms", "brinjal"),
            ("Green Chilli", "Spices & Herbs", "kg", 60, 80, 50.0, 10.0, "Wayanad Fresh Produce", "chilli"),
            ("Bitter Gourd", "Fruit Vegetables", "kg", 30, 42, 80.0, 15.0, "Ernakulam Wholesale Market", "bitter_gourd"),
            ("Snake Gourd", "Fruit Vegetables", "kg", 25, 35, 100.0, 20.0, "Marthandom Farms", "snake_gourd"),
            ("Beans", "Pods & Beans", "kg", 55, 70, 60.0, 10.0, "Wayanad Fresh Produce", "beans"),
            ("Potato", "Root Vegetables", "kg", 22, 32, 250.0, 40.0, "Ernakulam Wholesale Market", "potato"),
            ("Drumstick", "Fruit Vegetables", "bunch", 12, 20, 100.0, 20.0, "Marthandom Farms", "drumstick"),
            ("Curry Leaves", "Spices & Herbs", "bunch", 5, 10, 200.0, 30.0, "Wayanad Fresh Produce", "curry_leaves"),
        ]

        for p_name, cat_name, unit, buy_inr, sell_inr, stock, low, sup_name, icon in products_data:
            existing = db.session.execute(
                db.select(Product).where(Product.name == p_name)
            ).scalar_one_or_none()
            if not existing:
                cat = cat_map.get(cat_name)
                sup = supplier_map.get(sup_name)
                product = Product(
                    name=p_name,
                    category_id=cat.id if cat else 1,
                    unit=unit,
                    purchase_price=buy_inr * 100,
                    selling_price=sell_inr * 100,
                    current_stock=stock,
                    low_stock_threshold=low,
                    supplier_id=sup.id if sup else None,
                    icon_key=icon,
                    is_active=True,
                )
                db.session.add(product)
        print("✓ Products seeded")

        # ── Customers ──────────────────────────────────────────────────────
        customer_data = [
            ("Rajan Nair", "9876500001", "Kakkanad, Ernakulam", "wholesale", 500000),
            ("Latha Menon", "9876500002", "Tripunithura, Ernakulam", "retail", 50000),
            ("Al-Ameen Traders", "9876500003", "Aluva, Ernakulam", "wholesale", 1000000),
            ("Priya Krishnan", "9876500004", "Edappally, Ernakulam", "retail", 20000),
            ("Kerala Hotels Pvt Ltd", "9876500005", "Fort Kochi, Ernakulam", "wholesale", 2000000),
        ]
        for c_name, phone, address, c_type, credit_limit in customer_data:
            existing = db.session.execute(
                db.select(Customer).where(Customer.name == c_name)
            ).scalar_one_or_none()
            if not existing:
                db.session.add(Customer(
                    name=c_name, phone=phone, address=address,
                    type=c_type, credit_limit=credit_limit,
                ))
        print("✓ Customers seeded")

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
            existing = db.session.execute(
                db.select(Setting).where(Setting.key == key)
            ).scalar_one_or_none()
            if not existing:
                db.session.add(Setting(key=key, value=value, description=description))
        print("✓ Settings seeded")

        db.session.commit()
        print("\n🌿 Database seeded successfully!")
        print("   Login credentials:")
        print("     admin      / admin123   (owner)")
        print("     manager    / manager123 (manager)")
        print("     accountant / account123 (accountant)")
        print("     cashier1   / cashier123 (cashier)")
        print("\n   ⚠️  Change the admin password after first login!")


if __name__ == "__main__":
    seed()
