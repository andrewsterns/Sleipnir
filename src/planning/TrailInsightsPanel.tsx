import { Frame } from '../app/UIKit/Frame/Frame'
import { ListRow } from '../app/UIKit/ListRow/ListRow'
import { agentName, duration } from './activityLog'
import { useTrailInsightsPanelViewModel, type TrailInsightsPanelProps } from './TrailInsightsPanel.ViewModel'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }
const LABEL: React.CSSProperties = { fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }
const META: React.CSSProperties = { fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }
const NAV: React.CSSProperties = { ...META, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--info-5)' }

// Where agents' effort went, from the trail alone — no agent pays for it.
export function TrailInsightsPanel(props: TrailInsightsPanelProps) {
  const vm = useTrailInsightsPanelViewModel(props)
  const { session } = vm
  return (
    <Frame flow="vertical" gap={14}>
      <span style={LABEL}>Effort</span>
      {!session ? (
        <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
          Nothing on the trail yet. When an agent works in this project, what it reads, edits and tests shows up here.
        </span>
      ) : (
        <>
          <Frame flow="horizontal" align="center" justify="between">
            <span style={META}>
              {agentName(session.agent)} · {duration(session.end - session.start)}
            </span>
            {vm.sessions.length > 1 && (
              <Frame flow="horizontal" gap={8}>
                <button type="button" style={NAV} onClick={vm.newer} disabled={vm.index === 0}>
                  Newer
                </button>
                <button type="button" style={NAV} onClick={vm.older} disabled={vm.index >= vm.sessions.length - 1}>
                  Older
                </button>
              </Frame>
            )}
          </Frame>
          <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
            {session.calls} tool calls: {session.reads} reads, {session.searches} searches, {session.edits} edits, {session.tests} test runs
            {session.testFailures ? ` (${session.testFailures} failed)` : ''}.
          </span>

          <Frame flow="vertical" gap={6}>
            <span style={LABEL}>Worth a look</span>
            {vm.findings.length === 0 ? (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Nothing stands out.</span>
            ) : (
              vm.findings.map((f) => (
                <span
                  key={f.text}
                  onClick={f.path ? () => props.onSelectPath(f.path!) : undefined}
                  style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.5, cursor: f.path ? 'pointer' : 'default' }}
                >
                  {f.text}
                </span>
              ))
            )}
          </Frame>
        </>
      )}

      {vm.topFiles.length > 0 && (
        <Frame flow="vertical" gap={2}>
          <span style={{ ...LABEL, paddingBottom: 4 }}>Most effort</span>
          {vm.topFiles.map((f) => (
            <ListRow
              key={f.path}
              title={f.path}
              onClick={() => props.onSelectPath(f.path)}
              trailing={
                <span style={{ width: 36, height: 3, background: 'var(--border-1)', position: 'relative', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', inset: 0, width: `${Math.round((f.score / vm.maxScore) * 100)}%`, background: 'var(--graph-heat, #3987e5)' }} />
                </span>
              }
            >
              {f.path}
            </ListRow>
          ))}
        </Frame>
      )}
    </Frame>
  )
}
