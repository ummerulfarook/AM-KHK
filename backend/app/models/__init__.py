"""
Models package — re-export all models so the app factory and seed script can import them.
Uses Flask-SQLAlchemy's db.Model as the base (imported from app).
"""
# Import models using lazy imports to avoid circular dependencies.
# The actual model classes inherit from db.Model (set in each model file).

from .user import User
from .branch import Branch
from .product import Category, Product
from .customer import Customer, CustomerStore
from .supplier import Supplier
from .order import WholesaleOrder, WholesaleOrderItem, PurchaseOrder, PurchaseOrderItem
from .sale import RetailSale, SaleItem, ReturnTransaction, ReturnItem
from .credit import CreditLedger, Payment
from .expense import Expense, Income
from .settings import Setting

__all__ = [
    "User", "Branch",
    "Category", "Product",
    "Customer", "CustomerStore", "Supplier",
    "WholesaleOrder", "WholesaleOrderItem",
    "PurchaseOrder", "PurchaseOrderItem",
    "RetailSale", "SaleItem",
    "ReturnTransaction", "ReturnItem",
    "CreditLedger", "Payment",
    "Expense", "Income",
    "Setting",
]
