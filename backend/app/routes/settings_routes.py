"""
Settings blueprint — full implementation for Shop Profile,
ESC/POS Printer config, Owner-only User CRUD, and Database Backups (Milestone 7).
"""
import os
import shutil
from flask import Blueprint, request, jsonify, send_file
from flask_login import login_required, current_user
from sqlalchemy import func
from app import db
from app.models.settings import Setting
from app.models.user import User
from app.services.auth_service import hash_password
from app.utils.role_guard import require_roles

settings_bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@settings_bp.route("/", methods=["GET"])
@login_required
def get_settings():
    """Retrieve all shop settings as a key-value dictionary."""
    rows = db.session.execute(db.select(Setting)).scalars().all()
    settings_dict = {r.key: r.value for r in rows}
    
    # Return default fallbacks if settings don't exist in DB yet
    defaults = {
        "shop_name": "AM & KHK Vegetable Merchants",
        "shop_phone": "",
        "shop_address": "",
        "gstin": "",
        "credit_days": "30",
        "invoice_prefix": "INV",
        "printer_type": "usb",
        "printer_usb_vendor_id": "",
        "printer_usb_product_id": "",
        "printer_serial_port": "",
        "printer_serial_baud": "9600",
        "printer_ip": "",
        "printer_port": "9100",
        "upi_accounts": "[]",
        "bank_accounts": "[]",
    }
    for k, v in defaults.items():
        if k not in settings_dict:
            settings_dict[k] = v

    return jsonify({"data": settings_dict}), 200


@settings_bp.route("/", methods=["POST"])
@login_required
@require_roles("owner")
def save_settings():
    """Save/update settings (owner only)."""
    data = request.get_json(silent=True) or {}
    
    try:
        for k, v in data.items():
            setting = db.session.execute(
                db.select(Setting).where(Setting.key == k)
            ).scalar_one_or_none()

            if not setting:
                setting = Setting(key=k, value=str(v) if v is not None else None)
                db.session.add(setting)
            else:
                setting.value = str(v) if v is not None else None

        db.session.commit()
        return jsonify({"message": "Settings updated successfully"}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to save settings: {exc}"}), 500


# ── Owner-Only User Management CRUD ───────────────────────────────────────────

@settings_bp.route("/users", methods=["GET"])
@login_required
@require_roles("owner")
def list_users():
    """List all system users (owner only)."""
    users = db.session.execute(
        db.select(User).order_by(User.id)
    ).scalars().all()
    return jsonify({"data": [u.to_dict() for u in users]}), 200


@settings_bp.route("/users", methods=["POST"])
@login_required
@require_roles("owner")
def create_user():
    """Create a new user account (owner only)."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    password = data.get("password")
    role = (data.get("role") or "cashier").strip()
    phone = (data.get("phone") or "").strip() or None

    if not name or not password:
        return jsonify({"error": "Username and password are required"}), 422

    VALID_ROLES = {"owner", "manager", "accountant", "cashier"}
    if role not in VALID_ROLES:
        return jsonify({"error": f"Invalid role. Must be one of {VALID_ROLES}"}), 422

    # Check if username (name) is already taken
    existing = db.session.execute(
        db.select(User).where(User.name == name)
    ).scalar_one_or_none()
    if existing:
        return jsonify({"error": f"Username '{name}' is already taken"}), 422

    try:
        user = User(
            name=name,
            password_hash=hash_password(password),
            role=role,
            phone=phone,
            status="active"
        )
        db.session.add(user)
        db.session.commit()
        return jsonify({"data": user.to_dict(), "message": "User created successfully"}), 201
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to create user: {exc}"}), 500


@settings_bp.route("/users/<int:user_id>", methods=["PUT"])
@login_required
@require_roles("owner")
def update_user(user_id: int):
    """Update system user details and roles (owner only)."""
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    password = data.get("password")

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Username is required"}), 422
        if name != user.name:
            existing = db.session.execute(
                db.select(User).where(User.name == name)
            ).scalar_one_or_none()
            if existing:
                return jsonify({"error": f"Username '{name}' is already taken"}), 422
            user.name = name

    if "role" in data:
        role = (data.get("role") or "").strip()
        VALID_ROLES = {"owner", "manager", "accountant", "cashier"}
        if role not in VALID_ROLES:
            return jsonify({"error": "Invalid role"}), 422
        if user.id == current_user.id and role != "owner":
            return jsonify({"error": "You cannot change your own role from owner"}), 422
        user.role = role

    if "status" in data:
        status = (data.get("status") or "").strip()
        if status not in ("active", "inactive"):
            return jsonify({"error": "Status must be active or inactive"}), 422
        if user.id == current_user.id and status == "inactive":
            return jsonify({"error": "You cannot deactivate your own owner account"}), 422
        user.status = status

    if "phone" in data:
        user.phone = (data.get("phone") or "").strip() or None

    try:
        if password and password.strip():
            user.password_hash = hash_password(password)

        db.session.commit()
        return jsonify({"data": user.to_dict(), "message": "User updated successfully"}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to update user: {exc}"}), 500


# ── SQLite Database Backup & Restore ──────────────────────────────────────────

@settings_bp.route("/backup", methods=["GET"])
@login_required
@require_roles("owner")
def download_backup():
    """Stream SQLite database file for download (owner only)."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    db_path = os.path.join(base_dir, "backend", "data", "amkhk.db")

    if not os.path.exists(db_path):
        # try fallback data dir resolver
        db_path = os.path.join(base_dir, "data", "amkhk.db")

    if not os.path.exists(db_path):
        return jsonify({"error": "Database file not found"}), 404

    return send_file(
        db_path,
        mimetype="application/x-sqlite3",
        as_attachment=True,
        download_name="amkhk_backup.db"
    )


@settings_bp.route("/restore", methods=["POST"])
@login_required
@require_roles("owner")
def restore_database():
    """Restore SQLite database by uploading a backup .db file (owner only)."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 422

    f = request.files["file"]
    if not f.filename.endswith(".db"):
        return jsonify({"error": "File must have .db extension"}), 422

    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    db_path = os.path.join(base_dir, "backend", "data", "amkhk.db")
    if not os.path.exists(db_path):
        db_path = os.path.join(base_dir, "data", "amkhk.db")

    try:
        # 1. Close current connection pool to prevent locks/corruption during file write
        db.session.remove()
        db.engine.dispose()

        # 2. Write file
        f.save(db_path)
        
        return jsonify({"message": "Database restored successfully. Please refresh the page."}), 200
    except Exception as exc:
        return jsonify({"error": f"Failed to restore database: {exc}"}), 500
