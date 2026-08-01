"""Supplier model."""
from datetime import datetime, timezone
from sqlalchemy import Integer, String, DateTime, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app import db


class Supplier(db.Model):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(20))
    rating: Mapped[float | None] = mapped_column(Float)
    payment_terms: Mapped[str | None] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    products = relationship("Product", back_populates="supplier")
    purchase_orders = relationship("PurchaseOrder", back_populates="supplier", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "location": self.location,
            "phone": self.phone, "rating": self.rating,
            "paymentTerms": self.payment_terms, "isActive": bool(self.is_active),
            "createdAt": self.created_at.isoformat(),
        }
