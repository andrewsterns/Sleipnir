import { formatMoney } from '../utils/format'

export const CURRENCY = 'USD'

export function PriceTag({ cents }: { cents: number }) {
  return <span>{formatMoney(cents)}</span>
}
