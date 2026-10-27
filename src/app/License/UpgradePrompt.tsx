import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { Card } from '../UIKit/Card/Card'
import { FOUNDER_PRICE, PRO_FEATURES, useLicense, type UpgradeNeeded } from './iLicense'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

/** Key input + Activate, shared by UpgradePrompt and Settings ▸ License. */
export function LicenseKeyForm({ onActivated }: { onActivated?: () => void }) {
  const { activate } = useLicense()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await activate(key)
      if (result.ok) {
        setKey('')
        onActivated?.()
      } else {
        setError(result.error ?? 'Activation failed.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame flow="vertical" gap={6}>
      <Frame flow="horizontal" gap={8} align="center">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && key.trim() && !busy) submit() }}
          placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--bg-2)',
            border: '1px solid var(--border-2)',
            color: 'var(--text-1)',
            fontSize: 10,
            padding: '6px 8px',
            ...MONO,
          }}
        />
        <Button variant="secondary" size="sm" onClick={submit} disabled={busy || !key.trim()}>
          {busy ? 'Activating…' : 'Activate'}
        </Button>
      </Frame>
      {error && <span style={{ fontSize: 9, color: '#e07a7a', lineHeight: 1.5, ...MONO }}>{error}</span>}
    </Frame>
  )
}

// Mounted once in App.tsx. Opens whenever a main-process gate (see
// electron/license.cjs's proRequired) stops something this window asked
// for — so every caller of a gated IPC gets the same prompt for free,
// without each one having to recognise the error.
export function UpgradePrompt() {
  const { openCheckout } = useLicense()
  const [info, setInfo] = useState<UpgradeNeeded | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useEffect(() => window.licenseAPI?.onUpgradeNeeded(setInfo), [])

  // Same portal-to-nearest-theme-scope pattern as DeletePlanModal.
  useLayoutEffect(() => {
    let node: HTMLElement | null = anchorRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
  }, [])

  if (!info || !portalTarget) return <div ref={anchorRef} style={{ display: 'contents' }} />

  const close = () => setInfo(null)

  return (
    <div ref={anchorRef} style={{ display: 'contents' }}>
      {ReactDOM.createPortal(
        <Frame fixed inset z={200} flow="vertical" align="center" justify="center">
          <div
            aria-hidden="true"
            onClick={close}
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
          />
          <Card flow="vertical" gap={14} padding={20} relative w={460}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: 'var(--nominal)', fontWeight: 600, ...MONO }}>
              SLEIPNIR PRO
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>{info.message}</span>

            <Frame flow="vertical" gap={4}>
              {PRO_FEATURES.map((f) => (
                <span
                  key={f.id}
                  style={{ fontSize: 9, color: f.id === info.feature ? 'var(--text-1)' : 'var(--text-3)', ...MONO }}
                >
                  ✓ {f.label}
                </span>
              ))}
            </Frame>

            <span style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.6, ...MONO }}>
              Founder license: {FOUNDER_PRICE} once, Pro for life, including every update. Already bought one? Paste
              the key from your receipt email.
            </span>
            <LicenseKeyForm onActivated={close} />

            <Frame flow="horizontal" gap={8} justify="end">
              <Button variant="ghost" size="sm" onClick={close}>
                Not now
              </Button>
              <Button variant="primary" size="sm" onClick={openCheckout}>
                Buy Founder license · {FOUNDER_PRICE}
              </Button>
            </Frame>
          </Card>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
