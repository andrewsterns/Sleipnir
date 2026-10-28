import { useState } from 'react'
import { ProductPage } from './pages/ProductPage'
import { CartPage } from './pages/CartPage'
import { CheckoutPage } from './pages/CheckoutPage'

export function App() {
  const [route, setRoute] = useState<'product' | 'cart' | 'checkout'>('product')
  return (
    <main>
      <nav>
        <button onClick={() => setRoute('product')}>Shop</button>
        <button onClick={() => setRoute('cart')}>Cart</button>
      </nav>
      {route === 'product' && <ProductPage id="p1" />}
      {route === 'cart' && <CartPage onCheckout={() => setRoute('checkout')} />}
      {route === 'checkout' && <CheckoutPage />}
    </main>
  )
}
