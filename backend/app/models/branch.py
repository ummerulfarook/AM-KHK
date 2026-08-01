"""Branch model."""
from datetime import datetime, timezone
from sqlalchemy import Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app import db


class Branch(db.Model):
    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str | None] = mapped_column(String(300))
    phone: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self):
        return {"id": self.id, "name": self.name, "address": self.address, "phone": self.phone}
