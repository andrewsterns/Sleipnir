// A grab-bag: formatting, analytics, and a reach into the store for the token.
import { formatMoney as fm } from './format'
import { authToken } from '../store/cartStore'

export const formatMoney = fm

export function formatTitle(title: string) {
  return title.trim().replace(/\s+/g, ' ')
}

export function track(event: string, detail: string) {
  void fetch('/api/track', { method: 'POST', headers: { authorization: authToken() }, body: JSON.stringify({ event, detail }) })
}
