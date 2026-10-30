# Challenge: java-orders

A Maven layout: classes by package under `src/main/java`, tests under `src/test/java`.

    node ../../agentSkills/vendor/analyze.mjs report --root .

## Planted problems — what /optimize should find

1. **An import cycle across packages.** `orders/Order` imports `util/Money`, and
   `util/Money` imports `orders/Order` back — a utility that knows about the domain.
   Fix: `Money` takes an amount, not an `Order`.
2. **Dead code.** `legacy/CsvExport` is never referenced.

Same-package references need no import in Java (`OrderService` uses `Order`); the
analyzer links them by the types each file declares.
