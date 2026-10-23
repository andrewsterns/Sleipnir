import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { isUpdaterAvailable, useAppUpdate, type UpdateStatus } from '../TitleBar/iUpdater'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const BUTTON: React.CSSProperties = {
  background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
  border: '1px solid var(--border-2)',
  color: 'var(--text-1)',
  fontSize: 9,
  letterSpacing: '0.08em',
  padding: '6px 12px',
  cursor: 'pointer',
  ...MONO,
}

// One line describing where the updater is (see electron/updater.cjs) — the
// same status the title bar shows, but persistent rather than a 4s flash.
function statusText(s: UpdateStatus): string | null {
  switch (s.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'upToDate':
      return 'You’re on the latest version.'
    case 'downloading':
      return `Downloading v${s.version ?? '?'}${s.percent ? ` · ${s.percent}%` : '…'}`
    case 'ready':
      return `v${s.version} is downloaded and ready to install.`
    case 'error':
      return `Couldn’t check for updates${s.error ? `: ${s.error.split('\n')[0]}` : '.'}`
    case 'unsupported':
      return 'Updates only run in the installed app, not in dev.'
    default:
      return null
  }
}

// Manual counterpart to the background check — the same updaterAPI the title
// bar's Help ▸ Check for Updates and "Restart to update" button use.
export function UpdatesSection() {
  const { status, check, install } = useAppUpdate()

  if (!isUpdaterAvailable()) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Updates are desktop-only.</span>
  }

  const busy = status?.state === 'checking' || status?.state === 'downloading'
  const text = status ? statusText(status) : null

  return (
    <Frame flow="vertical" gap={10} style={{ maxWidth: 420 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>UPDATES</span>
      <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
        You’re running Sleipnir v{status?.currentVersion ?? '—'}. New versions are checked for on launch and every
        4 hours, downloaded in the background, and installed when you restart.
      </span>

      <Frame flow="horizontal" align="center" gap={10}>
        {status?.state === 'ready' ? (
          <button onClick={() => install()} style={{ ...BUTTON, borderColor: 'var(--nominal)', color: 'var(--nominal)' }}>
            RESTART TO UPDATE
          </button>
        ) : (
          <button
            onClick={check}
            disabled={busy}
            style={{ ...BUTTON, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}
          >
            CHECK FOR UPDATES
          </button>
        )}
        {text && (
          <span
            title={status?.state === 'error' ? status.error : undefined}
            style={{ fontSize: 9, color: status?.state === 'error' ? '#e07a7a' : 'var(--text-3)', ...MONO }}
          >
            {text}
          </span>
        )}
      </Frame>
    </Frame>
  )
}
