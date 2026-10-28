import { ProductCard } from './ProductPage'
import { useCart } from '../store/cartStore'
import { formatMoney } from '../utils/helpers'

export function CartPage({ onCheckout }: { onCheckout: () => void }) {
  const cart = useCart()
  return (
    <section>
      {cart.items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
      <p>Total {formatMoney(cart.total())}</p>
      <button onClick={onCheckout}>Checkout</button>
    </section>
  )
}
