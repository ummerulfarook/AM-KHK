"""
Reports blueprint — full implementation of Profit & Loss analytics and Excel exporter (Milestone 6).
"""
import io
from datetime import datetime, date, timedelta, timezone
from flask import Blueprint, request, jsonify, send_file
from flask_login import login_required
from sqlalchemy import func
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill
from app import db
from app.models.sale import RetailSale, SaleItem
from app.models.order import WholesaleOrder, WholesaleOrderItem, PurchaseOrder
from app.models.expense import Expense
from app.models.product import Product
from app.models.customer import Customer
from app.models.credit import CreditLedger, Payment
from app.utils.role_guard import require_roles

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def _get_date_filters():
    date_from = request.args.get("dateFrom")
    date_to = request.args.get("dateTo")

    start_date = None
    end_date = None

    if date_from:
        try:
            start_date = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    if date_to:
        try:
            end_date = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    return start_date, end_date


@reports_bp.route("/dashboard", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def get_reports_dashboard():
    """Retrieve financial report aggregates: POS vs Wholesale, COGS, Net Profit, category expenses, and sales trends."""
    start_date, end_date = _get_date_filters()

    # 1. Retail Sales Revenue & Items for COGS
    rs_stmt = db.select(RetailSale)
    if start_date:
        rs_stmt = rs_stmt.where(RetailSale.created_at >= start_date)
    if end_date:
        rs_stmt = rs_stmt.where(RetailSale.created_at <= end_date)

    retail_sales = db.session.execute(rs_stmt).scalars().all()
    retail_revenue = sum(s.total for s in retail_sales)
    
    # Calculate POS COGS
    retail_cogs = 0
    for sale in retail_sales:
        for item in sale.items:
            prod = item.product
            # COGS = quantity * product purchase price
            retail_cogs += int(item.quantity * (prod.purchase_price if prod else 0))

    # 2. Wholesale Sales Revenue & Items for COGS (Exclude cancelled)
    wo_stmt = db.select(WholesaleOrder).where(WholesaleOrder.status != "cancelled")
    if start_date:
        wo_stmt = wo_stmt.where(WholesaleOrder.created_at >= start_date)
    if end_date:
        wo_stmt = wo_stmt.where(WholesaleOrder.created_at <= end_date)

    wholesale_orders = db.session.execute(wo_stmt).scalars().all()
    wholesale_revenue = sum(o.total_amount for o in wholesale_orders)

    # Calculate Wholesale COGS
    wholesale_cogs = 0
    for order in wholesale_orders:
        for item in order.items:
            prod = item.product
            wholesale_cogs += int(item.quantity * (prod.purchase_price if prod else 0))

    # Total financial calculations
    total_revenue = retail_revenue + wholesale_revenue
    total_cogs = retail_cogs + wholesale_cogs
    gross_profit = total_revenue - total_cogs
    gross_margin = (gross_profit / total_revenue * 100) if total_revenue > 0 else 0

    # Cash/UPI/Bank sales
    cash_sales = sum(s.total for s in retail_sales if s.payment_method == "cash") + sum(o.total_amount for o in wholesale_orders if o.payment_method == "cash")
    upi_sales = sum(s.total for s in retail_sales if s.payment_method == "upi") + sum(o.total_amount for o in wholesale_orders if o.payment_method == "upi")
    bank_sales = sum(s.total for s in retail_sales if s.payment_method == "bank") + sum(o.total_amount for o in wholesale_orders if o.payment_method == "bank")
    credit_sales = sum(s.total for s in retail_sales if s.payment_method == "credit") + sum(o.total_amount for o in wholesale_orders if o.payment_method == "credit")

    # Payments received
    pay_stmt = db.select(Payment)
    if start_date:
        pay_stmt = pay_stmt.where(Payment.recorded_at >= start_date)
    if end_date:
        pay_stmt = pay_stmt.where(Payment.recorded_at <= end_date)
    payments = db.session.execute(pay_stmt).scalars().all()
    
    cash_payments = sum(p.amount for p in payments if p.method == "cash")
    upi_payments = sum(p.amount for p in payments if p.method == "upi")
    bank_payments = sum(p.amount for p in payments if p.method == "bank")

    cash_received = cash_sales + cash_payments
    upi_received = upi_sales + upi_payments
    bank_received = bank_sales + bank_payments
    total_amount_came = cash_received + upi_received + bank_received

    # 3. Expenses Aggregation (Approved only)
    exp_stmt = db.select(Expense).where(Expense.status == "approved")
    if start_date:
        exp_stmt = exp_stmt.where(Expense.expense_date >= start_date.date())
    if end_date:
        exp_stmt = exp_stmt.where(Expense.expense_date <= end_date.date())

    approved_expenses = db.session.execute(exp_stmt).scalars().all()
    total_expenses = sum(e.amount for e in approved_expenses)

    # 3b. Purchase Orders (Expenses include these purchases)
    po_stmt = db.select(PurchaseOrder).where(PurchaseOrder.status != "cancelled")
    if start_date:
        po_stmt = po_stmt.where(PurchaseOrder.created_at >= start_date)
    if end_date:
        po_stmt = po_stmt.where(PurchaseOrder.created_at <= end_date)
    purchase_orders = db.session.execute(po_stmt).scalars().all()
    purchase_expenses = sum(po.total_amount for po in purchase_orders)

    total_expenses_with_purchases = total_expenses + purchase_expenses
    net_profit = gross_profit - total_expenses_with_purchases

    # 4. Expense Category breakdown
    cat_stmt = db.select(Expense.category, func.sum(Expense.amount)).where(Expense.status == "approved")
    if start_date:
        cat_stmt = cat_stmt.where(Expense.expense_date >= start_date.date())
    if end_date:
        cat_stmt = cat_stmt.where(Expense.expense_date <= end_date.date())
    
    category_summary = db.session.execute(cat_stmt.group_by(Expense.category)).all()
    expense_categories = [{"category": row[0], "value": row[1]} for row in category_summary]

    # Include Purchases category in categories pie if there are any
    if purchase_expenses > 0:
        expense_categories.append({"category": "Inventory Purchases", "value": purchase_expenses})

    # 5. Trend Chart Data (Last 30 Days sales & profit trend)
    trend_data = []
    today = date.today()
    for i in range(29, -1, -1):
        day = today - timedelta(days=i)
        day_start = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=timezone.utc)
        day_end = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=timezone.utc)

        # POS daily sales
        pos_day = db.session.execute(
            db.select(func.sum(RetailSale.total)).where(RetailSale.created_at.between(day_start, day_end))
        ).scalar() or 0

        # Wholesale daily sales
        wo_day = db.session.execute(
            db.select(func.sum(WholesaleOrder.total_amount))
            .where(WholesaleOrder.status != "cancelled")
            .where(WholesaleOrder.created_at.between(day_start, day_end))
        ).scalar() or 0

        # Daily expense
        exp_day = db.session.execute(
            db.select(func.sum(Expense.amount))
            .where(Expense.status == "approved")
            .where(Expense.expense_date == day)
        ).scalar() or 0

        total_day_sales = pos_day + wo_day
        trend_data.append({
            "date": day.strftime("%d %b"),
            "sales": total_day_sales / 100,
            "expenses": exp_day / 100,
            "profit": (total_day_sales - exp_day) / 100
        })

    # Partner Sales & Customer Aggregations
    am_revenue = sum(s.total for s in retail_sales if s.partner == "am") + sum(o.total_amount for o in wholesale_orders if o.partner == "am")
    khk_revenue = sum(s.total for s in retail_sales if s.partner == "khk") + sum(o.total_amount for o in wholesale_orders if o.partner == "khk")
    neutral_revenue = sum(s.total for s in retail_sales if s.partner not in ("am", "khk")) + sum(o.total_amount for o in wholesale_orders if o.partner not in ("am", "khk"))

    am_cust_count = db.session.execute(db.select(func.count(Customer.id)).where(Customer.partner == "am")).scalar() or 0
    khk_cust_count = db.session.execute(db.select(func.count(Customer.id)).where(Customer.partner == "khk")).scalar() or 0
    neutral_cust_count = db.session.execute(db.select(func.count(Customer.id)).where(Customer.partner.notin_(["am", "khk"]))).scalar() or 0

    return jsonify({
        "data": {
            "posRevenue": retail_revenue,
            "wholesaleRevenue": wholesale_revenue,
            "totalRevenue": total_revenue,
            "cogs": total_cogs,
            "grossProfit": gross_profit,
            "grossMargin": gross_margin,
            "expenses": total_expenses_with_purchases,
            "generalExpenses": total_expenses,
            "purchaseExpenses": purchase_expenses,
            "netProfit": net_profit,
            "expenseCategories": expense_categories,
            "paymentDetails": {
                "totalCame": total_amount_came,
                "cash": cash_received,
                "upi": upi_received,
                "bank": bank_received,
                "credit": credit_sales
            },
            "trend": trend_data,
            "partnerBreakdown": {
                "am": {"revenue": am_revenue, "customers": am_cust_count},
                "khk": {"revenue": khk_revenue, "customers": khk_cust_count},
                "neutral": {"revenue": neutral_revenue, "customers": neutral_cust_count}
            }
        }
    }), 200


@reports_bp.route("/export", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def export_excel_report():
    """Generate and stream a multi-sheet Excel financial report using openpyxl."""
    start_date, end_date = _get_date_filters()

    # Fetch data
    sales_stmt = db.select(RetailSale)
    if start_date:
        sales_stmt = sales_stmt.where(RetailSale.created_at >= start_date)
    if end_date:
        sales_stmt = sales_stmt.where(RetailSale.created_at <= end_date)
    sales = db.session.execute(sales_stmt.order_by(RetailSale.created_at.desc())).scalars().all()

    expenses_stmt = db.select(Expense)
    if start_date:
        expenses_stmt = expenses_stmt.where(Expense.expense_date >= start_date.date())
    if end_date:
        expenses_stmt = expenses_stmt.where(Expense.expense_date <= end_date.date())
    expenses = db.session.execute(expenses_stmt.order_by(Expense.expense_date.desc())).scalars().all()

    inventory = db.session.execute(db.select(Product).order_by(Product.name)).scalars().all()

    # Create Workbook
    wb = openpyxl.Workbook()
    
    # Setup styles
    header_fill = PatternFill(start_color="0E3A2A", end_color="0E3A2A", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    bold_font = Font(name="Segoe UI", size=10, bold=True)
    regular_font = Font(name="Segoe UI", size=10)
    center_align = Alignment(horizontal="center")
    right_align = Alignment(horizontal="right")

    # SHEET 1: Retail Sales
    ws_sales = wb.active
    ws_sales.title = "Retail Sales"
    ws_sales.append(["Invoice Number", "Date", "Customer", "Payment Method", "Subtotal (₹)", "Discount (₹)", "Total (₹)"])
    
    for sale in sales:
        ws_sales.append([
            sale.invoice_number,
            sale.created_at.strftime("%Y-%m-%d %H:%M"),
            sale.customer.name if sale.customer else "Walk-in",
            sale.payment_method.upper(),
            sale.subtotal / 100,
            sale.discount / 100,
            sale.total / 100
        ])

    # SHEET 2: Expenses
    ws_exp = wb.create_sheet(title="Expenses")
    ws_exp.append(["Date", "Category", "Amount (₹)", "Status", "Logged By", "Notes"])
    for exp in expenses:
        ws_exp.append([
            exp.expense_date.strftime("%Y-%m-%d"),
            exp.category.upper(),
            exp.amount / 100,
            exp.status.upper(),
            exp.recorded_by_user.name if exp.recorded_by_user else "System",
            exp.notes or ""
        ])

    # SHEET 3: Inventory
    ws_inv = wb.create_sheet(title="Current Inventory")
    ws_inv.append(["Product ID", "Product Name", "Unit", "Cost Price (₹)", "Selling Price (₹)", "Current Stock", "Stock Value (₹)"])
    for prod in inventory:
        ws_inv.append([
            prod.id,
            prod.name,
            prod.unit,
            prod.purchase_price / 100,
            prod.selling_price / 100,
            prod.current_stock,
            (prod.current_stock * (prod.purchase_price / 100))
        ])

    # Format header row and set column widths dynamically
    for sheet in wb.worksheets:
        # Style Header
        for cell in sheet[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align

        # Style data rows and adjust width
        for row in sheet.iter_rows(min_row=2):
            for cell in row:
                cell.font = regular_font
                if isinstance(cell.value, (int, float)):
                    cell.alignment = right_align
                    # format as currency/decimals
                    cell.number_format = "#,##0.00"

        # Auto width
        for col in sheet.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            sheet.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # Save to memory stream
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)

    filename = f"AM_KHK_Financial_Report_{date.today().strftime('%Y-%m-%d')}.xlsx"
    return send_file(
        out,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename
    )


@reports_bp.route("/customers", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def get_customer_purchases_report():
    start_date, end_date = _get_date_filters()
    search = (request.args.get("search") or "").strip()
    partner = (request.args.get("partner") or "all").lower()
    tx_type = (request.args.get("type") or "all").lower()

    transactions = []

    # 1. Retail Sales
    if tx_type in ("all", "retail"):
        rs_stmt = db.select(RetailSale)
        if start_date:
            rs_stmt = rs_stmt.where(RetailSale.created_at >= start_date)
        if end_date:
            rs_stmt = rs_stmt.where(RetailSale.created_at <= end_date)
        if partner != "all":
            rs_stmt = rs_stmt.where(RetailSale.partner == partner)
        
        sales = db.session.execute(rs_stmt).scalars().all()
        for s in sales:
            c_name = s.customer.name if s.customer else (s.billing_customer_name or "Walk-in")
            c_phone = s.customer.phone if s.customer else s.billing_customer_phone
            
            # Apply search filter
            if search:
                name_match = search.lower() in c_name.lower()
                phone_match = c_phone and (search in c_phone)
                if not (name_match or phone_match):
                    continue

            # Items summary
            items_summary = ", ".join(
                f"{item.product.name if item.product else 'Unknown'} ({item.quantity} {item.product.unit if item.product else ''})"
                for item in s.items
            )

            transactions.append({
                "id": f"retail_{s.id}",
                "type": "Retail (POS)",
                "reference": s.invoice_number or f"POS-{s.id}",
                "date": s.created_at.isoformat(),
                "customerName": c_name,
                "customerPhone": c_phone or "N/A",
                "itemsSummary": items_summary,
                "paymentMethod": s.payment_method,
                "total": s.total,
                "partner": s.partner
            })

    # 2. Wholesale Orders
    if tx_type in ("all", "wholesale"):
        wo_stmt = db.select(WholesaleOrder).where(WholesaleOrder.status != "cancelled")
        if start_date:
            wo_stmt = wo_stmt.where(WholesaleOrder.created_at >= start_date)
        if end_date:
            wo_stmt = wo_stmt.where(WholesaleOrder.created_at <= end_date)
        if partner != "all":
            wo_stmt = wo_stmt.where(WholesaleOrder.partner == partner)

        orders = db.session.execute(wo_stmt).scalars().all()
        for o in orders:
            c_name = o.customer.name if o.customer else "N/A"
            c_phone = o.customer.phone if o.customer else None

            # Apply search filter
            if search:
                name_match = search.lower() in c_name.lower()
                phone_match = c_phone and (search in c_phone)
                if not (name_match or phone_match):
                    continue

            # Items summary
            items_summary = ", ".join(
                f"{item.product.name if item.product else 'Unknown'} ({item.quantity} {item.product.unit if item.product else ''})"
                for item in o.items
            )

            transactions.append({
                "id": f"wholesale_{o.id}",
                "type": "Wholesale",
                "reference": f"WO-{o.id:04d}",
                "date": o.created_at.isoformat(),
                "customerName": c_name,
                "customerPhone": c_phone or "N/A",
                "itemsSummary": items_summary,
                "paymentMethod": o.payment_method or "credit",
                "total": o.total_amount,
                "partner": o.partner
            })

    # Sort by date descending
    transactions.sort(key=lambda x: x["date"], reverse=True)

    total_transactions = len(transactions)
    total_sales_value = sum(tx["total"] for tx in transactions)

    return jsonify({
        "data": transactions,
        "summary": {
            "totalCount": total_transactions,
            "totalAmount": total_sales_value
        }
    }), 200


@reports_bp.route("/query", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def get_custom_report():
    """Retrieve filtered transactional tables for daily, monthly, yearly, expenses, credits, and purchase reports."""
    report_type = request.args.get("type", "daily").lower()
    target_date_str = request.args.get("date") # YYYY-MM-DD
    
    start_date = None
    end_date = None
    
    if target_date_str:
        try:
            target_date = date.fromisoformat(target_date_str)
        except ValueError:
            target_date = date.today()
    else:
        target_date = date.today()

    if report_type == "daily":
        start_date = datetime(target_date.year, target_date.month, target_date.day, 0, 0, 0, tzinfo=timezone.utc)
        end_date = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59, tzinfo=timezone.utc)
    elif report_type == "monthly":
        start_date = datetime(target_date.year, target_date.month, 1, 0, 0, 0, tzinfo=timezone.utc)
        next_month = target_date.month + 1 if target_date.month < 12 else 1
        next_month_year = target_date.year if target_date.month < 12 else target_date.year + 1
        end_date = datetime(next_month_year, next_month, 1, 23, 59, 59, tzinfo=timezone.utc) - timedelta(days=1)
    elif report_type == "yearly":
        if target_date.month >= 4:
            fy_start_year = target_date.year
        else:
            fy_start_year = target_date.year - 1
        start_date = datetime(fy_start_year, 4, 1, 0, 0, 0, tzinfo=timezone.utc)
        end_date = datetime(fy_start_year + 1, 3, 31, 23, 59, 59, tzinfo=timezone.utc)
    else:
        df = request.args.get("dateFrom")
        dt = request.args.get("dateTo")
        if df:
            try:
                start_date = datetime.fromisoformat(df).replace(tzinfo=timezone.utc)
            except ValueError:
                pass
        if dt:
            try:
                end_date = datetime.fromisoformat(dt).replace(tzinfo=timezone.utc)
            except ValueError:
                pass

    if report_type in ("daily", "monthly", "yearly"):
        s_stmt = db.select(RetailSale)
        if start_date:
            s_stmt = s_stmt.where(RetailSale.created_at >= start_date)
        if end_date:
            s_stmt = s_stmt.where(RetailSale.created_at <= end_date)
        sales = db.session.execute(s_stmt).scalars().all()
        
        e_stmt = db.select(Expense).where(Expense.status == "approved")
        if start_date:
            e_stmt = e_stmt.where(Expense.expense_date >= start_date.date())
        if end_date:
            e_stmt = e_stmt.where(Expense.expense_date <= end_date.date())
        expenses = db.session.execute(e_stmt).scalars().all()
        
        p_stmt = db.select(PurchaseOrder).where(PurchaseOrder.status != "cancelled")
        if start_date:
            p_stmt = p_stmt.where(PurchaseOrder.created_at >= start_date)
        if end_date:
            p_stmt = p_stmt.where(PurchaseOrder.created_at <= end_date)
        purchases = db.session.execute(p_stmt).scalars().all()

        # Fetch dues payments recorded in this period
        pay_stmt = db.select(Payment)
        if start_date:
            pay_stmt = pay_stmt.where(Payment.recorded_at >= start_date)
        if end_date:
            pay_stmt = pay_stmt.where(Payment.recorded_at <= end_date)
        payments = db.session.execute(pay_stmt).scalars().all()

        rows = []
        for s in sales:
            rows.append({
                "type": "sale",
                "reference": s.invoice_number or f"SALE-{s.id}",
                "date": s.created_at.isoformat(),
                "particulars": f"Retail Sale ({s.payment_method.upper()})",
                "income": s.total,
                "expense": 0
            })
        for e in expenses:
            rows.append({
                "type": "expense",
                "reference": f"EXP-{e.id}",
                "date": datetime(e.expense_date.year, e.expense_date.month, e.expense_date.day).isoformat(),
                "particulars": f"Expense: {e.category} ({e.notes or ''})",
                "income": 0,
                "expense": e.amount
            })
        for p in purchases:
            rows.append({
                "type": "purchase",
                "reference": f"PO-{p.id}",
                "date": p.created_at.isoformat(),
                "particulars": f"PO Purchase: {p.supplier.name if p.supplier else 'N/A'}",
                "income": 0,
                "expense": p.total_amount
            })
        for pay in payments:
            c_name = pay.credit_entry.customer.name if (pay.credit_entry and pay.credit_entry.customer) else "N/A"
            ref_num = pay.credit_entry.invoice_ref if pay.credit_entry else ""
            particulars = f"Dues Payment: {c_name}"
            if ref_num:
                particulars += f" (For {ref_num})"
            particulars += f" via {pay.method.upper()}"
            
            rows.append({
                "type": "payment",
                "reference": f"PAY-{pay.id}",
                "date": pay.recorded_at.isoformat(),
                "particulars": particulars,
                "income": pay.amount,
                "expense": 0
            })
            
        rows.sort(key=lambda x: x["date"], reverse=True)
        total_income = sum(r["income"] for r in rows)
        total_expense = sum(r["expense"] for r in rows)
        
        return jsonify({
            "data": rows,
            "summary": {
                "income": total_income,
                "expense": total_expense,
                "net": total_income - total_expense
            }
        }), 200

    elif report_type == "expense":
        e_stmt = db.select(Expense).where(Expense.status == "approved")
        if start_date:
            e_stmt = e_stmt.where(Expense.expense_date >= start_date.date())
        if end_date:
            e_stmt = e_stmt.where(Expense.expense_date <= end_date.date())
        expenses = db.session.execute(e_stmt).scalars().all()

        p_stmt = db.select(PurchaseOrder).where(PurchaseOrder.status != "cancelled")
        if start_date:
            p_stmt = p_stmt.where(PurchaseOrder.created_at >= start_date)
        if end_date:
            p_stmt = p_stmt.where(PurchaseOrder.created_at <= end_date)
        purchases = db.session.execute(p_stmt).scalars().all()

        rows = []
        for e in expenses:
            rows.append({
                "type": "general",
                "date": datetime(e.expense_date.year, e.expense_date.month, e.expense_date.day).isoformat(),
                "category": e.category,
                "reference": f"EXP-{e.id}",
                "notes": e.notes or "",
                "amount": e.amount
            })
        for p in purchases:
            rows.append({
                "type": "purchase_po",
                "date": p.created_at.isoformat(),
                "category": "Inventory Purchase",
                "reference": f"PO-{p.id}",
                "notes": f"Supplier: {p.supplier.name if p.supplier else 'N/A'}",
                "amount": p.total_amount
            })

        rows.sort(key=lambda x: x["date"], reverse=True)
        return jsonify({
            "data": rows,
            "summary": {
                "total": sum(r["amount"] for r in rows)
            }
        }), 200

    elif report_type == "credit":
        stmt = db.select(Customer).where(Customer.outstanding_balance > 0)
        search = request.args.get("search", "").strip()
        if search:
            stmt = stmt.where(Customer.name.ilike(f"%{search}%"))
        customers = db.session.execute(stmt).scalars().all()
        
        rows = [{
            "id": c.id,
            "name": c.name,
            "phone": c.phone or "N/A",
            "type": c.type,
            "outstandingBalance": c.outstanding_balance,
            "partner": c.partner
        } for c in customers]
        
        rows.sort(key=lambda x: x["outstandingBalance"], reverse=True)
        return jsonify({
            "data": rows,
            "summary": {
                "totalOutstanding": sum(c["outstandingBalance"] for c in rows),
                "count": len(rows)
            }
        }), 200

    elif report_type == "purchase":
        stmt = db.select(PurchaseOrder)
        if start_date:
            stmt = stmt.where(PurchaseOrder.created_at >= start_date)
        if end_date:
            stmt = stmt.where(PurchaseOrder.created_at <= end_date)
        purchases = db.session.execute(stmt.order_by(PurchaseOrder.created_at.desc())).scalars().all()
        
        rows = [{
            "id": p.id,
            "supplierName": p.supplier.name if p.supplier else "N/A",
            "date": p.created_at.isoformat(),
            "status": p.status,
            "paymentStatus": p.payment_status,
            "totalAmount": p.total_amount,
            "notes": p.notes or ""
        } for p in purchases]
        
        return jsonify({
            "data": rows,
            "summary": {
                "total": sum(p["totalAmount"] for p in rows),
                "count": len(rows)
            }
        }), 200

    elif report_type == "purchase_payment":
        stmt = db.select(PurchaseOrder).where(PurchaseOrder.payment_status != "pending")
        if start_date:
            stmt = stmt.where(PurchaseOrder.created_at >= start_date)
        if end_date:
            stmt = stmt.where(PurchaseOrder.created_at <= end_date)
        purchases = db.session.execute(stmt.order_by(PurchaseOrder.created_at.desc())).scalars().all()
        
        rows = []
        for p in purchases:
            rows.append({
                "id": p.id,
                "supplierName": p.supplier.name if p.supplier else "N/A",
                "date": p.created_at.isoformat(),
                "paymentStatus": p.payment_status,
                "amount": p.total_amount,
                "notes": p.notes or ""
            })
            
        return jsonify({
            "data": rows,
            "summary": {
                "total": sum(p["amount"] for p in rows),
                "count": len(rows)
            }
        }), 200

    return jsonify({"error": "Invalid report type"}), 400


@reports_bp.route("/upi-summary", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def get_upi_summary():
    """Retrieve total UPI payments grouped by account/UPI ID configured in settings."""
    start_date, end_date = _get_date_filters()

    # 1. POS Direct UPI Receipts
    rs_query = db.select(RetailSale).where(RetailSale.payment_method == "upi")
    if start_date:
        rs_query = rs_query.where(RetailSale.created_at >= start_date)
    if end_date:
        rs_query = rs_query.where(RetailSale.created_at <= end_date)
    rs_receipts = db.session.execute(rs_query).scalars().all()

    # 2. Wholesale Direct UPI Receipts
    wo_query = db.select(WholesaleOrder).where(WholesaleOrder.payment_method == "upi").where(WholesaleOrder.status == "delivered")
    if start_date:
        wo_query = wo_query.where(WholesaleOrder.created_at >= start_date)
    if end_date:
        wo_query = wo_query.where(WholesaleOrder.created_at <= end_date)
    wo_receipts = db.session.execute(wo_query).scalars().all()

    # 3. Credit Ledger UPI Payments
    pay_query = db.select(Payment).where(Payment.method == "upi")
    if start_date:
        pay_query = pay_query.where(Payment.recorded_at >= start_date)
    if end_date:
        pay_query = pay_query.where(Payment.recorded_at <= end_date)
    payments_receipts = db.session.execute(pay_query).scalars().all()

    # Group by upi_id
    accounts = {}

    def add_receipt(upi_id, amount, tx_type, ref, date_val):
        key = (upi_id or "Unassigned/Other").strip() or "Unassigned/Other"
        if key not in accounts:
            accounts[key] = {
                "upiId": key,
                "totalAmount": 0,
                "transactions": []
            }
        accounts[key]["totalAmount"] += amount
        accounts[key]["transactions"].append({
            "type": tx_type,
            "ref": ref,
            "amount": amount,
            "date": date_val.isoformat()
        })

    for r in rs_receipts:
        add_receipt(r.upi_id, r.total, "retail", r.invoice_number or f"RS-{r.id}", r.created_at)

    for w in wo_receipts:
        add_receipt(w.upi_id, w.total_amount, "wholesale", f"WO-{w.id:04d}", w.created_at)

    for p in payments_receipts:
        ref = p.credit_entry.invoice_ref if p.credit_entry else f"PM-{p.id}"
        add_receipt(p.upi_id, p.amount, "ledger_payment", ref, p.recorded_at)

    # Sort transactions by date desc for each account
    results = []
    for key, data in accounts.items():
        data["transactions"].sort(key=lambda x: x["date"], reverse=True)
        results.append(data)

    # Sort accounts by totalAmount desc
    results.sort(key=lambda x: x["totalAmount"], reverse=True)

    return jsonify({"data": results}), 200


@reports_bp.route("/bank-summary", methods=["GET"])
@login_required
@require_roles("owner", "manager", "accountant")
def get_bank_summary():
    """Retrieve total Bank Transfer payments grouped by Bank name configured in settings."""
    start_date, end_date = _get_date_filters()

    # 1. POS Direct Bank Receipts
    rs_query = db.select(RetailSale).where(RetailSale.payment_method == "bank")
    if start_date:
        rs_query = rs_query.where(RetailSale.created_at >= start_date)
    if end_date:
        rs_query = rs_query.where(RetailSale.created_at <= end_date)
    rs_receipts = db.session.execute(rs_query).scalars().all()

    # 2. Wholesale Direct Bank Receipts
    wo_query = db.select(WholesaleOrder).where(WholesaleOrder.payment_method == "bank").where(WholesaleOrder.status == "delivered")
    if start_date:
        wo_query = wo_query.where(WholesaleOrder.created_at >= start_date)
    if end_date:
        wo_query = wo_query.where(WholesaleOrder.created_at <= end_date)
    wo_receipts = db.session.execute(wo_query).scalars().all()

    # 3. Credit Ledger Bank Payments
    pay_query = db.select(Payment).where(Payment.method == "bank")
    if start_date:
        pay_query = pay_query.where(Payment.recorded_at >= start_date)
    if end_date:
        pay_query = pay_query.where(Payment.recorded_at <= end_date)
    payments_receipts = db.session.execute(pay_query).scalars().all()

    # Group by bank_name
    accounts = {}

    def add_receipt(bank_name, amount, tx_type, ref, date_val):
        key = (bank_name or "Unassigned/Other").strip() or "Unassigned/Other"
        if key not in accounts:
            accounts[key] = {
                "bankName": key,
                "totalAmount": 0,
                "transactions": []
            }
        accounts[key]["totalAmount"] += amount
        accounts[key]["transactions"].append({
            "type": tx_type,
            "ref": ref,
            "amount": amount,
            "date": date_val.isoformat()
        })

    for r in rs_receipts:
        add_receipt(r.bank_name, r.total, "retail", r.invoice_number or f"RS-{r.id}", r.created_at)

    for w in wo_receipts:
        add_receipt(w.bank_name, w.total_amount, "wholesale", f"WO-{w.id:04d}", w.created_at)

    for p in payments_receipts:
        ref = p.credit_entry.invoice_ref if p.credit_entry else f"PM-{p.id}"
        add_receipt(p.bank_name, p.amount, "ledger_payment", ref, p.recorded_at)

    # Sort transactions by date desc for each account
    results = []
    for key, data in accounts.items():
        data["transactions"].sort(key=lambda x: x["date"], reverse=True)
        results.append(data)

    # Sort accounts by totalAmount desc
    results.sort(key=lambda x: x["totalAmount"], reverse=True)

    return jsonify({"data": results}), 200

