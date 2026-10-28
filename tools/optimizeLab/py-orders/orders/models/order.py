from dataclasses import dataclass, field

# The model reaches UP into the service layer to validate itself — and the
# service imports the model. A cycle Python only tolerates because of import order.
from orders.services.pricing import validate_lines


@dataclass
class Order:
    lines: list = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "Order":
        order = cls(lines=data.get("lines", []))
        validate_lines(order.lines)
        return order
