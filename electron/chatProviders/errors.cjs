// Turns a provider SDK/fetch failure into one sentence a person can act on.
// All three SDKs (Anthropic, OpenAI, Google GenAI) put the HTTP status on the
// error as `.status`; network failures surface as a cause code or a bare
// "fetch failed".
const NETWORK_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'])

function statusOf(err) {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status
  if (typeof status === 'number') return status
  // @google/genai reports some failures only in the message: "got status: 401 …"
  const match = /\bstatus:?\s*(\d{3})\b/i.exec(String(err?.message ?? ''))
  return match ? Number(match[1]) : undefined
}

function isNetworkError(err) {
  const code = err?.code ?? err?.cause?.code
  if (code && NETWORK_CODES.has(code)) return true
  const message = String(err?.message ?? '')
  return /fetch failed|network|getaddrinfo|socket hang up|Connection error/i.test(message)
}

function describeError(err, { label, host }) {
  if (err?.name === 'AbortError') return 'Cancelled.'
  const status = statusOf(err)
  if (status === 401 || status === 403) {
    return `${label} rejected the key (${status}). Check it was copied in full and is still active.`
  }
  if (status === 402 || status === 429) {
    // Free-tier AI Studio keys get little or no quota on Pro models — by far
    // the most common Gemini 429, and one a model switch fixes.
    const hint = label === 'Gemini'
      ? ' On a free key, Pro models have little or no quota — switch to a Flash model, or wait a minute.'
      : ' Check your plan and billing.'
    return `${label} refused the request (${status}): rate limited or out of credit.${hint}`
  }
  if (status === 404) {
    return `${label} doesn't recognize that model (404). Pick another one in the model list.`
  }
  if (status && status >= 500) {
    return `${label} had a server error (${status}). Try again in a moment.`
  }
  if (isNetworkError(err)) return `Can't reach ${host}. Check your internet connection.`
  const message = err instanceof Error ? err.message : String(err)
  return status ? `${label} error (${status}): ${message}` : message
}

module.exports = { describeError, statusOf }
