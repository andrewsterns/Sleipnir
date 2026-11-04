import { Frame } from '../../app/UIKit/Frame/Frame'
import { Icon } from '../../app/UIKit/Icon/Icon'
import { SleipnirLoader } from '../../app/UIKit/SleipnirLoader/SleipnirLoader'
import { StatusGlyph } from '../graph/StatusGlyph'
import { LensValue } from '../LensControls'
import { instructionNodeId, skillNodeId } from '../graph/skillGraph'
import { SkillCard } from './SkillCard'
import { useSkillsListViewModel, type SkillsListProps } from './SkillsList.ViewModel'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }
const LABEL: React.CSSProperties = { fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }
const META: React.CSSProperties = { fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }

export function SkillsList(props: SkillsListProps) {
  const vm = useSkillsListViewModel(props)
  const { scan, selectedId, onSelect, onOpenFile, onSaved } = props
  if (!scan) {
    return (
      <Frame flow="horizontal" align="center" gap={8} padding={{ x: 4, top: 4 }}>
        <SleipnirLoader size={16} />
        <span style={{ fontSize: 11, color: 'var(--text-3)', ...UI_FONT }}>Reading your agents' skills…</span>
      </Frame>
    )
  }

  return (
    <Frame flow="vertical" gap={0} shrink={0}>
      {/* What every agent loads before it starts: the cost of each session. */}
      <Frame flow="vertical" gap={6} padding={{ x: 4, top: 4, bottom: 14 }}>
        <Frame flow="horizontal" align="center" justify="between">
          <span style={LABEL}>Instructions</span>
          <span style={META}>~{vm.instructionTokens.toLocaleString()} tokens</span>
        </Frame>
        {scan.instructions.map((i) => (
          <div key={i.file} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              onClick={() => {
                onSelect(instructionNodeId(i.file))
                onOpenFile?.(i.file)
              }}
              title={onOpenFile ? 'Open in Workspace' : undefined}
              style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-1)', textDecoration: onOpenFile ? 'underline' : 'none', textUnderlineOffset: 2, cursor: 'pointer', wordBreak: 'break-all', ...UI_FONT }}
            >
              {i.file}
            </span>
            <span style={META}>~{i.tokens.toLocaleString()}</span>
          </div>
        ))}
      </Frame>

      <span style={{ ...LABEL, padding: '0 4px 4px' }}>Skills ({scan.skills.length})</span>
      {scan.skills.map((skill) => {
        const nodeId = skillNodeId(skill.id)
        const isOpen = vm.open.has(skill.id)
        const tone = vm.toneOf(nodeId)
        const active = tone === 'in_progress' || tone === 'testing'
        return (
          <Frame key={skill.id} flow="vertical" gap={0} stroke={{ top: { color: 'border-1' } }}>
            <div
              role="button"
              aria-expanded={isOpen}
              onClick={() => {
                // Clicking an open skill closes it; a closed one opens and is
                // picked on the graph.
                if (isOpen) vm.toggle(skill.id)
                else if (selectedId === nodeId) vm.toggle(skill.id)
                else onSelect(nodeId)
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 4px',
                cursor: 'pointer',
                borderRadius: 'var(--radius-2)',
                background: selectedId === nodeId ? 'var(--bg-3)' : 'transparent',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--text-1)', ...UI_FONT }}>/{skill.id}</span>
                {!isOpen && skill.description && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</span>
                )}
              </span>
              {/* [name] [lens] [status] — the same columns as a plan's steps. */}
              {props.metricFor && (
                <span style={{ paddingTop: 3 }}>
                  <LensValue metric={(() => {
                    const node = props.nodes.find((n) => n.id === nodeId)
                    return node ? props.metricFor(node) : null
                  })()} />
                </span>
              )}
              {tone && (
                <span title={active ? 'An agent is in this skill now' : undefined} style={{ paddingTop: 2, flexShrink: 0 }}>
                  <StatusGlyph tone={tone} size={10} />
                </span>
              )}
              <span style={{ ...META, paddingTop: 2, flexShrink: 0 }}>~{skill.tokens.toLocaleString()}</span>
              <span style={{ flexShrink: 0, color: 'var(--text-3)', transform: isOpen ? undefined : 'rotate(-90deg)', transition: 'transform 120ms', paddingTop: 1 }}>
                <Icon name="chevron-down" size={10} />
              </span>
            </div>
            {isOpen && (
              <Frame flow="vertical" padding={{ x: 4, top: 2, bottom: 14 }}>
                <SkillCard skill={skill} onOpenFile={onOpenFile} onSaved={onSaved} />
              </Frame>
            )}
          </Frame>
        )
      })}
    </Frame>
  )
}
