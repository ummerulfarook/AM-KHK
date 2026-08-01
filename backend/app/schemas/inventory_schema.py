"""
Inventory schema — request validation for product create/update and stock adjustment.
"""
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass
class ProductCreateRequest:
    name: str
    category_id: int
    unit: str
    purchase_price: int   # paise
    selling_price: int    # paise
    current_stock: float
    low_stock_threshold: float
    supplier_id: int | None = None
    icon_key: str | None = None
    addon_product_id: int | None = None
    addon_quantity: float = 1.0

    VALID_UNITS = {"kg", "bunch", "piece", "litre"}

    @classmethod
    def from_json(cls, data: dict) -> "ProductCreateRequest":
        errors: dict[str, str] = {}

        name = (data.get("name") or "").strip()
        if not name:
            errors["name"] = "Product name is required"

        try:
            category_id = int(data["categoryId"])
        except (KeyError, TypeError, ValueError):
            errors["categoryId"] = "Valid category is required"
            category_id = 0

        unit = (data.get("unit") or "kg").strip()
        if unit not in cls.VALID_UNITS:
            errors["unit"] = f"Unit must be one of {cls.VALID_UNITS}"

        # Accept prices as rupees (float) from the UI and convert to paise
        try:
            purchase_price = _rupees_to_paise(data.get("purchasePrice", 0))
            if purchase_price < 0:
                errors["purchasePrice"] = "Purchase price cannot be negative"
        except (TypeError, ValueError):
            errors["purchasePrice"] = "Invalid purchase price"
            purchase_price = 0

        try:
            selling_price = _rupees_to_paise(data.get("sellingPrice", 0))
            if selling_price < 0:
                errors["sellingPrice"] = "Selling price cannot be negative"
        except (TypeError, ValueError):
            errors["sellingPrice"] = "Invalid selling price"
            selling_price = 0

        try:
            current_stock = float(data.get("currentStock", 0))
        except (TypeError, ValueError):
            errors["currentStock"] = "Invalid stock value"
            current_stock = 0.0

        try:
            low_stock_threshold = float(data.get("lowStockThreshold", 5))
            if low_stock_threshold < 0:
                errors["lowStockThreshold"] = "Low stock threshold cannot be negative"
        except (TypeError, ValueError):
            errors["lowStockThreshold"] = "Invalid threshold"
            low_stock_threshold = 5.0

        supplier_id = data.get("supplierId")
        if supplier_id is not None:
            try:
                supplier_id = int(supplier_id)
            except (TypeError, ValueError):
                supplier_id = None

        icon_key = (data.get("iconKey") or "").strip() or None

        addon_product_id = data.get("addonProductId")
        if addon_product_id is not None:
            try:
                addon_product_id = int(addon_product_id)
            except (TypeError, ValueError):
                addon_product_id = None

        try:
            addon_quantity = float(data.get("addonQuantity", 1.0))
        except (TypeError, ValueError):
            addon_quantity = 1.0

        if errors:
            raise ValueError(errors)

        return cls(
            name=name,
            category_id=category_id,
            unit=unit,
            purchase_price=purchase_price,
            selling_price=selling_price,
            current_stock=current_stock,
            low_stock_threshold=low_stock_threshold,
            supplier_id=supplier_id,
            icon_key=icon_key,
            addon_product_id=addon_product_id,
            addon_quantity=addon_quantity,
        )


@dataclass
class StockAdjustRequest:
    adjustment: float   # positive = add, negative = remove
    notes: str | None = None

    @classmethod
    def from_json(cls, data: dict) -> "StockAdjustRequest":
        errors: dict[str, str] = {}
        try:
            adjustment = float(data["adjustment"])
        except (KeyError, TypeError, ValueError):
            errors["adjustment"] = "Adjustment value is required"
            adjustment = 0.0

        notes = (data.get("notes") or "").strip() or None

        if errors:
            raise ValueError(errors)

        return cls(adjustment=adjustment, notes=notes)


def _rupees_to_paise(value) -> int:
    """Convert a rupee value (int or float string) to paise integer."""
    return int(Decimal(str(value)) * 100)
