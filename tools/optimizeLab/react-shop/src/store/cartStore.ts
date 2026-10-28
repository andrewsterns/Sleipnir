import { syncCart } from '../api/cartApi'
import type { Product } from '../api/productApi'

const items: Product[] = []
let token = ''

export function authToken() {
  return token
}

export function setToken(t: string) {
  token = t
}

export function useCart() {
  return {
    items,
    add(p: Product) {
      items.push(p)
      void syncCart(items)
    },
    total: () => items.reduce((sum, p) => sum + p.cents, 0),
  }
}
