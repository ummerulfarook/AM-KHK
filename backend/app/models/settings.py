"""Settings key/value store model."""
from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app import db


class Setting(db.Model):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    value: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(String(200))

    def to_dict(self):
        return {"key": self.key, "value": self.value}
