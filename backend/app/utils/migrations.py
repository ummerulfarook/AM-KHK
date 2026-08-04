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

    # 4. wholesale_orders columns
    add_column_if_missing("wholesale_orders", "bank_name", "VARCHAR(100)", default_val="NULL")

    # 5. payments columns
    add_column_if_missing("payments", "bank_name", "VARCHAR(100)", default_val="NULL")

    conn.commit()
    conn.close()
    print("--- Automatic Database Migrations Finished ---")
