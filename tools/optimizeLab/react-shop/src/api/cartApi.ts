import { authToken } from '../store/cartStore'
import type { Product } from './productApi'

export async function syncCart(items: Product[]) {
  await fetch('/api/cart', { method: 'PUT', headers: { authorization: authToken() }, body: JSON.stringify(items) })
}

export async function submitOrder(items: Product[]) {
  await fetch('/api/orders', { method: 'POST', headers: { authorization: authToken() }, body: JSON.stringify(items) })
}
