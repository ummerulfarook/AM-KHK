"""Credit ledger and payment models. All amounts in paise."""
from datetime import datetime, date, timezone
from sqlalchemy import Integer, String, DateTime, Date, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app import db


class CreditLedger(db.Model):
    __tablename__ = "credit_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("retail_sales.id"))
    wholesale_order_id: Mapped[int | None] = mapped_column(ForeignKey("wholesale_orders.id"))
    invoice_ref: Mapped[str | None] = mapped_column(String(40))
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        SAEnum("due", "due_soon", "overdue", "paid", name="credit_status"),
        nullable=False, default="due",
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    customer = relationship("Customer", back_populates="credit_entries")
    sale = relationship("RetailSale", back_populates="credit_entries")
    payments = relationship("Payment", back_populates="credit_entry", cascade="all, delete-orphan")

    @property
    def balance(self):
        return self.amount - self.amount_paid

    def to_dict(self):
        from app.models.base import format_iso_datetime
        return {
            "id": self.id, "customerId": self.customer_id,
            "customerName": self.customer.name if self.customer else None,
            "saleId": self.sale_id, "wholesaleOrderId": self.wholesale_order_id,
            "invoiceRef": self.invoice_ref, "amount": self.amount,
            "amountPaid": self.amount_paid, "balance": self.balance,
            "dueDate": self.due_date.isoformat() if self.due_date else None,
            "status": self.status,
            "paidAt": format_iso_datetime(self.paid_at),
            "createdAt": format_iso_datetime(self.created_at),
        }


class Payment(db.Model):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    credit_ledger_id: Mapped[int] = mapped_column(ForeignKey("credit_ledger.id"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(
        SAEnum("cash", "upi", "bank", name="payment_method_enum"),
        nullable=False, default="cash",
    )
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    upi_id: Mapped[str | None] = mapped_column(String(100))
    bank_name: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(String(200))
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    credit_entry = relationship("CreditLedger", back_populates="payments")
    recorded_by_user = relationship("User", back_populates="payments")

    def to_dict(self):
        from app.models.base import format_iso_datetime
        return {
            "id": self.id, "creditLedgerId": self.credit_ledger_id,
            "invoiceRef": self.credit_entry.invoice_ref if self.credit_entry else None,
            "amount": self.amount, "method": self.method,
            "upiId": self.upi_id,
            "bankName": self.bank_name,
            "recordedById": self.recorded_by_id,
            "recordedByName": self.recorded_by_user.name if self.recorded_by_user else None,
            "notes": self.notes, "recordedAt": format_iso_datetime(self.recorded_at),
        }
