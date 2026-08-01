"""
User model — stores shop staff accounts.
Role: owner | manager | accountant | cashier
Password is bcrypt-hashed; never store plain text.
"""
from datetime import datetime, timezone
from sqlalchemy import Integer, String, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from flask_login import UserMixin
from app import db


class User(db.Model, UserMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(
        SAEnum("owner", "manager", "accountant", "cashier", name="user_role"),
        nullable=False,
        default="cashier",
    )
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[str] = mapped_column(
        SAEnum("active", "inactive", name="user_status"),
        nullable=False,
        default="active",
    )
    last_active: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # relationships
    sales = relationship("RetailSale", back_populates="cashier")
    expenses = relationship("Expense", foreign_keys="Expense.recorded_by_id", back_populates="recorded_by_user")
    payments = relationship("Payment", back_populates="recorded_by_user")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "phone": self.phone,
            "role": self.role,
            "status": self.status,
            "lastActive": self.last_active.isoformat() if self.last_active else None,
            "createdAt": self.created_at.isoformat(),
        }
