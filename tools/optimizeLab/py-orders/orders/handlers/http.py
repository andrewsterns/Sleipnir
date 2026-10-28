from fastapi import FastAPI

from orders.services.pricing import quote
from orders.models.order import Order

app = FastAPI()


@app.post("/orders/quote")
def post_quote(order: dict):
    return {"total": quote(Order.from_dict(order))}
