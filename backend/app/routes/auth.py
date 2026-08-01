"""
Auth blueprint — login, logout, me, and user management.
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user
from sqlalchemy.orm import Session

from ..models import User
from ..services.auth_service import check_password
from ..schemas.auth_schema import LoginRequest

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate a user and create a session."""
    try:
        payload = LoginRequest.from_json(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify({"error": "Validation failed", "details": exc.args[0]}), 422

    from .. import db
    user: User | None = db.session.execute(
        db.select(User).where(User.name == payload.username, User.status == "active")
    ).scalar_one_or_none()

    if user is None or not check_password(payload.password, user.password_hash):
        return jsonify({"error": "Invalid username or password"}), 401

    # Update last_active
    user.last_active = datetime.now(timezone.utc)
    db.session.commit()

    login_user(user, remember=True)
    return jsonify({"message": "Login successful", "user": user.to_dict()}), 200


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    """Destroy the current session."""
    logout_user()
    return jsonify({"message": "Logged out"}), 200


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    """Return the currently authenticated user."""
    return jsonify({"user": current_user.to_dict()}), 200
