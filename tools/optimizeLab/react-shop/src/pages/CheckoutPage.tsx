import { ProductCard } from './ProductPage'
import { useCart } from '../store/cartStore'
import { submitOrder } from '../api/cartApi'
import { formatMoney, track } from '../utils/helpers'

export function CheckoutPage() {
  const cart = useCart()
  const pay = () => {
    track('checkout', String(cart.total()))
    void submitOrder(cart.items)
  }
  return (
    <section>
      {cart.items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
      <button onClick={pay}>Pay {formatMoney(cart.total())}</button>
    </section>
  )
}
