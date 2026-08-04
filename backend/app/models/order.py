"""
Order models: WholesaleOrder + PurchaseOrder.
All amounts in paise.
"""
from datetime import datetime, date, timezone
from sqlalchemy import Integer, String, DateTime, Date, ForeignKey, Text, Enum as SAEnum, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app import db


class WholesaleOrder(db.Model):
    __tablename__ = "wholesale_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    delivery_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        SAEnum("pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled",
               name="wholesale_status"),
        nullable=False, default="pending",
    )
    notes: Mapped[str | None] = mapped_column(Text)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payment_method: Mapped[str | None] = mapped_column(
        SAEnum("cash", "upi", "bank", "credit", name="wo_payment_method")
    )
    payment_status: Mapped[str] = mapped_column(
        SAEnum("pending", "partial", "paid", name="wo_payment_status"),
        nullable=False, default="pending",
    )
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    partner: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    upi_id: Mapped[str | None] = mapped_column(String(100))
    bank_name: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )

    customer = relationship("Customer", back_populates="wholesale_orders")
    items = relationship("WholesaleOrderItem", back_populates="order", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "customerId": self.customer_id,
            "customerName": self.customer.name if self.customer else None,
            "deliveryDate": self.delivery_date.isoformat() if self.delivery_date else None,
            "status": self.status, "notes": self.notes,
            "totalAmount": self.total_amount, "discount": self.discount,
            "paymentMethod": self.payment_method, "paymentStatus": self.payment_status,
            "upiId": self.upi_id,
            "bankName": self.bank_name,
            "partner": self.partner,
            "createdAt": self.created_at.isoformat(),
            "items": [i.to_dict() for i in self.items],
        }


class WholesaleOrderItem(db.Model):
    __tablename__ = "wholesale_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("wholesale_orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False)
    boxes: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    box_weight: Mapped[float | None] = mapped_column(Float, nullable=True, default=0.0)

    order = relationship("WholesaleOrder", back_populates="items")
    product = relationship("Product", back_populates="wholesale_items")

    def to_dict(self):
        return {
            "id": self.id, "orderId": self.order_id,
            "productId": self.product_id,
            "productName": self.product.name if self.product else None,
            "quantity": self.quantity,
            "unit": self.product.unit if self.product else None,
            "unitPrice": self.unit_price, "subtotal": self.subtotal,
            "boxes": self.boxes or 0,
            "boxWeight": self.box_weight or 0.0,
        }


class PurchaseOrder(db.Model):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    expected_delivery: Mapped[date | None] = mapped_column(Date)
    actual_delivery: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        SAEnum("draft", "ordered", "received", "cancelled", name="po_status"),
        nullable=False, default="draft",
    )
    payment_status: Mapped[str] = mapped_column(
        SAEnum("pending", "partial", "paid", name="po_payment_status"),
        nullable=False, default="pending",
    )
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    amount_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )

    supplier = relationship("Supplier", back_populates="purchase_orders")
    items = relationship("PurchaseOrderItem", back_populates="order", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        return {
            "id": self.id, "supplierId": self.supplier_id,
            "supplierName": self.supplier.name if self.supplier else None,
            "expectedDelivery": self.expected_delivery.isoformat() if self.expected_delivery else None,
            "actualDelivery": self.actual_delivery.isoformat() if self.actual_delivery else None,
            "status": self.status, "paymentStatus": self.payment_status,
            "paymentMethod": self.payment_method,
            "amountPaid": self.amount_paid,
            "totalAmount": self.total_amount, "notes": self.notes,
            "createdAt": self.created_at.isoformat(),
            "items": [i.to_dict() for i in self.items],
        }


class PurchaseOrderItem(db.Model):
    __tablename__ = "purchase_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False)

    order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product", back_populates="purchase_items")

    def to_dict(self):
        return {
            "id": self.id, "orderId": self.order_id,
            "productId": self.product_id,
            "productName": self.product.name if self.product else None,
            "quantity": self.quantity, "unitCost": self.unit_cost, "subtotal": self.subtotal,
        }
