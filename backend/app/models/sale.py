"""Retail sale (POS bill) models. All amounts in paise."""
from datetime import datetime, timezone
from sqlalchemy import Integer, String, DateTime, ForeignKey, Enum as SAEnum, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app import db


class RetailSale(db.Model):
    __tablename__ = "retail_sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_number: Mapped[str | None] = mapped_column(String(40), unique=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"))
    store_id: Mapped[int | None] = mapped_column(ForeignKey("customer_stores.id"), nullable=True)
    cashier_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    payment_method: Mapped[str] = mapped_column(
        SAEnum("cash", "upi", "bank", "credit", name="rs_payment_method"),
        nullable=False, default="cash",
    )
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tax: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    amount_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cash_received: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    upi_received: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bank_received: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    previous_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(String(300))
    partner: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    billing_customer_name: Mapped[str | None] = mapped_column(String(100))
    billing_customer_phone: Mapped[str | None] = mapped_column(String(20))
    upi_id: Mapped[str | None] = mapped_column(String(100))
    bank_name: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    customer = relationship("Customer", back_populates="sales")
    store = relationship("CustomerStore")
    cashier = relationship("User", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    credit_entries = relationship("CreditLedger", back_populates="sale", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id, "invoiceNumber": self.invoice_number,
            "customerId": self.customer_id,
            "customerName": self.customer.name if self.customer else (self.billing_customer_name or "Walk-in"),
            "customerPhone": self.customer.phone if self.customer else self.billing_customer_phone,
            "storeId": self.store_id,
            "storeName": self.store.name if self.store else None,
            "cashierId": self.cashier_id,
            "cashierName": self.cashier.name if self.cashier else None,
            "paymentMethod": self.payment_method,
            "upiId": self.upi_id,
            "bankName": self.bank_name,
            "subtotal": self.subtotal, "discount": self.discount,
            "total": self.total, "tax": self.tax, "notes": self.notes,
            "amountPaid": self.amount_paid,
            "cashReceived": self.cash_received,
            "upiReceived": self.upi_received,
            "bankReceived": self.bank_received,
            "previousBalance": self.previous_balance,
            "partner": self.partner,
            "billingCustomerName": self.billing_customer_name,
            "billingCustomerPhone": self.billing_customer_phone,
            "createdAt": self.created_at.isoformat(),
            "items": [i.to_dict() for i in self.items],
        }


class SaleItem(db.Model):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("retail_sales.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False)
    boxes: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    box_weight: Mapped[float | None] = mapped_column(Float, nullable=True, default=0.0)

    sale = relationship("RetailSale", back_populates="items")
    product = relationship("Product", back_populates="sale_items")

    def to_dict(self):
        return {
            "id": self.id, "saleId": self.sale_id,
            "productId": self.product_id,
            "productName": self.product.name if self.product else None,
            "quantity": self.quantity,
            "unit": self.product.unit if self.product else None,
            "unitPrice": self.unit_price, "subtotal": self.subtotal,
            "boxes": self.boxes or 0,
            "boxWeight": self.box_weight or 0.0,
        }
