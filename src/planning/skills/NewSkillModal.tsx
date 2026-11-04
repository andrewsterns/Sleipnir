import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { Button } from '../../app/UIKit/Button/Button'
import { Card } from '../../app/UIKit/Card/Card'
import { Checkbox } from '../../app/UIKit/Checkbox/Checkbox'
import { TextArea, TextField } from '../../app/UIKit/Field/TextField'
import { SKILL_AGENTS, useNewSkillModalViewModel, type NewSkillModalProps } from './NewSkillModal.ViewModel'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }
const LABEL: React.CSSProperties = { fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }

// Same portal-to-the-nearest-theme-scope pattern as the planning modals.
export function NewSkillModal(props: NewSkillModalProps) {
  const vm = useNewSkillModalViewModel(props)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    let node: HTMLElement | null = anchorRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) node = node.parentElement
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
          <Card flow="vertical" gap={14} padding={20} relative w={520}>
            <span style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-1)', fontWeight: 600, ...UI_FONT }}>New skill</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
              A command your agents can run, like /plan. Sleipnir writes it for each agent you pick, in that agent&apos;s own format.
            </span>

            <Frame flow="vertical" gap={4}>
              <span style={LABEL}>Name</span>
              <TextField value={vm.name} onChange={(e) => vm.setName(e.target.value)} placeholder="review" autoFocus />
            </Frame>
            <Frame flow="vertical" gap={4}>
              <span style={LABEL}>What IT&apos;S for</span>
              <TextField value={vm.description} onChange={(e) => vm.setDescription(e.target.value)} placeholder="Review the current diff for bugs before committing" />
            </Frame>
            <Frame flow="vertical" gap={4}>
              <span style={LABEL}>Instructions</span>
              <TextArea
                value={vm.instructions}
                onChange={(e) => vm.setInstructions(e.target.value)}
                rows={10}
                placeholder={'What the agent should do. Write {{ARGS}} where the words typed after the command go.'}
                style={{ width: '100%', fontSize: 11, lineHeight: 1.5, ...UI_FONT }}
              />
            </Frame>
            <Frame flow="vertical" gap={6}>
              <span style={LABEL}>Agents</span>
              <Frame flow="horizontal" gap={16}>
                {SKILL_AGENTS.map((a) => (
                  <label key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
                    <Checkbox checked={vm.agents.includes(a.id)} onChange={() => vm.toggleAgent(a.id)} />
                    {a.label}
                  </label>
                ))}
              </Frame>
            </Frame>

            {vm.error && <span style={{ fontSize: 11, color: '#e07a7a', ...UI_FONT }}>{vm.error}</span>}
            <Frame flow="horizontal" gap={8} justify="end">
              <Button variant="ghost" size="sm" onClick={vm.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={vm.submit} disabled={!vm.canSubmit}>
                {vm.submitting ? 'Writing…' : 'Create skill'}
              </Button>
            </Frame>
          </Card>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
