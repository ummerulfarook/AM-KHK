"""
Billing schema — request validation for POS sale creation.
All amounts in paise; UI sends rupees and we convert here.
"""
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional


@dataclass
class ReturnLineRequest:
    """One returned item line added while creating a bill.

    May reference an actual product (product_id) or be a free-form label (e.g. "Tray").
    May reference an original invoice (original_invoice_ref) or have no specific invoice.
    """
    label: str              # display name (product name or custom e.g. "Tray")
    qty: float              # quantity returned
    unit_price: int         # paise per unit
    product_id: Optional[int] = None        # optional real product FK
    original_invoice_ref: Optional[str] = None  # e.g. "INV-202507-0012"

    @property
    def subtotal(self) -> int:
        return int(Decimal(str(self.qty)) * self.unit_price)


# Keep DeductionItemRequest as alias for backward compatibility
DeductionItemRequest = ReturnLineRequest


@dataclass
class SaleItemRequest:
    product_id: int
    quantity: float
    unit_price: int  # paise
    boxes: int = 0
    box_weight: float = 0.0

    @property
    def subtotal(self) -> int:
        return int(Decimal(str(self.quantity)) * self.unit_price)


@dataclass
class CreateSaleRequest:
    items: list[SaleItemRequest]
    payment_method: str
    customer_id: Optional[int] = None
    store_id: Optional[int] = None
    discount: int = 0      # paise — standalone discount (separate from returns)
    tax: int = 0           # paise
    notes: Optional[str] = None
    credit_days: Optional[int] = None
    billing_customer_name: Optional[str] = None
    billing_customer_phone: Optional[str] = None
    upi_id: Optional[str] = None
    bank_name: Optional[str] = None
    cash_paid: Optional[int] = None       # paise
    upi_paid: Optional[int] = None        # paise
    bank_paid: Optional[int] = None       # paise
    invoice_to_pay: Optional[str] = None
    custom_date: Optional[str] = None
    returns: list[ReturnLineRequest] = field(default_factory=list)

    # backward-compat alias — frontend may still send "deductions"
    deductions: list[ReturnLineRequest] = field(default_factory=list)

    VALID_PAYMENT_METHODS = {"cash", "upi", "bank", "credit"}

    @property
    def all_return_lines(self) -> list[ReturnLineRequest]:
        """Combined returns and deductions (deductions kept for backward compat)."""
        seen = []
        for r in self.returns:
            seen.append(r)
        for d in self.deductions:
            seen.append(d)
        return seen

    @property
    def return_total(self) -> int:
        """Total paise value of all return/deduction lines."""
        return sum(r.subtotal for r in self.all_return_lines)

    @property
    def total_discount(self) -> int:
        """Combined standalone discount + returns total."""
        return self.discount + self.return_total

    @classmethod
    def from_json(cls, data: dict) -> "CreateSaleRequest":
        errors: dict[str, str] = {}

        # Items
        raw_items = data.get("items") or []
        if not raw_items:
            errors["items"] = "At least one item is required"
        items = []
        for i, raw in enumerate(raw_items):
            try:
                product_id = int(raw["productId"])
                quantity = float(raw["quantity"])
                if quantity == 0:
                    errors[f"items[{i}].quantity"] = "Quantity cannot be 0"
                unit_price = _rupees_to_paise(raw.get("unitPrice", 0))
                boxes = int(raw.get("boxes", 0))
                box_weight = float(raw.get("boxWeight", 0.0))
                items.append(SaleItemRequest(
                     product_id=product_id,
                     quantity=quantity,
                     unit_price=unit_price,
                     boxes=boxes,
                     box_weight=box_weight,
                ))
            except (KeyError, TypeError, ValueError) as exc:
                errors[f"items[{i}]"] = f"Invalid item data: {exc}"

        # Payment method
        payment_method = (data.get("paymentMethod") or "cash").strip()
        if payment_method not in cls.VALID_PAYMENT_METHODS:
            errors["paymentMethod"] = f"Must be one of {cls.VALID_PAYMENT_METHODS}"

        # Customer
        customer_id = data.get("customerId")
        if customer_id is not None:
            try:
                customer_id = int(customer_id)
            except (TypeError, ValueError):
                customer_id = None

        # Store
        store_id = data.get("storeId")
        if store_id is not None:
            try:
                store_id = int(store_id)
            except (TypeError, ValueError):
                store_id = None

        # Credit requires a customer
        if payment_method == "credit" and not customer_id:
            errors["customerId"] = "Customer is required for credit sales"

        # Standalone Discount (separate from returns)
        try:
            discount = _rupees_to_paise(data.get("discount", 0))
        except (TypeError, ValueError):
            discount = 0

        try:
            tax = _rupees_to_paise(data.get("tax", 0))
        except (TypeError, ValueError):
            tax = 0

        notes = (data.get("notes") or "").strip() or None

        # credit days
        credit_days = data.get("creditDays")
        if credit_days is not None:
            try:
                credit_days = int(credit_days)
            except (TypeError, ValueError):
                credit_days = None

        billing_customer_name = (data.get("billingCustomerName") or "").strip() or None
        billing_customer_phone = (data.get("billingCustomerPhone") or "").strip() or None
        upi_id = (data.get("upiId") or "").strip() or None
        bank_name = (data.get("bankName") or "").strip() or None

        cash_paid = None
        if "cashPaid" in data and data["cashPaid"] is not None:
            try:
                cash_paid = _rupees_to_paise(data["cashPaid"])
            except (TypeError, ValueError):
                pass

        upi_paid = None
        if "upiPaid" in data and data["upiPaid"] is not None:
            try:
                upi_paid = _rupees_to_paise(data["upiPaid"])
            except (TypeError, ValueError):
                pass

        bank_paid = None
        if "bankPaid" in data and data["bankPaid"] is not None:
            try:
                bank_paid = _rupees_to_paise(data["bankPaid"])
            except (TypeError, ValueError):
                pass

        invoice_to_pay = (data.get("invoiceToPay") or "").strip() or None
        custom_date = (data.get("customDate") or "").strip() or None

        # Returns — itemised return lines (new field name)
        returns = _parse_return_lines(data.get("returns") or [])

        # Deductions — backward-compat alias (old field name from previous implementation)
        deductions = _parse_return_lines(data.get("deductions") or [])

        if errors:
            raise ValueError(errors)

        return cls(
            items=items,
            payment_method=payment_method,
            customer_id=customer_id,
            store_id=store_id,
            discount=discount,
            tax=tax,
            notes=notes,
            credit_days=credit_days,
            billing_customer_name=billing_customer_name,
            billing_customer_phone=billing_customer_phone,
            upi_id=upi_id,
            bank_name=bank_name,
            cash_paid=cash_paid,
            upi_paid=upi_paid,
            bank_paid=bank_paid,
            invoice_to_pay=invoice_to_pay,
            custom_date=custom_date,
            returns=returns,
            deductions=deductions,
        )


def _parse_return_lines(raw_list: list) -> list[ReturnLineRequest]:
    result = []
    for d in raw_list:
        try:
            label = (d.get("label") or "").strip()
            if not label:
                continue
            qty = float(d.get("qty", 1))
            up = _rupees_to_paise(d.get("unitPrice", 0))
            product_id = d.get("productId")
            if product_id is not None:
                try:
                    product_id = int(product_id)
                except (TypeError, ValueError):
                    product_id = None
            original_invoice_ref = (d.get("originalInvoiceRef") or "").strip() or None
            result.append(ReturnLineRequest(
                label=label,
                qty=qty,
                unit_price=up,
                product_id=product_id,
                original_invoice_ref=original_invoice_ref,
            ))
        except Exception:
            pass
    return result


def _rupees_to_paise(value) -> int:
    """Convert rupees (float/str) to paise integer."""
    return int(Decimal(str(value)) * 100)
