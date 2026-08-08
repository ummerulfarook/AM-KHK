"""
Invoice service — PDF generation and thermal receipt printing.

PDF generation uses Playwright (headless Chromium) so it renders invoice.html
exactly as the browser does — same fonts, flexbox, logo, colours.
No duplicate template: render_invoice_html() / invoice.html is the single source.
"""
import os
import io
import base64
from jinja2 import Environment, FileSystemLoader, select_autoescape

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
    """
    Render invoice.html (the single invoice template) to an HTML string.
    Used by:
      - Laser Print preview  (/api/billing/<id>/preview)
      - PDF download         (/api/billing/<id>/pdf)
      - WhatsApp PDF share
    """
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
        formatted_date=formatted_date,
    )


import logging as _logging
_log = _logging.getLogger(__name__)


def generate_invoice_pdf(html: str, sale=None, settings=None) -> bytes:
    """
    Convert the invoice HTML to PDF bytes using Playwright (headless Chromium).

    Playwright renders the page exactly as Chrome/Edge does, so the PDF is
    pixel-identical to what the user sees during Laser Print.

    Scale is set to 1.2 (20% larger) so the invoice reads comfortably on
    mobile screens and is crisp when shared via WhatsApp.

    Falls back to xhtml2pdf if Playwright is not available (old design).
    """
    # Re-render from invoice.html (single source of truth)
    if sale is not None and settings is not None:
        html = render_invoice_html(sale, settings)

    # ── Primary: Playwright / headless Chromium ────────────────────────────
    try:
        import os
        # Force Playwright to use a shared system-wide location
        # This allows the Windows Service (running as SYSTEM) to access the same browser
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = r"C:\ms-playwright"

        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            # Fixed viewport width = receipt width (98mm ≈ 370px at 96dpi)
            # This makes rendering identical on every machine
            page = browser.new_page(viewport={"width": 400, "height": 800})

            # Load the HTML directly without waiting for external assets to completely settle
            # (which avoids TimeoutError on slow connections when fetching web fonts)
            page.set_content(html, wait_until="load")

            # Wait for web fonts (Google Fonts) to load
            try:
                page.wait_for_timeout(1500)
            except Exception:
                pass

            # Emulate print media explicitly
            page.emulate_media(media="print")

            pdf_bytes = page.pdf(
                format="A4",
                print_background=True,
                prefer_css_page_size=True,
                # 20% scale-up → easier to read on mobile / WhatsApp
                scale=1.2,
            )

            browser.close()
            _log.info("✅ PDF generated using Playwright (Chromium) — new design.")
            return pdf_bytes

    except ImportError:
        _log.warning(
            "⚠️  Playwright package not installed on this machine. "
            "FALLING BACK TO OLD PDF DESIGN (xhtml2pdf). "
            "To fix: run setup_pdf_engine.bat then restart the backend."
        )
    except Exception as exc:
        _log.warning(
            "⚠️  Playwright/Chromium failed (%s). "
            "FALLING BACK TO OLD PDF DESIGN (xhtml2pdf). "
            "To fix: run setup_pdf_engine.bat then restart the backend.",
            exc,
        )

    # ── Fallback: xhtml2pdf (table-based, no flexbox — OLD design) ────────
    _log.warning("⚠️  Using xhtml2pdf fallback — PDF will NOT match the laser print design.")
    try:
        # xhtml2pdf Windows NamedTemporaryFile monkeypatch
        try:
            import tempfile
            from xhtml2pdf.files import BaseFile, files_tmp

            def _patched_get_named_tmp_file(self):
                data = self.get_data()
                tmp_file = tempfile.NamedTemporaryFile(suffix=self.suffix, delete=False)
                if data:
                    tmp_file.write(data)
                    tmp_file.flush()
                    tmp_file.close()
                    files_tmp.append(tmp_file)
                if self.path is None:
                    self.path = tmp_file.name
                return tmp_file

            BaseFile.get_named_tmp_file = _patched_get_named_tmp_file
        except Exception:
            pass

        from xhtml2pdf import pisa
        result_buffer = io.BytesIO()
        pisa_status = pisa.CreatePDF(io.StringIO(html), dest=result_buffer)
        if pisa_status.err:
            raise RuntimeError(f"xhtml2pdf conversion error (code {pisa_status.err})")
        return result_buffer.getvalue()

    except ImportError:
        pass

    raise ImportError(
        "No PDF engine is available. "
        "Install Playwright: pip install playwright && python -m playwright install chromium"
    )



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
