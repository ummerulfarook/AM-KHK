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
    # JSON array of itemised return/deduction lines persisted for display on invoice.
    # Format: [{label, qty, unitPrice, subtotal, productId?, productName?, originalInvoiceRef?}]
    # Amounts in paise. None means no deductions.
    deductions: Mapped[str | None] = mapped_column(String(4000), nullable=True)

    customer = relationship("Customer", back_populates="sales")
    store = relationship("CustomerStore")
    cashier = relationship("User", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    credit_entries = relationship("CreditLedger", back_populates="sale", cascade="all, delete-orphan")
    # Returns created during this bill
    return_transactions = relationship("ReturnTransaction", foreign_keys="ReturnTransaction.current_sale_id",
                                       back_populates="current_sale", cascade="all, delete-orphan")

    def to_dict(self):
        import json
        from app.models.base import format_iso_datetime
        deductions_list = []
        if self.deductions:
            try:
                deductions_list = json.loads(self.deductions)
            except Exception:
                deductions_list = []
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
            "createdAt": format_iso_datetime(self.created_at),
            "customerOutstandingBalance": self.customer.outstanding_balance if self.customer else 0,
            "items": [i.to_dict() for i in self.items],
            "deductions": deductions_list,
            "returnTransactions": [rt.to_dict() for rt in self.return_transactions],
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


class ReturnTransaction(db.Model):
    """
    Represents a return event — either during billing (current_sale_id set) or standalone.
    A single return transaction may contain multiple ReturnItems.
    """
    __tablename__ = "return_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    return_number: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    # The new sale being created at the time of return (nullable for standalone returns)
    current_sale_id: Mapped[int | None] = mapped_column(ForeignKey("retail_sales.id"), nullable=True)
    # The original invoice being returned against (nullable when return has no specific invoice)
    original_sale_id: Mapped[int | None] = mapped_column(ForeignKey("retail_sales.id"), nullable=True)
    original_invoice_ref: Mapped[str | None] = mapped_column(String(40), nullable=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    cashier_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    total_return_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # paise
    notes: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    current_sale = relationship("RetailSale", foreign_keys=[current_sale_id],
                                back_populates="return_transactions")
    original_sale = relationship("RetailSale", foreign_keys=[original_sale_id])
    customer = relationship("Customer")
    cashier = relationship("User")
    items = relationship("ReturnItem", back_populates="return_transaction", cascade="all, delete-orphan")

    def to_dict(self):
        from app.models.base import format_iso_datetime
        return {
            "id": self.id,
            "returnNumber": self.return_number,
            "currentSaleId": self.current_sale_id,
            "originalSaleId": self.original_sale_id,
            "originalInvoiceRef": self.original_invoice_ref,
            "customerId": self.customer_id,
            "customerName": self.customer.name if self.customer else None,
            "cashierId": self.cashier_id,
            "cashierName": self.cashier.name if self.cashier else None,
            "totalReturnValue": self.total_return_value,
            "notes": self.notes,
            "createdAt": format_iso_datetime(self.created_at),
            "items": [i.to_dict() for i in self.items],
        }


class ReturnItem(db.Model):
    """One line in a return transaction — a specific product + quantity + price."""
    __tablename__ = "return_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    return_transaction_id: Mapped[int] = mapped_column(ForeignKey("return_transactions.id"), nullable=False)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)  # product name or custom label
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)  # paise
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False)    # paise
    original_invoice_ref: Mapped[str | None] = mapped_column(String(40), nullable=True)

    return_transaction = relationship("ReturnTransaction", back_populates="items")
    product = relationship("Product")

    def to_dict(self):
        return {
            "id": self.id,
            "returnTransactionId": self.return_transaction_id,
            "productId": self.product_id,
            "productName": self.product.name if self.product else self.label,
            "label": self.label,
            "quantity": self.quantity,
            "unitPrice": self.unit_price,
            "subtotal": self.subtotal,
            "originalInvoiceRef": self.original_invoice_ref,
        }
