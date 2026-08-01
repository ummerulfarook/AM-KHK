"""
Authentication service — password hashing and user lookup helpers.
"""
from flask_bcrypt import Bcrypt

bcrypt = Bcrypt()


def hash_password(plain: str) -> str:
    """Return bcrypt hash of the plain-text password."""
    return bcrypt.generate_password_hash(plain).decode("utf-8")


def check_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches the stored bcrypt hash."""
    return bcrypt.check_password_hash(hashed, plain)
