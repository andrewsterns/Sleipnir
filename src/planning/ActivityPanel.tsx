import { Frame } from '../app/UIKit/Frame/Frame'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { ListRow } from '../app/UIKit/ListRow/ListRow'
import { DiffView } from '../source-control/DiffView'
import { StatusGlyph } from './graph/StatusGlyph'
import { stageConfig } from './graph/stages'
import { agentName, duration, reportAge } from './activityLog'
import type { FileChange } from './graph/types'
import { useActivityPanelViewModel, type ActivityPanelProps } from './ActivityPanel.ViewModel'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }
const LABEL: React.CSSProperties = { fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }
const META: React.CSSProperties = { fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }

// Git's letters and colors for a change, as Source Control's diff shows them.
const CHANGE_MARK: Record<FileChange['change'], { letter: string; color: string; title: string }> = {
  added: { letter: 'A', color: '#7ec98f', title: 'Created by this step' },
  modified: { letter: 'M', color: 'var(--text-2)', title: 'Changed by this step — click for its diff' },
  deleted: { letter: 'D', color: '#e07a7a', title: 'Deleted by this step' },
}

export function ActivityPanel(props: ActivityPanelProps) {
  const vm = useActivityPanelViewModel(props)
  const { activity } = vm
  const { onOpenFile } = props
  const timing = [
    activity.agent && agentName(activity.agent),
    activity.startedAt !== undefined && `Started ${reportAge(activity.startedAt)}`,
    activity.startedAt !== undefined && activity.finishedAt !== undefined && `Took ${duration(activity.finishedAt - activity.startedAt)}`,
  ].filter(Boolean)

  return (
    <Frame flow="vertical" gap={8}>
      <span style={LABEL}>Activity</span>
      {timing.length > 0 && <span style={META}>{timing.join(' · ')}</span>}

      {/* Reports and comments, newest first, as ticks on the step's own line,
          like commits on a branch. A comment is said, not a status: a quote
          mark where the glyph would be. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', paddingLeft: 16 }}>
        {vm.reports.length > 1 && <span aria-hidden style={{ position: 'absolute', left: 4, top: 6, bottom: 6, borderLeft: '1px solid var(--border-2)' }} />}
        {vm.reports.map((r) => (
          <div key={`${r.at}-${r.status ?? 'comment'}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ position: 'absolute', left: -16, top: 1, width: 9, height: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-1)', ...META }}>
              {r.status ? <StatusGlyph stage={r.status} size={9} /> : '“'}
            </span>
            <span style={META}>
              {r.status ? `${(stageConfig(r.status)?.label ?? r.status)} · ` : ''}
              {r.agent ? agentName(r.agent) : 'Someone'} · {reportAge(r.at)}
            </span>
            {(r.note || r.comment) && (
              <span style={{ fontSize: 11, color: r.comment ? 'var(--text-1)' : 'var(--text-2)', lineHeight: 1.5 }}>{r.comment ?? r.note}</span>
            )}
          </div>
        ))}
        {vm.hiddenReports > 0 && (
          <button
            type="button"
            onClick={vm.showAllReports}
            style={{ ...META, alignSelf: 'flex-start', color: 'var(--info-5)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            {vm.hiddenReports} Earlier
          </button>
        )}
      </div>


      {(activity.changes.length > 0 || activity.changesUnknown) && (
        <Frame flow="vertical" gap={2}>
          <span style={{ ...LABEL, paddingTop: 4 }}>
            Changed ({activity.changes.length + activity.moreChanges})
          </span>
          {activity.changesUnknown && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
              The project was too big to snapshot when this step started, so its changes weren't recorded.
            </span>
          )}
          {activity.changes.map((c) => {
            const mark = CHANGE_MARK[c.change]
            const open = vm.openPath === c.path
            return (
              <Frame key={c.path} flow="vertical" gap={4}>
                <ListRow
                  selected={open}
                  title={`${c.path} — ${mark.title}`}
                  onClick={() => (c.change === 'added' ? onOpenFile?.(c.path) : vm.toggleDiff(c))}
                  leading={<span style={{ ...UI_FONT, fontSize: 11, width: 10, color: open ? 'inherit' : mark.color }}>{mark.letter}</span>}
                  labelOpacity={c.change === 'deleted' ? 0.5 : undefined}
                  trailing={(hovered) =>
                    hovered && c.change !== 'deleted' && onOpenFile ? (
                      <IconButton
                        onClick={(e) => { e.stopPropagation(); onOpenFile(c.path) }}
                        title="Open in Workspace"
                        glyph="↗"
                        iconSize={12}
                        size={18}
                        textColor="var(--text-3)"
                      />
                    ) : null
                  }
                >
                  {/* The name reads in a narrow panel; the full path is in the title. */}
                  {c.path.split('/').pop()}
                </ListRow>
                {open && (
                  <Frame flow="vertical" gap={4} padding={{ bottom: 6 }}>
                    <span style={META}>Against the last commit</span>
                    {/* Diff lines run long: they scroll inside their own box
                        instead of widening the whole card. */}
                    <Frame scroll="both" maxHeight={360} minWidth={0} width="100%">
                      <DiffView diff={vm.diff} loading={vm.diffLoading} mode="unified" />
                    </Frame>
                  </Frame>
                )}
              </Frame>
            )
          })}
          {activity.moreChanges > 0 && <span style={META}>+ {activity.moreChanges} MORE</span>}
        </Frame>
      )}
    </Frame>
  )
}
