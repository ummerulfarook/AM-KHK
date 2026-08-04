"""
Invoice service — PDF generation and thermal receipt printing.

WeasyPrint requires GTK runtime (libcairo, pango) on Windows.
If unavailable, render_invoice_html() still works; generate_invoice_pdf() raises ImportError.
The billing route catches this and falls back to serving HTML.
"""
import os
import io
from jinja2 import Environment, FileSystemLoader, select_autoescape

import base64

# Locate the templates folder relative to this file
_TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")

_jinja_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
)


def _get_logo_base64() -> str:
    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
        "frontend", "src", "assets", "logo.png"
    )
    if os.path.exists(path):
        try:
            with open(path, "rb") as f:
                data = f.read()
                return "data:image/png;base64," + base64.b64encode(data).decode("utf-8")
        except Exception:
            pass
    return ""


def render_invoice_html(sale, settings: dict) -> str:
    """Render the invoice Jinja2 template to an HTML string."""
    from datetime import timezone, timedelta
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    created_at_ist = sale.created_at.astimezone(ist_tz)
    formatted_date = created_at_ist.strftime("%d %b %Y")

    tpl = _jinja_env.get_template("invoice.html")
    logo_base64 = _get_logo_base64()
    return tpl.render(
        sale=sale,
        settings=settings,
        logo_base64=logo_base64,
        formatted_date=formatted_date
    )


def render_invoice_pdf_html(sale, settings: dict) -> str:
    """Render the PDF-specific invoice template (xhtml2pdf-compatible, no flexbox)."""
    from datetime import timezone, timedelta
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    created_at_ist = sale.created_at.astimezone(ist_tz)
    formatted_date = created_at_ist.strftime("%d %b %Y")

    tpl = _jinja_env.get_template("invoice_pdf.html")
    logo_base64 = _get_logo_base64()
    return tpl.render(
        sale=sale,
        settings=settings,
        logo_base64=logo_base64,
        formatted_date=formatted_date
    )


def generate_invoice_pdf(html: str, sale=None, settings=None) -> bytes:
    """
    Convert rendered HTML to PDF bytes.
    If sale and settings are provided, re-renders using the PDF-specific template
    for better xhtml2pdf compatibility.
    Uses xhtml2pdf (pure Python, no GTK needed) as the primary engine.
    Falls back to WeasyPrint if xhtml2pdf is unavailable.
    Raises ImportError if neither is available.
    """
    # Primary: xhtml2pdf (works on Windows without GTK)
    try:
        from xhtml2pdf import pisa

        # Use the PDF-specific template if sale object is available
        if sale and settings is not None:
            html = render_invoice_pdf_html(sale, settings)

        result_buffer = io.BytesIO()
        pisa_status = pisa.CreatePDF(io.StringIO(html), dest=result_buffer)
        if pisa_status.err:
            raise RuntimeError(f"xhtml2pdf conversion error (code {pisa_status.err})")
        return result_buffer.getvalue()
    except ImportError:
        pass

    # Fallback: WeasyPrint (requires GTK runtime on Windows)
    try:
        from weasyprint import HTML as WeasyprintHTML
        return WeasyprintHTML(string=html).write_pdf()
    except Exception as exc:
        raise ImportError(
            "Neither xhtml2pdf nor WeasyPrint is available for PDF generation. "
            "Install xhtml2pdf: pip install xhtml2pdf"
        ) from exc


def print_thermal_receipt(sale, printer_config: dict) -> bool:
    """
    Send a thermal receipt to the configured ESC/POS printer.
    Returns True on success.
    Raises RuntimeError if no printer is configured or connection fails.
    """
    if not printer_config.get("printer_type"):
        raise RuntimeError("No printer configured in settings")

    try:
        from escpos import printer as escpos_printer

        ptype = printer_config["printer_type"]  # usb | network | serial
        p = None

        if ptype == "usb":
            p = escpos_printer.Usb(
                int(printer_config.get("printer_usb_vendor", "0x04b8"), 16),
                int(printer_config.get("printer_usb_product", "0x0202"), 16),
            )
        elif ptype == "network":
            p = escpos_printer.Network(
                printer_config.get("printer_ip", "192.168.1.100"),
                int(printer_config.get("printer_port", 9100)),
            )
        elif ptype == "serial":
            p = escpos_printer.Serial(
                printer_config.get("printer_port", "COM1"),
                baudrate=int(printer_config.get("printer_baud", 9600)),
            )
        else:
            raise RuntimeError(f"Unknown printer type: {ptype}")

        _write_receipt(p, sale)
        return True

    except ImportError as exc:
        raise RuntimeError("python-escpos is not installed on this system.") from exc
    except Exception as exc:
        raise RuntimeError(f"Thermal printer is not connected or offline: {exc}") from exc


def _write_receipt(p, sale):
    """Write receipt content to an ESC/POS printer object."""
    p.set(align="center", bold=True, double_height=True)
    p.text("AM & KHK Vegetable Merchants\n")
    p.set(align="center", bold=False, double_height=False)
    p.text("NH-17, CHERANALOR, ERNAKULAM\n")
    p.text("Ph: +91 9846089118, +91 7012794021\n")
    p.text("-" * 32 + "\n")

    p.set(align="left")
    p.text(f"Invoice : {sale.invoice_number}\n")
    
    from datetime import timezone, timedelta
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    created_at_ist = sale.created_at.astimezone(ist_tz)
    date_str = created_at_ist.strftime('%d/%m/%Y')
    p.text(f"Date    : {date_str}\n")
    
    customer_name = sale.customer.name if sale.customer else (sale.billing_customer_name or "Walk-in")
    p.text(f"Customer: {customer_name}\n")
    phone = sale.customer.phone if (sale.customer and sale.customer.phone) else sale.billing_customer_phone
    if phone:
        p.text(f"Phone   : {phone[:4]}*****\n")
    p.text("-" * 32 + "\n")

    # Items
    p.text("Rate  Item         Qty    Amount\n")
    p.text("-" * 32 + "\n")
    for item in sale.items:
        rate = f"{item.unit_price/100:.2f}"[:6]
        name = (item.product.name if item.product else "Unknown").upper()[:11]
        qty = f"{item.quantity}"[:5]
        amt = f"{item.subtotal/100:.2f}"[:7]
        line = f"{rate:<6} {name:<11} {qty:>5} {amt:>7}\n"
        p.text(line)

    p.text("-" * 32 + "\n")
    if sale.discount > 0:
        p.text(f"Subtotal: Rs{sale.subtotal/100:.2f}\n")
        p.text(f"Discount: -Rs{sale.discount/100:.2f}\n")
    p.set(bold=True)
    p.text(f"TOTAL   : Rs{sale.total/100:.2f}\n")
    p.set(bold=False)

    if sale.customer:
        p.text(f"Prev Due  : Rs{sale.previous_balance/100:.2f}\n")
        p.text(f"Received  : Rs{sale.amount_paid/100:.2f}\n")
        bill_left = max(0, sale.total - sale.amount_paid)
        p.text(f"Bill Left : Rs{bill_left/100:.2f}\n")
        p.text(f"Total Due : Rs{sale.customer.outstanding_balance/100:.2f}\n")

    p.text("-" * 32 + "\n")
    p.set(align="center")
    p.text("Thank you! Come again.\n")
    p.cut()
