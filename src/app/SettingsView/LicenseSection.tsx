import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { FOUNDER_PRICE, PRO_FEATURES, isLicenseAvailable, useLicense, type LicenseStatus } from '../License/iLicense'
import { LicenseKeyForm } from '../License/UpgradePrompt'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

const BUTTON: React.CSSProperties = {
  background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
  border: '1px solid var(--border-2)',
  color: 'var(--text-1)',
  fontSize: 10,
  letterSpacing: '0.04em',
  padding: '6px 12px',
  cursor: 'pointer',
  ...UI_FONT,
}

const LABEL: React.CSSProperties = { fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }
const BODY: React.CSSProperties = { fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, ...UI_FONT }

function summary(s: LicenseStatus): string {
  switch (s.state) {
    case 'dev':
      return 'Pro (SLEIPNIR_PRO=1 dev override).'
    case 'unlocked':
      return 'Every feature is unlocked in this version — Founder licenses open soon.'
    case 'checking':
      return 'Pro · checking your license…'
    case 'active':
      return `Pro${s.variant ? ` · ${s.variant}` : ''}${s.email ? ` · ${s.email}` : ''}${s.keyHint ? ` · key …${s.keyHint}` : ''}`
    case 'invalid':
      return 'Free · your license key is no longer valid.'
    default:
      return 'Free · personal and noncommercial use.'
  }
}

// Settings ▸ License — tier, key entry/removal, and the free tier's project
// slots (see electron/license.cjs). The same licenseAPI UpgradePrompt uses.
export function LicenseSection() {
  const { status, isPro, deactivate, releaseProject, openCheckout } = useLicense()

  if (!isLicenseAvailable()) {
    return <span style={{ fontSize: 11, color: 'var(--text-3)', ...UI_FONT }}>Licensing is desktop-only.</span>
  }
  if (!status) return null

  return (
    <Frame flow="vertical" gap={18} style={{ maxWidth: 460 }}>
      <Frame flow="vertical" gap={8}>
        <span style={LABEL}>License</span>
        <span style={{ fontSize: 11, color: isPro ? 'var(--nominal)' : 'var(--text-1)', ...UI_FONT }}>{summary(status)}</span>
        {status.error && <span style={{ fontSize: 10, color: '#e07a7a', lineHeight: 1.5, ...UI_FONT }}>{status.error}</span>}
        {status.stale && (
          <span style={BODY}>Couldn’t reach the license server for a while. Pro keeps working; it’ll recheck when you’re online.</span>
        )}
      </Frame>

      {status.state === 'active' || status.state === 'checking' ? (
        <Frame flow="vertical" gap={8}>
          <span style={BODY}>
            Moving to another computer? Remove the key here first to free its activation, then enter it on the new
            machine.
          </span>
          <Frame flow="horizontal">
            <button onClick={deactivate} style={BUTTON}>Remove key from this computer</button>
          </Frame>
        </Frame>
      ) : status.state !== 'dev' && status.state !== 'unlocked' ? (
        <Frame flow="vertical" gap={10}>
          <span style={BODY}>
            Sleipnir is free for personal and noncommercial use. Sleipnir Pro adds:
          </span>
          <Frame flow="vertical" gap={4}>
            {PRO_FEATURES.map((f) => (
              <span key={f.id} style={{ fontSize: 11, color: 'var(--text-2)', ...UI_FONT }}>✓ {f.label}</span>
            ))}
          </Frame>
          <Frame flow="horizontal">
            <button onClick={openCheckout} style={{ ...BUTTON, borderColor: 'var(--nominal)', color: 'var(--nominal)' }}>
              Buy founder license · {FOUNDER_PRICE}
            </button>
          </Frame>
          <span style={LABEL}>Enter a license key</span>
          {!status.configured && (
            <span style={BODY}>This build has no license store configured, so keys can’t be activated yet.</span>
          )}
          <LicenseKeyForm />
        </Frame>
      ) : null}

      {!isPro && (
        <Frame flow="vertical" gap={8}>
          <span style={LABEL}>
            Free projects · {status.freeProjects.length}/{status.freeProjectLimit}
          </span>
          <span style={BODY}>
            The free version opens up to {status.freeProjectLimit} projects. Release one you no longer use to free its
            slot.
          </span>
          {status.freeProjects.length === 0 ? (
            <span style={BODY}>No projects opened yet.</span>
          ) : (
            status.freeProjects.map((p) => (
              <Frame key={p} flow="horizontal" align="center" gap={10}>
                <span
                  title={p}
                  style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...UI_FONT }}
                >
                  {p}
                </span>
                <button onClick={() => releaseProject(p)} style={BUTTON}>Release</button>
              </Frame>
            ))
          )}
        </Frame>
      )}
    </Frame>
  )
}
