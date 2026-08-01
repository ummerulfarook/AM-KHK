"""Expense and Income models. All amounts in paise."""
from datetime import datetime, date, timezone
from sqlalchemy import Integer, String, DateTime, Date, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app import db


class Expense(db.Model):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(
        SAEnum("transport", "labour", "fuel", "electricity", "rent", "misc",
               name="expense_category"),
        nullable=False, default="misc",
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        SAEnum("pending", "approved", "rejected", name="expense_status"),
        nullable=False, default="pending",
    )
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    recorded_by_user = relationship("User", foreign_keys=[recorded_by_id], back_populates="expenses")
    approved_by_user = relationship("User", foreign_keys=[approved_by_id])

    def to_dict(self):
        return {
            "id": self.id, "category": self.category, "amount": self.amount,
            "expenseDate": self.expense_date.isoformat(), "notes": self.notes,
            "status": self.status, "recordedById": self.recorded_by_id,
            "recordedByName": self.recorded_by_user.name if self.recorded_by_user else None,
            "approvedById": self.approved_by_id, "createdAt": self.created_at.isoformat(),
        }


class Income(db.Model):
    __tablename__ = "income"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    income_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    def to_dict(self):
        return {
            "id": self.id, "source": self.source, "amount": self.amount,
            "incomeDate": self.income_date.isoformat(), "notes": self.notes,
            "createdAt": self.created_at.isoformat(),
        }
