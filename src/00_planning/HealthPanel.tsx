import React, { useEffect, useRef } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { SleipnirLoader } from '../app/UIKit/SleipnirLoader/SleipnirLoader'
import { useHealthPanelViewModel, SECTION_ROWS, type HealthPanelProps, type HealthSection, type HealthTone } from './HealthPanel.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const LABEL: React.CSSProperties = { fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }
const TONE_COLOR = { danger: 'var(--graph-danger, #e5484d)', warn: 'var(--graph-warn, #eda100)', heat: 'var(--graph-heat, #3987e5)' } as const

// A bare text button — the panel's rows and actions, in the same quiet mono
// as the view-mode toggles in the Planning header.
const ROW_BUTTON: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '2px 0',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 10,
  lineHeight: 1.5,
  wordBreak: 'break-all',
  ...MONO,
}
const ACTION_BUTTON: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: '0.1em',
  padding: '4px 8px',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--border-2)',
  background: 'transparent',
  color: 'var(--text-2)',
  cursor: 'pointer',
  ...MONO,
}

const Divider = () => <div style={{ height: 1, background: 'var(--border-1)', flexShrink: 0 }} />

// The Health lens's side panel: what the graph's colors mean, the selected
// file's numbers and blast radius, and every finding as a list you can click
// through — the same findings an /optimize agent reads (see
// tools/architecture-health.mjs).
export const HealthPanel: React.FC<HealthPanelProps> = (props) => {
  const { health, error, onSelectPath, onOpenFile, onRescan } = props
  const { sections, selected, copied, copyReport, short } = useHealthPanelViewModel(props)
  // Picking a file — in the graph or from a list below — brings its block into view.
  const selectedRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected?.path])

  return (
    <Frame
      flow="vertical"
      minW={280}
      w={280}
      h="fill"
      fill={{ solid: 'bg-1' }}
      stroke={{ left: { color: 'border-1' } }}
      padding={20}
      gap={14}
      scroll="y"
    >
      <Frame flow="horizontal" align="center" gap={6}>
        <span style={{ ...LABEL, color: 'var(--text-1)', flex: 1 }}>HEALTH</span>
        <button type="button" style={ACTION_BUTTON} onClick={onRescan} title="Re-read every file and analyze again">
          RESCAN
        </button>
        <button type="button" style={ACTION_BUTTON} onClick={copyReport} disabled={!health} title="Copy the report an AI agent reads — paste it into any chat">
          {copied ? 'COPIED' : 'COPY REPORT'}
        </button>
      </Frame>

      {error ? (
        <span style={{ fontSize: 10, lineHeight: 1.6, color: TONE_COLOR.danger, ...MONO }}>Couldn’t analyze this project: {error}</span>
      ) : !health ? (
        <Frame flow="horizontal" align="center" gap={8}>
          <SleipnirLoader size={16} />
          <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Mapping every import…</span>
        </Frame>
      ) : (
        <>
          <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
            {health.summary.files} files · {health.summary.edges} imports · {health.summary.entries} entry points ·{' '}
            {(health.durationMs / 1000).toFixed(1)}s
          </span>
          <Legend />

          {selected && (
            <>
              <Divider />
              <Frame flow="vertical" gap={6}>
                <span ref={selectedRef} style={LABEL}>
                  SELECTED
                </span>
                <button
                  type="button"
                  style={{ ...ROW_BUTTON, fontSize: 12, fontWeight: 600, color: 'var(--info-5)', textDecoration: onOpenFile ? 'underline' : 'none', textUnderlineOffset: 2 }}
                  onClick={onOpenFile ? () => onOpenFile(selected.path) : undefined}
                  title={onOpenFile ? 'Open in Workspace' : undefined}
                >
                  {short(selected.path)}
                </button>
                <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
                  {selected.metrics.role} · in {selected.metrics.fanIn} · out {selected.metrics.fanOut} · instability {selected.metrics.instability}
                  {selected.metrics.lines !== null && ` · ${selected.metrics.lines} lines`}
                  {selected.metrics.churn !== null && ` · ${selected.metrics.churn} changes`}
                </span>
                {selected.flags.map((f) => (
                  <Frame key={f.text} flow="horizontal" align="center" gap={6}>
                    <ToneMark tone={f.tone} />
                    <span style={{ fontSize: 10, color: 'var(--text-1)', ...MONO }}>{f.text}</span>
                  </Frame>
                ))}
                <ImpactList
                  title="BREAKS IF CHANGED"
                  hint="Every file that imports this one, directly or through others — nearest first."
                  rows={selected.dependents}
                  total={selected.dependentsTotal}
                  onSelectPath={onSelectPath}
                  short={short}
                />
                <ImpactList
                  title="DEPENDS ON"
                  hint="Everything this file loads at runtime, directly or through others."
                  rows={selected.dependencies}
                  total={selected.dependenciesTotal}
                  onSelectPath={onSelectPath}
                  short={short}
                />
              </Frame>
            </>
          )}

          {sections.map((section) => (
            <React.Fragment key={section.id}>
              <Divider />
              <FindingList section={section} onSelectPath={onSelectPath} />
            </React.Fragment>
          ))}
        </>
      )}
    </Frame>
  )
}

const Legend: React.FC = () => {
  const swatch = (el: React.ReactNode, text: string, w = 18) => (
    <Frame flow="horizontal" align="center" gap={6}>
      <svg width={w} height={12} style={{ flexShrink: 0 }}>
        {el}
      </svg>
      <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>{text}</span>
    </Frame>
  )
  const glow = (id: string, color: string) => (
    <radialGradient id={id}>
      <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.9 }} />
      <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
    </radialGradient>
  )
  return (
    <Frame flow="vertical" gap={4}>
      {/* The heat scale: one hue, cool (no glow) to hot (a strong one). */}
      {swatch(
        <>
          <defs>
            <linearGradient id="health-legend-heat">
              <stop offset="0%" style={{ stopColor: 'var(--graph-heat, #3987e5)', stopOpacity: 0 }} />
              <stop offset="100%" style={{ stopColor: 'var(--graph-heat, #3987e5)', stopOpacity: 0.9 }} />
            </linearGradient>
          </defs>
          <rect x={0} y={3} width={40} height={6} rx={3} fill="url(#health-legend-heat)" />
        </>,
        'heat: changes often × imported widely × big',
        40,
      )}
      {swatch(
        <>
          <defs>{glow('health-legend-loop', TONE_COLOR.danger)}</defs>
          <circle cx={9} cy={6} r={6} fill="url(#health-legend-loop)" />
          <circle cx={9} cy={6} r={2} style={{ fill: 'var(--graph-node, #fff)' }} />
        </>,
        'in an import loop',
      )}
      {swatch(<line x1={1} y1={6} x2={17} y2={6} strokeWidth={1.5} strokeDasharray="4 3" style={{ stroke: TONE_COLOR.warn }} />, 'import up the layers')}
      {swatch(<circle cx={9} cy={6} r={3.5} fill="none" strokeWidth={1} strokeDasharray="2 2" style={{ stroke: 'var(--graph-node, #fff)' }} />, 'unused')}
      <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>Bigger dot = more files import it.</span>
    </Frame>
  )
}

// The graph mark a finding wears (see HealthTone), drawn small beside its
// heading or flag; the words themselves stay in ink.
const ToneMark: React.FC<{ tone: HealthTone }> = ({ tone }) => {
  if (tone === 'plain') return null
  return (
    <svg width={12} height={12} style={{ flexShrink: 0 }} aria-hidden>
      {tone === 'warn' ? (
        <line x1={0} y1={6} x2={12} y2={6} strokeWidth={1.5} strokeDasharray="3 2" style={{ stroke: TONE_COLOR.warn }} />
      ) : tone === 'unused' ? (
        <circle cx={6} cy={6} r={3.5} fill="none" strokeWidth={1} strokeDasharray="2 2" style={{ stroke: 'var(--graph-node, #fff)' }} />
      ) : (
        <>
          <circle cx={6} cy={6} r={5.5} style={{ fill: TONE_COLOR[tone], opacity: 0.35 }} />
          <circle cx={6} cy={6} r={2.5} style={{ fill: TONE_COLOR[tone] }} />
        </>
      )}
    </svg>
  )
}

const FindingList: React.FC<{ section: HealthSection; onSelectPath: (path: string) => void }> = ({ section, onSelectPath }) => {
  const { title, hint, tone, rows } = section
  return (
    <Frame flow="vertical" gap={4}>
      <Frame flow="horizontal" align="center" gap={6}>
        {rows.length > 0 && <ToneMark tone={tone} />}
        <span style={{ ...LABEL, color: rows.length ? 'var(--text-2)' : LABEL.color }} title={hint}>
          {title} ({rows.length})
        </span>
      </Frame>
      {rows.length === 0 ? (
        <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>None</span>
      ) : (
        <>
          {rows.slice(0, SECTION_ROWS).map((row, i) => (
            <button key={`${row.path}:${i}`} type="button" style={{ ...ROW_BUTTON, color: 'var(--text-1)' }} onClick={() => onSelectPath(row.path)} title="Select in graph">
              {row.text}
              {row.detail && <span style={{ color: 'var(--text-3)' }}> · {row.detail}</span>}
            </button>
          ))}
          {rows.length > SECTION_ROWS && (
            <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>…and {rows.length - SECTION_ROWS} more (in the copied report)</span>
          )}
        </>
      )}
    </Frame>
  )
}

const ImpactList: React.FC<{
  title: string
  hint: string
  rows: { path: string; distance: number }[]
  total: number
  onSelectPath: (path: string) => void
  short: (path: string) => string
}> = ({ title, hint, rows, total, onSelectPath, short }) => (
  <Frame flow="vertical" gap={2} margin={{ top: 6 }}>
    <span style={LABEL} title={hint}>
      {title} ({total})
    </span>
    {rows.map((r) => (
      <button key={r.path} type="button" style={{ ...ROW_BUTTON, color: 'var(--text-1)' }} onClick={() => onSelectPath(r.path)} title="Select in graph">
        {short(r.path)}
        {r.distance > 1 && <span style={{ color: 'var(--text-3)' }}> · {r.distance} hops</span>}
      </button>
    ))}
    {total > rows.length && <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>…and {total - rows.length} more</span>}
  </Frame>
)
