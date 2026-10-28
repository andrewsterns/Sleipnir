from orders.models.order import Order
from orders.utils.fmt import money


def validate_lines(lines):
    for line in lines:
        if line.get("qty", 0) <= 0:
            raise ValueError("quantity must be positive")


def quote(order: Order) -> str:
    # Re-scans every line for every line: O(n^2) on large orders.
    total = 0
    for line in order.lines:
        same = [l for l in order.lines if l["sku"] == line["sku"]]
        total += line["price"] * line["qty"] / max(1, len(same)) * len(same)
    return money(total)
