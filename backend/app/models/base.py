"""
AM & KHK Vegetable Merchants ERP
SQLAlchemy declarative base shared by all models.
"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from datetime import datetime, timezone

def format_iso_datetime(dt: datetime) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()
