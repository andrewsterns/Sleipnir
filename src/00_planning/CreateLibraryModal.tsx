import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Button } from '../app/UIKit/Button/Button'
import { TacticalPanel } from '../app/UIKit/Panel/Panel'
import { ARCHITECTURE_OPTIONS } from '../app/RefactorPanel/RefactorPanelViewModel'
import { SCAFFOLD_LANGUAGES } from './scaffoldOptions'
import { useCreateLibraryViewModel, type CreateLibraryModalProps } from './CreateLibraryModal.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const KIND_OPTIONS: { value: 'component' | 'prototype'; label: string }[] = [
  { value: 'component', label: 'Component Library' },
  { value: 'prototype', label: 'Prototype Library' },
]

function ToggleRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <Frame flow="horizontal" gap={6} wrap="wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            background: value === o.value ? 'rgba(255,255,255,0.14)' : 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            color: value === o.value ? 'var(--text-1)' : 'var(--text-3)',
            fontSize: 9,
            letterSpacing: '0.04em',
            padding: '4px 8px',
            cursor: 'pointer',
            ...MONO,
          }}
        >
          {o.label}
        </button>
      ))}
    </Frame>
  )
}

// Portals into the nearest `.theme-*` ancestor for the same reason
// RefactorPanel/Dropdown do — document.body sits outside every theme scope,
// so every CSS custom property (colors, Button's --primary-*, ...) would
// resolve to nothing there.
export function CreateLibraryModal(props: CreateLibraryModalProps) {
  const vm = useCreateLibraryViewModel(props)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    let node: HTMLElement | null = anchorRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
  }, [])

  if (!portalTarget) return <div ref={anchorRef} style={{ display: 'contents' }} />

  return (
    <div ref={anchorRef} style={{ display: 'contents' }}>
      {ReactDOM.createPortal(
        <Frame fixed inset z={200} flow="vertical" align="center" justify="center">
          <div
            aria-hidden="true"
            onClick={vm.submitting ? undefined : vm.onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
          />
          <TacticalPanel flow="vertical" gap={14} padding={20} variant="default" chamfer={6} relative w={440}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
              NEW LIBRARY
            </span>

            <Frame flow="vertical" gap={6}>
              <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>NAME</span>
              <input
                autoFocus
                value={vm.label}
                onChange={(e) => vm.setLabel(e.target.value)}
                placeholder="My Library"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'var(--text-1)',
                  fontSize: 11,
                  padding: '6px 8px',
                  ...MONO,
                }}
              />
              {vm.id && (
                <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>id: {vm.id}</span>
              )}
            </Frame>

            <Frame flow="vertical" gap={6}>
              <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>KIND</span>
              <ToggleRow options={KIND_OPTIONS} value={vm.kind} onChange={vm.setKind} />
            </Frame>

            <Frame flow="vertical" gap={6}>
              <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>ARCHITECTURE</span>
              <ToggleRow
                options={ARCHITECTURE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={vm.architecture}
                onChange={vm.setArchitecture}
              />
            </Frame>

            <Frame flow="vertical" gap={6}>
              <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>LANGUAGE</span>
              <ToggleRow options={SCAFFOLD_LANGUAGES.map((o) => ({ value: o.id, label: o.label }))} value={vm.language} onChange={vm.setLanguage} />
            </Frame>

            {vm.error && (
              <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{vm.error}</span>
            )}

            <Frame flow="horizontal" gap={8} justify="end">
              <Button variant="ghost" size="sm" onClick={vm.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={vm.submit} disabled={!vm.canSubmit} isLoading={vm.submitting}>
                {vm.submitting ? 'Creating…' : 'Create Library'}
              </Button>
            </Frame>
          </TacticalPanel>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
