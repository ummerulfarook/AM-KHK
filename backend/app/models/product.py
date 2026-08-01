"""
Product models: Category + Product.
All prices stored as integers in paise (1 INR = 100 paise).
"""
from datetime import datetime, timezone
from sqlalchemy import Integer, String, DateTime, ForeignKey, Enum as SAEnum, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app import db


class Category(db.Model):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    icon_key: Mapped[str | None] = mapped_column(String(40))

    products = relationship("Product", back_populates="category")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "iconKey": self.icon_key}


class Product(db.Model):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    unit: Mapped[str] = mapped_column(
        SAEnum("kg", "bunch", "piece", "litre", name="product_unit"),
        nullable=False,
        default="kg",
    )
    purchase_price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    selling_price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_stock: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    low_stock_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"))
    icon_key: Mapped[str | None] = mapped_column(String(40))
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)
    addon_product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    addon_quantity: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    category = relationship("Category", back_populates="products")
    supplier = relationship("Supplier", back_populates="products")
    sale_items = relationship("SaleItem", back_populates="product")
    wholesale_items = relationship("WholesaleOrderItem", back_populates="product")
    purchase_items = relationship("PurchaseOrderItem", back_populates="product")

    @property
    def stock_status(self):
        if self.current_stock <= 0:
            return "out_of_stock"
        if self.current_stock <= self.low_stock_threshold:
            return "low_stock"
        return "in_stock"

    def to_dict(self):
        addon_name = None
        addon_price = 0
        if self.addon_product_id:
            addon_p = db.session.get(Product, self.addon_product_id)
            if addon_p:
                addon_name = addon_p.name
                addon_price = addon_p.selling_price

        return {
            "id": self.id,
            "name": self.name,
            "categoryId": self.category_id,
            "categoryName": self.category.name if self.category else None,
            "unit": self.unit,
            "purchasePrice": self.purchase_price,
            "sellingPrice": self.selling_price,
            "currentStock": self.current_stock,
            "lowStockThreshold": self.low_stock_threshold,
            "supplierId": self.supplier_id,
            "supplierName": self.supplier.name if self.supplier else None,
            "iconKey": self.icon_key,
            "isActive": bool(self.is_active),
            "stockStatus": self.stock_status,
            "addonProductId": self.addon_product_id,
            "addonQuantity": self.addon_quantity,
            "addonProductName": addon_name,
            "addonProductSellingPrice": addon_price,
            "createdAt": self.created_at.isoformat(),
        }
