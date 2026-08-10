"""Customer model."""
from datetime import datetime, timezone
from sqlalchemy import Integer, String, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app import db


class Customer(db.Model):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(String(300))
    type: Mapped[str] = mapped_column(
        SAEnum("wholesale", "retail", name="customer_type"),
        nullable=False, default="retail",
    )
    credit_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    opening_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    outstanding_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)
    partner: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    sales = relationship("RetailSale", back_populates="customer")
    wholesale_orders = relationship("WholesaleOrder", back_populates="customer")
    credit_entries = relationship("CreditLedger", back_populates="customer", cascade="all, delete-orphan")
    stores = relationship("CustomerStore", back_populates="customer", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "phone": self.phone,
            "address": self.address, "type": self.type,
            "creditLimit": self.credit_limit,
            "openingBalance": self.opening_balance,
            "outstandingBalance": self.outstanding_balance,
            "isActive": bool(self.is_active),
            "partner": self.partner,
            "createdAt": self.created_at.isoformat(),
            "stores": [s.to_dict() for s in self.stores],
        }


class CustomerStore(db.Model):
    __tablename__ = "customer_stores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    customer = relationship("Customer", back_populates="stores")

    def to_dict(self):
        return {
            "id": self.id,
            "customerId": self.customer_id,
            "name": self.name,
            "isActive": bool(self.is_active),
            "createdAt": self.created_at.isoformat(),
        }


import threading
from sqlalchemy import event

_local = threading.local()

@event.listens_for(Customer.opening_balance, 'set')
def receive_opening_balance_set(target, value, oldvalue, initiator):
    if getattr(_local, 'in_sync', False):
        return
    _local.in_sync = True
    try:
        if target.outstanding_balance != value:
            target.outstanding_balance = value
    finally:
        _local.in_sync = False

@event.listens_for(Customer.outstanding_balance, 'set')
def receive_outstanding_balance_set(target, value, oldvalue, initiator):
    if getattr(_local, 'in_sync', False):
        return
    _local.in_sync = True
    try:
        if target.opening_balance != value:
            target.opening_balance = value
    finally:
        _local.in_sync = False
