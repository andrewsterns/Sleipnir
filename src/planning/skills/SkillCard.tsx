import { Frame } from '../../app/UIKit/Frame/Frame'
import { Button } from '../../app/UIKit/Button/Button'
import { TextArea } from '../../app/UIKit/Field/TextField'
import { AGENT_LABEL } from '../graph/skillGraph'
import { useSkillCardViewModel, type SkillCardProps } from './SkillCard.ViewModel'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }
const LABEL: React.CSSProperties = { fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }
const META: React.CSSProperties = { fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }
const LINK: React.CSSProperties = { color: 'var(--info-5)', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }

export function SkillCard(props: SkillCardProps) {
  const vm = useSkillCardViewModel(props)
  const { skill, onOpenFile } = props
  return (
    <Frame flow="vertical" gap={14}>
      <span style={META}>{skill.builtin ? "Sleipnir's skill" : 'Your skill'}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', ...UI_FONT }}>/{skill.id}</span>
      {skill.description && <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>{skill.description}</span>}
      <span style={META}>
        About {skill.tokens} tokens when used
        {skill.drives.length > 0 && ` · runs ${skill.drives.map((d) => `${d}.mjs`).join(', ')}`}
        {skill.writes.length > 0 && ` · writes ${skill.writes.join(', ')}`}
      </span>

      <Frame flow="vertical" gap={4}>
        <span style={LABEL}>Agents</span>
        {skill.agents.map((a) => (
          <span key={`${a.agent}:${a.file ?? ''}`} style={{ fontSize: 11, color: 'var(--text-2)', ...UI_FONT }}>
            {AGENT_LABEL[a.agent]}
            {a.file ? (
              <>
                {' · '}
                <span style={onOpenFile ? LINK : undefined} onClick={onOpenFile ? () => onOpenFile(a.file!) : undefined} title={a.file}>
                  {a.file.split('/').pop()}
                </span>
              </>
            ) : (
              ' · built in'
            )}
          </span>
        ))}
      </Frame>

      <Frame flow="vertical" gap={6}>
        <span style={LABEL}>Instructions</span>
        {vm.loaded?.builtin && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {vm.loaded.overridden
              ? `Your project's version (${vm.loaded.file}), used for every agent.`
              : 'Sleipnir’s own. Saving keeps your version in .sleipnir/skills and writes it for every agent; updates won’t overwrite it.'}
          </span>
        )}
        {!vm.loaded && !vm.error && <span style={META}>Loading…</span>}
        {vm.loaded && (
          <TextArea
            value={vm.draft}
            onChange={(e) => vm.setDraft(e.target.value)}
            spellCheck={false}
            rows={14}
            style={{ width: '100%', minHeight: 220, fontSize: 11, lineHeight: 1.5, ...UI_FONT }}
          />
        )}
        {vm.error && <span style={{ fontSize: 11, color: '#e07a7a', ...UI_FONT }}>{vm.error}</span>}
        {vm.savedNote && <span style={META}>{vm.savedNote}</span>}
        <Frame flow="horizontal" gap={6}>
          <Button variant="primary" size="sm" onClick={vm.save} disabled={!vm.dirty || vm.saving}>
            {vm.saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" size="sm" onClick={vm.revert} disabled={!vm.dirty || vm.saving}>
            Revert
          </Button>
        </Frame>
      </Frame>
    </Frame>
  )
}
