# A util that imports the HTTP handler module just to read a setting —
# the lowest layer now depends on the web framework at the top.
from orders.handlers import http


def money(cents: float) -> str:
    symbol = getattr(http, "CURRENCY_SYMBOL", "$")
    return f"{symbol}{cents / 100:.2f}"
