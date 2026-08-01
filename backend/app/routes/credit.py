from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import func, or_
from app import db
from app.models.credit import CreditLedger, Payment
from app.models.customer import Customer
from app.models.sale import RetailSale
from app.models.order import WholesaleOrder
from app.utils.role_guard import require_roles

credit_bp = Blueprint("credit", __name__, url_prefix="/api/credit")


def _rupees_to_paise(val) -> int:
    try:
        return int(Decimal(str(val)) * 100)
    except (TypeError, ValueError):
        return 0


def update_credit_statuses():
    """Automatically transition due dates to overdue/due_soon based on today's date."""
    today = date.today()
    due_soon_threshold = today + timedelta(days=3)

    # 1. Transition to overdue
    db.session.execute(
        db.update(CreditLedger)
        .where(CreditLedger.status.in_(["due", "due_soon"]))
        .where(CreditLedger.due_date < today)
        .values(status="overdue")
    )

    # 2. Transition to due_soon (within 3 days)
    db.session.execute(
        db.update(CreditLedger)
        .where(CreditLedger.status == "due")
        .where(CreditLedger.due_date >= today)
        .where(CreditLedger.due_date <= due_soon_threshold)
        .values(status="due_soon")
    )

    db.session.commit()


@credit_bp.route("/", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def list_credit():
    """List credit entries with search, status filters, and pagination."""
    update_credit_statuses()
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, request.args.get("perPage", 25, type=int))
    status = request.args.get("status", "").strip()
    search = request.args.get("search", "").strip()

    stmt = db.select(CreditLedger).join(Customer)

    if status:
        stmt = stmt.where(CreditLedger.status == status)
    if search:
        stmt = stmt.where(Customer.name.ilike(f"%{search}%"))

    total = db.session.execute(
        db.select(func.count()).select_from(stmt.subquery())
    ).scalar() or 0

    entries = db.session.execute(
        stmt.order_by(CreditLedger.due_date.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).scalars().all()

    # Calculate aggregate summary metrics
    # 1. Total Outstanding
    total_outstanding = db.session.execute(
        db.select(func.sum(CreditLedger.amount - CreditLedger.amount_paid))
        .where(CreditLedger.status != "paid")
    ).scalar() or 0

    # 2. Overdue Balance
    overdue_balance = db.session.execute(
        db.select(func.sum(CreditLedger.amount - CreditLedger.amount_paid))
        .where(CreditLedger.status == "overdue")
    ).scalar() or 0

    # 3. Collected Today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    collected_today = db.session.execute(
        db.select(func.sum(Payment.amount))
        .where(Payment.recorded_at >= today_start)
    ).scalar() or 0

    return jsonify({
        "data": [e.to_dict() for e in entries],
        "summary": {
            "totalOutstanding": total_outstanding,
            "overdueBalance": overdue_balance,
            "collectedToday": collected_today
        },
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, -(-total // per_page))
        }
    }), 200


@credit_bp.route("/<int:entry_id>/pay", methods=["POST"])
@login_required
@require_roles("owner", "manager", "accountant")
def record_payment(entry_id: int):
    """Record a payment towards an outstanding credit entry."""
    entry = db.session.get(CreditLedger, entry_id)
    if not entry:
        return jsonify({"error": "Credit ledger entry not found"}), 404

    if entry.status == "paid":
        return jsonify({"error": "This entry has already been fully paid"}), 422

    data = request.get_json(silent=True) or {}
    amount_rs = data.get("amount")
    if amount_rs is None:
        return jsonify({"error": "Amount is required"}), 422

    amount = _rupees_to_paise(amount_rs)
    if amount <= 0:
        return jsonify({"error": "Amount must be greater than zero"}), 422

    balance = entry.amount - entry.amount_paid
    if amount > balance:
        return jsonify({"error": f"Payment amount ({amount_rs}) exceeds outstanding balance ({balance/100:.2f})"}), 422

    method = (data.get("method") or "cash").strip()
    if method not in ("cash", "upi", "bank"):
        return jsonify({"error": "Method must be cash, upi, or bank"}), 422

    notes = (data.get("notes") or "").strip() or None
    upi_id = data.get("upiId")

    try:
        # 1. Record payment row
        payment = Payment(
            credit_ledger_id=entry.id,
            amount=amount,
            method=method,
            upi_id=upi_id,
            recorded_by_id=current_user.id,
            notes=notes
        )
        db.session.add(payment)

        # 2. Update credit ledger entry and customer outstanding balance
        entry.amount_paid += amount
        if entry.customer:
            entry.customer.outstanding_balance = max(0, entry.customer.outstanding_balance - amount)
            entry.customer.opening_balance = entry.customer.outstanding_balance
            
        if entry.amount_paid >= entry.amount:
            entry.status = "paid"
            entry.paid_at = datetime.now(timezone.utc)

        # 3. If wholesale order, check if we should update wholesale order payment status
        if entry.wholesale_order_id:
            order = db.session.get(WholesaleOrder, entry.wholesale_order_id)
            if order:
                if entry.amount_paid >= entry.amount:
                    order.payment_status = "paid"
                elif entry.amount_paid > 0:
                    order.payment_status = "partial"

        db.session.commit()
        return jsonify({
            "data": entry.to_dict(),
            "message": "Payment recorded successfully"
        }), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to record payment: {exc}"}), 500
