import { CURRENCY } from '../components/PriceTag'

export function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY }).format(cents / 100)
}
