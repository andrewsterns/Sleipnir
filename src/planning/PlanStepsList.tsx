import { Frame } from '../app/UIKit/Frame/Frame'
import { Icon } from '../app/UIKit/Icon/Icon'
import { TextArea } from '../app/UIKit/Field/TextField'
import { StatusGlyph } from './graph/StatusGlyph'
import { ActivityPanel } from './ActivityPanel'
import { LensValue } from './LensControls'
import { usePlanStepsListViewModel, type PlanStepsListProps } from './PlanStepsList.ViewModel'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }
const LABEL: React.CSSProperties = { fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }
const LINK: React.CSSProperties = { color: 'var(--text-1)', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }
const QUIET_BUTTON: React.CSSProperties = { ...LABEL, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }

/** The timeline's gutter: the status marks sit on its centre line. */
const GUTTER = 20
const ROW_PAD = 8
const GLYPH = 12

export function PlanStepsList(props: PlanStepsListProps) {
  const vm = usePlanStepsListViewModel(props)
  const { plan, steps, plannedByStep, toneFor, selectedId, onSelect, events, onOpenFile } = props
  const fileLink = (path: string) => (
    <span key={path} style={{ fontSize: 11, lineHeight: 1.6, wordBreak: 'break-all', ...UI_FONT, ...(onOpenFile ? LINK : {}) }} onClick={onOpenFile ? () => onOpenFile(path) : undefined}>
      {path}
    </span>
  )

  return (
    <Frame flow="vertical" gap={0} shrink={0}>
      {/* What the plan is for — above its steps, editable in place. */}
      <Frame flow="vertical" gap={6} padding={{ x: 4, top: 4, bottom: 12 }}>
        <Frame flow="horizontal" align="center" justify="between">
          <span style={LABEL}>
            Plan · {vm.done} of {steps.length} done
          </span>
          {!vm.editing && (
            <button type="button" style={QUIET_BUTTON} onClick={() => vm.setEditing(true)}>
              {plan.description ? 'Edit' : 'Add description'}
            </button>
          )}
        </Frame>
        {vm.editing ? (
          <Frame flow="vertical" gap={6}>
            <TextArea value={vm.draft} onChange={(e) => vm.setDraft(e.target.value)} rows={4} autoFocus placeholder="What this plan is for, in a sentence or two" style={{ width: '100%', fontSize: 11, lineHeight: 1.5 }} />
            <Frame flow="horizontal" gap={10}>
              <button type="button" style={{ ...QUIET_BUTTON, color: 'var(--text-1)' }} onClick={vm.saveDescription} disabled={vm.saving}>
                {vm.saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" style={QUIET_BUTTON} onClick={() => vm.setEditing(false)}>
                Cancel
              </button>
            </Frame>
          </Frame>
        ) : (
          plan.description && <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>{plan.description}</span>
        )}
      </Frame>

      {/* Steps 1..n on one line, like a branch's history: each status mark on
          it, the line solid through finished work and dashed ahead. */}
      {steps.map((step, i) => {
        const isOpen = vm.open.has(step.id)
        const tone = toneFor(step)
        const finished = tone === 'done' || tone === 'committed'
        const last = i === steps.length - 1
        const planned = plannedByStep.get(step.id) ?? []
        const willChange = vm.hasRecordedChanges(step.id) ? [] : (step.editsPaths ?? [])
        const flags = props.flagsFor(step.id)
        const when = vm.lastActive(step.id)
        return (
          <div key={step.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {!last && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 4 + GUTTER / 2,
                  top: ROW_PAD + GLYPH + 4,
                  bottom: -ROW_PAD + 4,
                  borderLeft: `1px ${finished ? 'solid' : 'dashed'} var(--text-3)`,
                  pointerEvents: 'none',
                }}
              />
            )}
            <div
              role="button"
              aria-expanded={isOpen}
              onClick={() => {
                // Clicking an open step closes it. A closed one opens: picking
                // it does that (the view model's effect), or, already picked,
                // it simply opens again.
                if (isOpen || selectedId === step.id) vm.toggle(step.id)
                else onSelect(step.id)
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: `${ROW_PAD}px 4px`,
                cursor: 'pointer',
                borderRadius: 'var(--radius-2)',
                background: selectedId === step.id ? 'var(--bg-3)' : 'transparent',
              }}
            >
              {/* (step) [name] [lens] [status] — the step number sits on the
                  timeline, so the line still runs through the plan's order. */}
              <span style={{ width: GUTTER, height: GLYPH + 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ ...UI_FONT, fontSize: 10, lineHeight: '14px', minWidth: 14, textAlign: 'center', color: finished ? 'var(--text-3)' : 'var(--text-1)', background: 'var(--bg-1)' }}>
                  {step.order ?? i + 1}
                </span>
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: finished ? 'var(--text-2)' : 'var(--text-1)', lineHeight: 1.45 }}>{step.label}</span>
              {props.metricFor && <span style={{ paddingTop: 3 }}><LensValue metric={props.metricFor(step)} /></span>}
              <span style={{ height: GLYPH + 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                <StatusGlyph tone={tone} size={GLYPH} />
              </span>
              <span style={{ flexShrink: 0, color: 'var(--text-3)', transform: isOpen ? undefined : 'rotate(-90deg)', transition: 'transform 120ms', paddingTop: 1 }}>
                <Icon name="chevron-down" size={10} />
              </span>
            </div>
            {isOpen && (
              <Frame flow="vertical" gap={12} padding={{ left: 4 + GUTTER + 8, right: 4, top: 2, bottom: 14 }}>
                {when && <span style={{ ...LABEL, letterSpacing: '0.04em' }}>Last active {when}</span>}
                {step.description && <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>{step.description}</span>}
                {props.renderStatus(step)}
                {props.renderActions(step)}
                {(planned.length > 0 || willChange.length > 0) && (
                  <Frame flow="vertical" gap={4}>
                    {planned.length > 0 && <span style={LABEL}>New files</span>}
                    {planned.map((f) => f.filePath && fileLink(f.filePath))}
                    {willChange.length > 0 && <span style={{ ...LABEL, paddingTop: planned.length ? 6 : 0 }}>Will change</span>}
                    {willChange.map((p) => fileLink(p))}
                  </Frame>
                )}
                {flags.length > 0 && (
                  <Frame flow="vertical" gap={4}>
                    <span style={LABEL}>Worth a look</span>
                    {flags.map((f) => (
                      <span key={`${f.kind}:${f.path ?? ''}`} style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.5 }}>{f.text}</span>
                    ))}
                  </Frame>
                )}
                <ActivityPanel events={events} stepId={step.id} onOpenFile={onOpenFile} />
              </Frame>
            )}
          </div>
        )
      })}
    </Frame>
  )
}
