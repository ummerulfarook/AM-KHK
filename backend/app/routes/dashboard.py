"""
Dashboard blueprint — real-time aggregation API.
All monetary values returned in paise (integer).
"""
from datetime import datetime, date, timedelta, timezone
from flask import Blueprint, jsonify
from flask_login import login_required
from sqlalchemy import func, and_

from app import db
from app.models.sale import RetailSale, SaleItem
from app.models.order import WholesaleOrder
from app.models.credit import CreditLedger
from app.models.expense import Expense
from app.models.product import Product
from app.models.customer import Customer

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


def _today_range():
    """Return (start_of_today, end_of_today) as UTC-aware datetimes."""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    return start, end


@dashboard_bp.route("/", methods=["GET"])
@login_required
def get_dashboard():
    """Aggregate dashboard data from real DB rows."""
    from app.routes.credit import update_credit_statuses
    update_credit_statuses()
    today_start, today_end = _today_range()
    today_date = date.today()

    # ── Today's retail sales ────────────────────────────────────────────────
    retail_today = db.session.execute(
        db.select(func.coalesce(func.sum(RetailSale.total), 0))
        .where(
            RetailSale.created_at >= today_start,
            RetailSale.created_at <= today_end,
        )
    ).scalar() or 0

    # ── Today's wholesale orders (delivered today) ──────────────────────────
    wholesale_today = db.session.execute(
        db.select(func.coalesce(func.sum(WholesaleOrder.total_amount), 0))
        .where(
            WholesaleOrder.delivery_date == today_date,
            WholesaleOrder.status == "delivered",
        )
    ).scalar() or 0

    # ── Credit summary ───────────────────────────────────────────────────────
    credit_rows = db.session.execute(
        db.select(
            CreditLedger.status,
            func.coalesce(func.sum(CreditLedger.amount - CreditLedger.amount_paid), 0).label("balance"),
        )
        .where(CreditLedger.status != "paid")
        .group_by(CreditLedger.status)
    ).all()

    credit_total = sum(r.balance for r in credit_rows)
    credit_overdue = next((r.balance for r in credit_rows if r.status == "overdue"), 0)
    credit_due_soon = next((r.balance for r in credit_rows if r.status == "due_soon"), 0)

    # ── Today's approved expenses ────────────────────────────────────────────
    expenses_today = db.session.execute(
        db.select(func.coalesce(func.sum(Expense.amount), 0))
        .where(
            Expense.expense_date == today_date,
            Expense.status == "approved",
        )
    ).scalar() or 0

    # Net profit = total sales - expenses (simplified: retail + wholesale - expenses)
    net_profit = (retail_today + wholesale_today) - expenses_today

    # ── Weekly sales — last 7 days ───────────────────────────────────────────
    weekly_sales = []
    for i in range(6, -1, -1):
        day = today_date - timedelta(days=i)
        day_start = datetime.combine(day, datetime.min.time()).replace(tzinfo=timezone.utc)
        day_end = datetime.combine(day, datetime.max.time()).replace(tzinfo=timezone.utc)

        retail_day = db.session.execute(
            db.select(func.coalesce(func.sum(RetailSale.total), 0))
            .where(
                RetailSale.created_at >= day_start,
                RetailSale.created_at <= day_end,
            )
        ).scalar() or 0

        wholesale_day = db.session.execute(
            db.select(func.coalesce(func.sum(WholesaleOrder.total_amount), 0))
            .where(
                WholesaleOrder.delivery_date == day,
                WholesaleOrder.status == "delivered",
            )
        ).scalar() or 0

        weekly_sales.append({
            "date": day.strftime("%a"),
            "fullDate": day.isoformat(),
            "retail": retail_day,
            "wholesale": wholesale_day,
            "total": retail_day + wholesale_day,
        })

    # ── Top 5 selling products (by qty sold all-time) ────────────────────────
    top_products_rows = db.session.execute(
        db.select(
            SaleItem.product_id,
            Product.name,
            Product.unit,
            func.sum(SaleItem.quantity).label("qty_sold"),
        )
        .join(Product, SaleItem.product_id == Product.id)
        .group_by(SaleItem.product_id, Product.name, Product.unit)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(5)
    ).all()

    top_products = [
        {
            "productId": r.product_id,
            "name": r.name,
            "unit": r.unit,
            "qtySold": float(r.qty_sold),
        }
        for r in top_products_rows
    ]

    # ── Low-stock alerts ─────────────────────────────────────────────────────
    low_stock_rows = db.session.execute(
        db.select(Product)
        .where(
            Product.is_active == 1,
            Product.current_stock <= Product.low_stock_threshold,
        )
        .order_by(Product.current_stock.asc())
        .limit(10)
    ).scalars().all()

    low_stock_alerts = [
        {
            "productId": p.id,
            "name": p.name,
            "unit": p.unit,
            "currentStock": p.current_stock,
            "threshold": p.low_stock_threshold,
            "stockStatus": p.stock_status,
            "iconKey": p.icon_key,
        }
        for p in low_stock_rows
    ]

    # ── Recent transactions (last 10 retail sales) ───────────────────────────
    recent_sales = db.session.execute(
        db.select(RetailSale)
        .order_by(RetailSale.created_at.desc())
        .limit(10)
    ).scalars().all()

    recent_transactions = [
        {
            "id": s.id,
            "invoiceNumber": s.invoice_number,
            "customerName": s.customer.name if s.customer else "Walk-in",
            "total": s.total,
            "paymentMethod": s.payment_method,
            "createdAt": s.created_at.isoformat(),
        }
        for s in recent_sales
    ]

    # ── Overdue credits (top 5) ──────────────────────────────────────────────
    overdue_rows = db.session.execute(
        db.select(CreditLedger)
        .where(CreditLedger.status == "overdue")
        .order_by((CreditLedger.amount - CreditLedger.amount_paid).desc())
        .limit(5)
    ).scalars().all()

    # Also get due_soon rows
    due_soon_rows = db.session.execute(
        db.select(CreditLedger)
        .where(CreditLedger.status == "due_soon")
        .order_by(CreditLedger.due_date.asc())
        .limit(5)
    ).scalars().all()

    overdue_credits = [
        {
            "id": r.id,
            "customerId": r.customer_id,
            "customerName": r.customer.name if r.customer else "—",
            "customerPhone": r.customer.phone if r.customer else None,
            "balance": r.balance,
            "dueDate": r.due_date.isoformat() if r.due_date else None,
            "status": r.status,
            "invoiceRef": r.invoice_ref,
        }
        for r in (overdue_rows + due_soon_rows)
    ]

    return jsonify({
        "todaySales": {
            "retail": retail_today,
            "wholesale": wholesale_today,
            "total": retail_today + wholesale_today,
        },
        "pendingCredits": {
            "total": credit_total,
            "overdue": credit_overdue,
            "dueSoon": credit_due_soon,
        },
        "todayExpenses": expenses_today,
        "netProfit": net_profit,
        "weeklySales": weekly_sales,
        "topProducts": top_products,
        "lowStockAlerts": low_stock_alerts,
        "recentTransactions": recent_transactions,
        "overdueCredits": overdue_credits,
    }), 200
