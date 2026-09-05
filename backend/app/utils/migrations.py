# migrations.py
import sqlite3
import os

def run_auto_migrations(db_path: str):
    """Automatically check and add missing columns/tables on startup."""
    if not os.path.exists(db_path):
        return

    print(f"--- Running Automatic Database Migrations on {db_path} ---")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    def add_column_if_missing(table, col, col_type, default_val=None):
        # Check if column exists
        cursor.execute(f"PRAGMA table_info({table})")
        columns = [row[1] for row in cursor.fetchall()]
        if col not in columns:
            stmt = f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"
            if default_val is not None:
                stmt += f" DEFAULT {default_val}"
            try:
                cursor.execute(stmt)
                print(f"[AUTO-MIGRATION] Added column '{col}' to table '{table}'")
            except Exception as e:
                print(f"[AUTO-MIGRATION-ERROR] Failed to add column '{col}' to '{table}': {e}")
        else:
            # If the column exists but we need to migrate/fill data, we could do it here
            pass

    # Create customer_stores table if missing
    try:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS customer_stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            name VARCHAR(120) NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );
        """)
        print("[AUTO-MIGRATION] Ensured table 'customer_stores' exists")
    except Exception as e:
        print(f"[AUTO-MIGRATION-ERROR] Failed to ensure table 'customer_stores' exists: {e}")

    # Create return_transactions table if missing
    try:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS return_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            return_number VARCHAR(40) UNIQUE,
            current_sale_id INTEGER REFERENCES retail_sales(id) ON DELETE CASCADE,
            original_sale_id INTEGER REFERENCES retail_sales(id),
            original_invoice_ref VARCHAR(40),
            customer_id INTEGER REFERENCES customers(id),
            cashier_id INTEGER REFERENCES users(id),
            total_return_value INTEGER NOT NULL DEFAULT 0,
            notes VARCHAR(300),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """)
        print("[AUTO-MIGRATION] Ensured table 'return_transactions' exists")
    except Exception as e:
        print(f"[AUTO-MIGRATION-ERROR] Failed to ensure table 'return_transactions' exists: {e}")

    # Create return_items table if missing
    try:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS return_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            return_transaction_id INTEGER NOT NULL REFERENCES return_transactions(id) ON DELETE CASCADE,
            product_id INTEGER REFERENCES products(id),
            label VARCHAR(200) NOT NULL,
            quantity REAL NOT NULL,
            unit_price INTEGER NOT NULL,
            subtotal INTEGER NOT NULL,
            original_invoice_ref VARCHAR(40)
        );
        """)
        print("[AUTO-MIGRATION] Ensured table 'return_items' exists")
    except Exception as e:
        print(f"[AUTO-MIGRATION-ERROR] Failed to ensure table 'return_items' exists: {e}")

    # 1. sale_items columns
    add_column_if_missing("sale_items", "boxes", "INTEGER", default_val="0")
    add_column_if_missing("sale_items", "box_weight", "REAL", default_val="0.0")

    # 2. wholesale_order_items columns
    add_column_if_missing("wholesale_order_items", "boxes", "INTEGER", default_val="0")
    add_column_if_missing("wholesale_order_items", "box_weight", "REAL", default_val="0.0")

    # 3. retail_sales columns
    add_column_if_missing("retail_sales", "cash_received", "INTEGER", default_val="0")
    add_column_if_missing("retail_sales", "upi_received", "INTEGER", default_val="0")
    add_column_if_missing("retail_sales", "bank_received", "INTEGER", default_val="0")
    add_column_if_missing("retail_sales", "upi_id", "VARCHAR(100)", default_val="NULL")
    add_column_if_missing("retail_sales", "bank_name", "VARCHAR(100)", default_val="NULL")
    add_column_if_missing("retail_sales", "store_id", "INTEGER", default_val="NULL")
    add_column_if_missing("retail_sales", "deductions", "VARCHAR(4000)", default_val="NULL")

    # 4. wholesale_orders columns
    add_column_if_missing("wholesale_orders", "bank_name", "VARCHAR(100)", default_val="NULL")
    add_column_if_missing("wholesale_orders", "store_id", "INTEGER", default_val="NULL")

    # 5. payments columns
    add_column_if_missing("payments", "bank_name", "VARCHAR(100)", default_val="NULL")

    conn.commit()
    conn.close()
    print("--- Automatic Database Migrations Finished ---")
