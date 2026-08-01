"""
Expenses blueprint — full implementation of Expense logging with approvals (Milestone 6).
"""
from datetime import datetime, date, timezone
from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import func, or_
from app import db
from app.models.expense import Expense
from app.utils.role_guard import require_roles

expenses_bp = Blueprint("expenses", __name__, url_prefix="/api/expenses")


def _rupees_to_paise(val) -> int:
    try:
        return int(Decimal(str(val)) * 100)
    except (TypeError, ValueError):
        return 0


@expenses_bp.route("/", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def list_expenses():
    """List expenses with filters and pagination."""
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, request.args.get("perPage", 25, type=int))
    category = request.args.get("category", "").strip()
    status = request.args.get("status", "").strip()
    date_from = request.args.get("dateFrom")
    date_to = request.args.get("dateTo")

    stmt = db.select(Expense)

    if category:
        stmt = stmt.where(Expense.category == category)
    if status:
        stmt = stmt.where(Expense.status == status)
    if date_from:
        try:
            stmt = stmt.where(Expense.expense_date >= date.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            stmt = stmt.where(Expense.expense_date <= date.fromisoformat(date_to))
        except ValueError:
            pass

    total = db.session.execute(
        db.select(func.count()).select_from(stmt.subquery())
    ).scalar() or 0

    expenses = db.session.execute(
        stmt.order_by(Expense.expense_date.desc(), Expense.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).scalars().all()

    # Summary metrics
    pending_approvals = db.session.execute(
        db.select(func.count()).select_from(Expense).where(Expense.status == "pending")
    ).scalar() or 0

    total_approved = db.session.execute(
        db.select(func.sum(Expense.amount)).where(Expense.status == "approved")
    ).scalar() or 0

    return jsonify({
        "data": [e.to_dict() for e in expenses],
        "summary": {
            "pendingApprovals": pending_approvals,
            "totalApproved": total_approved
        },
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, -(-total // per_page))
        }
    }), 200


@expenses_bp.route("/", methods=["POST"])
@login_required
@require_roles("owner", "manager", "accountant")
def create_expense():
    """Create a new expense entry (defaults to pending approval)."""
    data = request.get_json(silent=True) or {}
    category = (data.get("category") or "misc").strip()
    
    VALID_CATEGORIES = {"transport", "labour", "fuel", "electricity", "rent", "misc"}
    if category not in VALID_CATEGORIES:
        return jsonify({"error": f"Invalid category. Must be one of {VALID_CATEGORIES}"}), 422

    amount_rs = data.get("amount")
    if amount_rs is None:
        return jsonify({"error": "Amount is required"}), 422

    amount = _rupees_to_paise(amount_rs)
    if amount <= 0:
        return jsonify({"error": "Amount must be greater than zero"}), 422

    expense_date_str = data.get("expenseDate")
    if not expense_date_str:
        expense_date = date.today()
    else:
        try:
            expense_date = date.fromisoformat(expense_date_str)
        except ValueError:
            return jsonify({"error": "Invalid expenseDate format (YYYY-MM-DD)"}), 422

    notes = (data.get("notes") or "").strip() or None

    expense = Expense(
        category=category,
        amount=amount,
        expense_date=expense_date,
        notes=notes,
        status="pending",
        recorded_by_id=current_user.id
    )
    db.session.add(expense)
    db.session.commit()

    return jsonify({"data": expense.to_dict(), "message": "Expense logged successfully"}), 201


@expenses_bp.route("/<int:exp_id>", methods=["PUT"])
@login_required
@require_roles("owner", "manager", "accountant")
def update_expense(exp_id: int):
    """Update expense details (only allowed if status is 'pending')."""
    expense = db.session.get(Expense, exp_id)
    if not expense:
        return jsonify({"error": "Expense not found"}), 404
    if expense.status != "pending":
        return jsonify({"error": "Only pending expenses can be modified"}), 422

    data = request.get_json(silent=True) or {}
    category = (data.get("category") or expense.category).strip()
    
    VALID_CATEGORIES = {"transport", "labour", "fuel", "electricity", "rent", "misc"}
    if category not in VALID_CATEGORIES:
        return jsonify({"error": f"Invalid category. Must be one of {VALID_CATEGORIES}"}), 422

    amount_rs = data.get("amount")
    if amount_rs is not None:
        amount = _rupees_to_paise(amount_rs)
        if amount <= 0:
            return jsonify({"error": "Amount must be greater than zero"}), 422
        expense.amount = amount

    expense_date_str = data.get("expenseDate")
    if expense_date_str:
        try:
            expense.expense_date = date.fromisoformat(expense_date_str)
        except ValueError:
            return jsonify({"error": "Invalid expenseDate format (YYYY-MM-DD)"}), 422

    expense.category = category
    expense.notes = (data.get("notes") or "").strip() or None

    db.session.commit()
    return jsonify({"data": expense.to_dict(), "message": "Expense details updated successfully"}), 200


@expenses_bp.route("/<int:exp_id>/status", methods=["PATCH"])
@login_required
@require_roles("owner", "accountant")
def approve_reject_expense(exp_id: int):
    """Approve or reject a logged expense."""
    expense = db.session.get(Expense, exp_id)
    if not expense:
        return jsonify({"error": "Expense not found"}), 404

    data = request.get_json(silent=True) or {}
    new_status = (data.get("status") or "").strip()
    if new_status not in ("approved", "rejected"):
        return jsonify({"error": "Status must be approved or rejected"}), 422

    expense.status = new_status
    expense.approved_by_id = current_user.id
    db.session.commit()

    return jsonify({"data": expense.to_dict(), "message": f"Expense successfully {new_status}"}), 200


@expenses_bp.route("/<int:exp_id>", methods=["DELETE"])
@login_required
@require_roles("owner", "manager")
def delete_expense(exp_id: int):
    """Delete an expense entry (only allowed if status is 'pending')."""
    expense = db.session.get(Expense, exp_id)
    if not expense:
        return jsonify({"error": "Expense not found"}), 404
    if expense.status != "pending":
        return jsonify({"error": "Only pending expenses can be deleted"}), 422

    db.session.delete(expense)
    db.session.commit()

    return jsonify({"message": "Expense deleted successfully"}), 200
