import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { Button } from '../UIKit/Button/Button'
import { IconButton } from '../UIKit/IconButton/IconButton'
import { Tabs } from '../UIKit/Tabs/Tabs'
import { TacticalPanel } from '../UIKit/Panel/Panel'
import type { Architecture } from '../../00_planning/api/sleipnirApi'
import { RefactorPanelProps } from './iRefactorPanel'
import { useRefactorPanelViewModel, type ArchitectureBucket } from './RefactorPanelViewModel'
import { MiniArchitectureGraph } from './MiniArchitectureGraph'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Frame flow="vertical" gap={2}>
      <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
        {label.toUpperCase()}
      </span>
      <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600, ...MONO }}>{value}</span>
    </Frame>
  )
}

// Small dot-cluster per bucket — a "mini node preview" of the resulting
// folder shape (grouped by role folder for MVVM/MVC/MVP, by tier for
// Atomic), not a full dependency graph. Capped per bucket so a 100+ file
// library still reads as a glance-able shape rather than a wall of dots.
const MAX_DOTS_PER_BUCKET = 18

function BucketPreview({
  buckets,
  bucketColorForId,
}: {
  buckets: ArchitectureBucket[]
  bucketColorForId: (id: string) => string | null
}) {
  return (
    <Frame flow="horizontal" gap={10} wrap="wrap">
      {buckets.map((bucket) => (
        <Frame
          key={bucket.label}
          flow="vertical"
          gap={6}
          padding={10}
          radius="var(--radius-2)"
          stroke={{ color: 'border-1' }}
          minW={104}
        >
          <span style={{ fontSize: 8, letterSpacing: '0.08em', color: 'var(--text-3)', ...MONO }}>
            {bucket.label.toUpperCase()} · {bucket.nodeIds.length}
          </span>
          <Frame flow="horizontal" gap={3} wrap="wrap" style={{ maxWidth: 140 }}>
            {bucket.nodeIds.slice(0, MAX_DOTS_PER_BUCKET).map((id) => (
              <span
                key={id}
                title={id}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: bucketColorForId(id) ?? 'var(--text-2)',
                  display: 'inline-block',
                }}
              />
            ))}
            {bucket.nodeIds.length > MAX_DOTS_PER_BUCKET && (
              <span style={{ fontSize: 8, color: 'var(--text-3)', ...MONO }}>
                +{bucket.nodeIds.length - MAX_DOTS_PER_BUCKET}
              </span>
            )}
          </Frame>
        </Frame>
      ))}
    </Frame>
  )
}

export const RefactorPanel: React.FC<RefactorPanelProps> = (props) => {
  const { showLabel = true } = props
  const {
    options,
    libraryId,
    setLibraryId,
    libraries,
    current,
    isOpen,
    open,
    close,
    activeArchitecture,
    setActiveArchitecture,
    plan,
    isLoadingPlan,
    error,
    isApplying,
    confirmApply,
    buckets,
    bucketColorForId,
    folderDepth,
    dsmGraph,
  } = useRefactorPanelViewModel(props)

  const anchorRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  // Same reasoning as Dropdown.tsx: portaling straight to document.body would
  // sit outside every `.theme-*` scope (ThemeProvider classes a div inside
  // #root, not <html>/<body>), so every CSS custom property the preview panel
  // and its Button rely on (--primary-1, --bg-2, --text-1, ...) would resolve
  // to nothing — transparent backgrounds, black text, regardless of theme.
  useLayoutEffect(() => {
    if (!isOpen) return
    let node: HTMLElement | null = anchorRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
  }, [isOpen])

  return (
    <div ref={anchorRef} style={{ display: 'contents' }}>
      {showLabel ? (
        <Frame
          as="button"
          onClick={open}
          flow="horizontal"
          gap={6}
          align="center"
          variant="none"
          hoverFill="bg-2"
          radius={4}
          padding={{ x: 8, y: 5 }}
          cursor="pointer"
          textColor="var(--text-2)"
          style={{ ...MONO, fontSize: 12, letterSpacing: '0.02em' }}
        >
          <Icon name="refactor" size={15} />
          <span style={{ textTransform: 'uppercase' }}>Refactor</span>
        </Frame>
      ) : (
        <IconButton onClick={open} title="Refactor" icon="refactor" textColor="var(--text-2)" />
      )}

      {isOpen && portalTarget &&
        ReactDOM.createPortal(
          <Frame fixed inset z={200} flow="vertical" align="center" justify="center">
            <div
              aria-hidden="true"
              onClick={isApplying ? undefined : close}
              style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
            />
            <TacticalPanel
              flow="vertical"
              gap={14}
              padding={20}
              variant="default"
              chamfer={6}
              relative
              w={620}
              maxH="82vh"
            >
              <Frame flow="horizontal" align="center" justify="between">
                <span style={{ fontSize: 12, letterSpacing: '0.1em', color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
                  REFACTOR
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>
                  CURRENT: {current.toUpperCase()}
                </span>
              </Frame>

              {libraries.length > 1 && (
                <Frame flow="vertical" gap={4}>
                  <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
                    LIBRARY
                  </span>
                  <select
                    value={libraryId}
                    onChange={(e) => setLibraryId(e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'var(--text-1)',
                      fontSize: 11,
                      padding: '5px 8px',
                      ...MONO,
                    }}
                  >
                    {libraries.map((lib) => (
                      <option key={lib.id} value={lib.id}>{lib.label}</option>
                    ))}
                  </select>
                </Frame>
              )}

              <Tabs.Root value={activeArchitecture} onValueChange={(v) => setActiveArchitecture(v as Architecture)}>
                <Tabs.List>
                  {options.map((o) => (
                    <Tabs.Tab key={o.value} value={o.value}>{o.label}</Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.Root>

              <Frame flow="horizontal" gap={24}>
                <Stat label="Folder depth" value={`${folderDepth} levels`} />
                <Stat label="Files that move" value={plan ? String(plan.movedCount) : '—'} />
                <Stat label="Import rewrites" value={plan ? String(plan.rewrittenFileCount) : '—'} />
              </Frame>

              <Frame flow="horizontal" gap={16} align="start">
                <Frame flow="vertical" gap={4} shrink={0}>
                  <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
                    STRUCTURE PREVIEW
                  </span>
                  <Frame
                    padding={4}
                    radius="var(--radius-2)"
                    stroke={{ color: 'border-1' }}
                    fill={{ solid: 'rgba(0,0,0,0.15)' }}
                  >
                    <MiniArchitectureGraph data={dsmGraph} buckets={buckets} bucketColorForId={bucketColorForId} />
                  </Frame>
                </Frame>
                <BucketPreview buckets={buckets} bucketColorForId={bucketColorForId} />
              </Frame>

              {!error && plan && plan.violations && plan.violations.length > 0 && (
                <Frame flow="vertical" gap={4}>
                  <span style={{ fontSize: 8, letterSpacing: '0.1em', color: '#e0a458', ...MONO }}>
                    ARCHITECTURE VIOLATIONS ({plan.violations.length}) — READ-ONLY, NOT FIXED BY REFACTOR
                  </span>
                  {plan.violations.map((v, i) => (
                    <Frame key={`${v.file}-${i}`} flow="vertical" gap={1}>
                      <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>{v.file}</span>
                      <span style={{ fontSize: 9, color: '#e0a458', ...MONO }}>{v.message}</span>
                    </Frame>
                  ))}
                </Frame>
              )}

              {error && (
                <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>
              )}

              {!error && isLoadingPlan && !plan && (
                <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Computing move list…</span>
              )}

              {!error && plan && (
                <Frame flow="vertical" gap={4} scroll="y" maxH="30vh">
                  <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
                    CHANGES ({plan.moves.length})
                  </span>
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
                <Button variant="ghost" size="sm" onClick={close} disabled={isApplying}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={confirmApply}
                  disabled={!plan || activeArchitecture === current}
                  isLoading={isApplying}
                >
                  {isApplying ? 'Applying…' : `Apply ${activeArchitecture.toUpperCase()}`}
                </Button>
              </Frame>
            </TacticalPanel>
          </Frame>,
          portalTarget,
        )}
    </div>
  )
}
