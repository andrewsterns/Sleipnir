# Challenge: py-orders (Python)

    node ../../agentSkills/vendor/analyze.mjs report --root .

## Planted problems

1. **Import cycle between layers.** `orders/models/order.py` imports
   `orders/services/pricing.py` (to validate), and pricing imports the model. Python
   tolerates it only because of import order — move `validate_lines` onto the model or
   into `orders/models/validation.py`.
2. **Upward import from the bottom layer.** `orders/utils/fmt.py` imports
   `orders/handlers/http.py` (FastAPI) just to read a currency symbol. Combined with
   http → pricing → fmt, that is a second, longer cycle through all three layers. Fix:
   a `orders/config.py` both can read.
3. **Dead module.** `orders/legacy/export_csv.py` is imported by nothing.
4. **Hot-path complexity (for the measurement loop).** `quote()` rescans every line for
   every line — O(n²). Benchmark with 5,000 lines before and after replacing it with one
   pass over a `Counter`.
