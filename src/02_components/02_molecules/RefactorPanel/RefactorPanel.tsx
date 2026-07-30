import ReactDOM from 'react-dom'
import { Frame } from '../../01_atoms/Frame/Frame'
import { Icon } from '../../01_atoms/Icon/Icon'
import { Dropdown } from '../Dropdown/Dropdown'
import { TacticalPanel } from '../Panel/Panel'
import { RefactorPanelProps } from './iRefactorPanel'
import { useRefactorPanelViewModel } from './RefactorPanelViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export const RefactorPanel: React.FC<RefactorPanelProps> = (props) => {
  const { current, options, previewTarget, plan, error, isApplying, openPreview, cancel, confirmApply } =
    useRefactorPanelViewModel(props)

  const currentLabel = options.find((o) => o.value === current)?.label ?? current

  return (
    <>
      <Dropdown
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(v) => openPreview(v as typeof current)}
        variant="none"
        w="auto"
        trigger={
          // eslint-disable-next-line no-restricted-syntax -- typography (font-size/letter-spacing) has no Frame prop; same accepted pattern as Chip.tsx.
          <Frame flow="horizontal" gap={6} align="center" style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em' }}>
            <Icon name="refactor" size={13} className="text-[var(--text-2)]" />
            <span style={{ color: 'var(--text-2)', textTransform: 'uppercase' }}>{currentLabel}</span>
          </Frame>
        }
      />

      {previewTarget && typeof document !== 'undefined' &&
        ReactDOM.createPortal(
          <Frame fixed inset z={200} flow="vertical" align="center" justify="center">
            <div
              aria-hidden="true"
              onClick={isApplying ? undefined : cancel}
              style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
            />
            <TacticalPanel
              flow="vertical"
              gap={12}
              padding={20}
              variant="default"
              chamfer={6}
              relative
              w={560}
              maxH="75vh"
            >
              <Frame flow="horizontal" align="center" justify="between">
                <span style={{ fontSize: 12, letterSpacing: '0.1em', color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
                  REFACTOR → {previewTarget.toUpperCase()}
                </span>
                {plan && (
                  <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>
                    {plan.movedCount} FILES MOVED · {plan.rewrittenFileCount} REWRITTEN
                  </span>
                )}
              </Frame>

              {error && (
                <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>
              )}

              {!error && !plan && (
                <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Computing preview…</span>
              )}

              {!error && plan && (
                <Frame flow="vertical" gap={4} scroll="y" maxH="50vh">
                  {plan.moves.length === 0 && (
                    <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>No files would move.</span>
                  )}
                  {plan.moves.map((m) => (
                    <Frame key={m.from} flow="vertical" gap={2} padding={{ bottom: 6 }} stroke={{ bottom: { color: 'rgba(255,255,255,0.06)' } }}>
                      <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>{m.from}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-1)', ...MONO }}>→ {m.to}</span>
                    </Frame>
                  ))}
                </Frame>
              )}

              <Frame flow="horizontal" gap={8} justify="end">
                <button
                  onClick={cancel}
                  disabled={isApplying}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--text-3)',
                    fontSize: 10,
                    padding: '5px 12px',
                    cursor: isApplying ? 'default' : 'pointer',
                    ...MONO,
                  }}
                >
                  Cancel
                </button>
                {!error && (
                  <button
                    onClick={confirmApply}
                    disabled={!plan || isApplying}
                    style={{
                      background: 'rgba(255,255,255,0.10)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'var(--text-1)',
                      fontSize: 10,
                      padding: '5px 12px',
                      cursor: !plan || isApplying ? 'default' : 'pointer',
                      opacity: !plan || isApplying ? 0.5 : 1,
                      ...MONO,
                    }}
                  >
                    {isApplying ? 'Applying…' : 'Apply'}
                  </button>
                )}
              </Frame>
            </TacticalPanel>
          </Frame>,
          document.body,
        )}
    </>
  )
}
