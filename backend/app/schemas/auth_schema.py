"""
Auth schema — request validation for login and related endpoints.
"""
from dataclasses import dataclass


@dataclass
class LoginRequest:
    username: str
    password: str

    @classmethod
    def from_json(cls, data: dict) -> "LoginRequest":
        errors = {}
        username = data.get("username", "").strip()
        password = data.get("password", "")
        if not username:
            errors["username"] = "Username is required"
        if not password:
            errors["password"] = "Password is required"
        if errors:
            raise ValueError(errors)
        return cls(username=username, password=password)
