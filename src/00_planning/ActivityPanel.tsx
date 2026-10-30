import { Frame } from '../app/UIKit/Frame/Frame'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { ListRow } from '../app/UIKit/ListRow/ListRow'
import { DiffView } from '../06_source_control/DiffView'
import { StatusGlyph } from './graph/StatusGlyph'
import { stageConfig } from './graph/stages'
import { duration, reportAge } from './graph/activityLog'
import type { FileChange } from './graph/types'
import { useActivityPanelViewModel, type ActivityPanelProps } from './ActivityPanel.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const LABEL: React.CSSProperties = { fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }
const META: React.CSSProperties = { fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }

// Git's letters and colors for a change, as Source Control's diff shows them.
const CHANGE_MARK: Record<FileChange['change'], { letter: string; color: string; title: string }> = {
  added: { letter: 'A', color: '#7ec98f', title: 'Created by this step' },
  modified: { letter: 'M', color: 'var(--text-2)', title: 'Changed by this step — click for its diff' },
  deleted: { letter: 'D', color: '#e07a7a', title: 'Deleted by this step' },
}

export function ActivityPanel(props: ActivityPanelProps) {
  const vm = useActivityPanelViewModel(props)
  const { activity } = vm
  if (activity.reports.length === 0) return null
  const { onOpenFile } = props
  const timing = [
    activity.agent?.toUpperCase(),
    activity.startedAt !== undefined && `STARTED ${reportAge(activity.startedAt).toUpperCase()}`,
    activity.startedAt !== undefined && activity.finishedAt !== undefined && `TOOK ${duration(activity.finishedAt - activity.startedAt).toUpperCase()}`,
  ].filter(Boolean)

  return (
    <Frame flow="vertical" gap={8}>
      <span style={LABEL}>ACTIVITY</span>
      {timing.length > 0 && <span style={META}>{timing.join(' · ')}</span>}

      {/* The reports, newest first. */}
      <Frame flow="vertical" gap={6}>
        {vm.reports.map((r) => (
          <Frame key={`${r.at}-${r.status}`} flow="horizontal" gap={6} align="start">
            <span style={{ paddingTop: 2 }}>
              <StatusGlyph stage={r.status} size={9} />
            </span>
            <Frame flow="vertical" gap={2} minWidth={0} flexGrow={1}>
              <span style={META}>
                {(stageConfig(r.status)?.label ?? r.status).toUpperCase()}
                {r.agent ? ` · ${r.agent.toUpperCase()}` : ''} · {reportAge(r.at)}
              </span>
              {r.note && <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>{r.note}</span>}
            </Frame>
          </Frame>
        ))}
        {vm.hiddenReports > 0 && (
          <button
            type="button"
            onClick={vm.showAllReports}
            style={{ ...META, alignSelf: 'flex-start', color: 'var(--info-5)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            {vm.hiddenReports} EARLIER
          </button>
        )}
      </Frame>

      {(activity.changes.length > 0 || activity.changesUnknown) && (
        <Frame flow="vertical" gap={2}>
          <span style={{ ...LABEL, paddingTop: 4 }}>
            CHANGED ({activity.changes.length + activity.moreChanges})
          </span>
          {activity.changesUnknown && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
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
                  leading={<span style={{ ...MONO, fontSize: 10, width: 10, color: open ? 'inherit' : mark.color }}>{mark.letter}</span>}
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
                  {c.path}
                </ListRow>
                {open && (
                  <Frame flow="vertical" gap={4} padding={{ bottom: 6 }}>
                    <span style={META}>AGAINST THE LAST COMMIT</span>
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
