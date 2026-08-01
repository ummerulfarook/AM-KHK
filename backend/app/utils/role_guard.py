"""
Role guard decorator — enforces server-side role-based access control.

Usage:
    @require_roles("owner", "manager")
    def my_route():
        ...
"""
from functools import wraps
from flask import jsonify
from flask_login import current_user


def require_roles(*roles):
    """Decorator that restricts a route to users with one of the given roles."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({"error": "Authentication required"}), 401
            if current_user.role not in roles:
                return jsonify({"error": "Insufficient permissions"}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator
