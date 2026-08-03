"""
Billing schema — request validation for POS sale creation.
All amounts in paise; UI sends rupees and we convert here.
"""
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional


@dataclass
class SaleItemRequest:
    product_id: int
    quantity: float
    unit_price: int  # paise

    @property
    def subtotal(self) -> int:
        return int(Decimal(str(self.quantity)) * self.unit_price)


@dataclass
class CreateSaleRequest:
    items: list[SaleItemRequest]
    payment_method: str
    customer_id: Optional[int] = None
    discount: int = 0      # paise
    tax: int = 0           # paise
    notes: Optional[str] = None
    credit_days: Optional[int] = None
    billing_customer_name: Optional[str] = None
    billing_customer_phone: Optional[str] = None
    upi_id: Optional[str] = None
    bank_name: Optional[str] = None
    cash_paid: Optional[int] = None       # paise
    invoice_to_pay: Optional[str] = None
    custom_date: Optional[str] = None

    VALID_PAYMENT_METHODS = {"cash", "upi", "bank", "credit"}

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
                items.append(SaleItemRequest(
                     product_id=product_id,
                     quantity=quantity,
                     unit_price=unit_price,
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

        # Credit requires a customer
        if payment_method == "credit" and not customer_id:
            errors["customerId"] = "Customer is required for credit sales"

        # Discount / tax
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

        custom_date = (data.get("customDate") or "").strip() or None

        if errors:
            raise ValueError(errors)

        return cls(
            items=items,
            payment_method=payment_method,
            customer_id=customer_id,
            discount=discount,
            tax=tax,
            notes=notes,
            credit_days=credit_days,
            billing_customer_name=billing_customer_name,
            billing_customer_phone=billing_customer_phone,
            upi_id=upi_id,
            bank_name=bank_name,
            cash_paid=cash_paid,
            invoice_to_pay=invoice_to_pay,
            custom_date=custom_date,
        )


def _rupees_to_paise(value) -> int:
    """Convert rupees (float/str) to paise integer."""
    return int(Decimal(str(value)) * 100)
