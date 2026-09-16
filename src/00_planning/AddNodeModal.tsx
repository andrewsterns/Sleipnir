import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Card } from '../app/UIKit/Card/Card'
import { Button } from '../app/UIKit/Button/Button'
import { Text } from '../app/UIKit/Text/Text'
import { Dropdown } from '../app/UIKit/Dropdown/Dropdown'
import { ADD_NODE_LANGUAGES, LANGUAGES, ROLE_OPTIONS, type LanguageId } from './graph/architectures'
import { useAddNodeViewModel, resolveDraft, draftFileNames, roleCount, type AddNodeModalProps } from './AddNodeModal.ViewModel'
import { fuzzyScore } from '../utils/fuzzyMatch'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const FOLDER_SUGGEST_LIMIT = 8

// Typeable target-folder field: still free text (scaffolding a brand-new
// feature is the common case), but fuzzy-suggests folders that already exist
// in the open Workspace — picking one is what lets a later scaffold land
// beside earlier siblings and auto-link to them (see AddNodeModal.ViewModel's
// cross-batch linking). A live preview shows the real resolved destination
// (workspace root name + folder) so there's no guessing where files end up.
function TargetFolderField({
  value,
  onChange,
  effectiveFolder,
  folders,
  workspaceName,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  effectiveFolder: string
  folders: string[]
  workspaceName: string | null
  disabled?: boolean
}) {
  const [focused, setFocused] = useState(false)

  const results = useMemo(() => {
    const trimmed = value.trim()
    if (!trimmed) return folders.slice(0, FOLDER_SUGGEST_LIMIT)
    return folders
      .map((f) => ({ f, score: fuzzyScore(trimmed, f) }))
      .filter((r): r is { f: string; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, FOLDER_SUGGEST_LIMIT)
      .map((r) => r.f)
  }, [value, folders])

  return (
    <Frame flow="vertical" gap={4}>
      <Text variant="xs" weight="black" color="text-2">Target Folder</Text>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={effectiveFolder}
        disabled={disabled}
        style={INPUT_STYLE}
      />
      {focused && results.length > 0 && (
        <Frame flow="vertical" gap={0} radius="var(--radius-control)" stroke={{ color: 'border-1' }} clipContent>
          {results.map((f) => (
            <Frame
              as="button"
              key={f}
              // mousedown + preventDefault beats the input's onBlur, so the
              // pick lands before the list unmounts.
              onMouseDown={(e) => { e.preventDefault(); onChange(f); setFocused(false) }}
              w="fill"
              flow="horizontal"
              align="center"
              padding={{ x: 8, y: 6 }}
              hoverFill="bg-3"
              fill={{ solid: 'transparent' }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-1)', ...MONO }}>{f}</span>
            </Frame>
          ))}
        </Frame>
      )}
      <span style={{ fontSize: 10, color: 'var(--text-3)', wordBreak: 'break-all', ...MONO }}>
        → {(workspaceName || 'workspace')}/{effectiveFolder}/
      </span>
    </Frame>
  )
}

// Shared by a role chip's two halves (label toggle + "+").
const CHIP_BUTTON: React.CSSProperties = {
  fontSize: 10,
  lineHeight: 1,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: '7px 9px',
  ...MONO,
}

// The one Planning node-creation modal: any number of name rows ("+ Create
// New"), each creating its own file plus a child file per checked role, all
// auto-linked with no architecture to pick (see AddNodeModal.ViewModel).
//
// Same portal-to-nearest-theme-scope pattern as DeletePlanModal, and the same
// reusable Card surface every modal in this app now uses — a plain rounded
// surface (var(--radius-control)) matching the right-click Dropdown's visual
// language, so this modal reads as one consistent control alongside the two
// Dropdowns inside it.
export function AddNodeModal(props: AddNodeModalProps) {
  const vm = useAddNodeViewModel(props)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    let node: HTMLElement | null = anchorRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
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
          <Card
            flow="vertical"
            gap={14}
            padding={20}
            relative
            w={440}
            maxH="80vh"
            scroll="y"
          >
            <Text variant="xs" weight="black" color="text-2">Add Nodes</Text>

            <Frame flow="vertical" gap={8}>
              {vm.drafts.map((d, i) => {
                const { language, architectural } = resolveDraft(d)
                const isActive = d.id === vm.activeId
                const files = draftFileNames(d)
                return (
                  <Frame
                    key={d.id}
                    flow="vertical"
                    gap={6}
                    padding={8}
                    radius="var(--radius-control)"
                    stroke={{ color: isActive ? 'border-2' : 'border-1' }}
                    onMouseDown={() => vm.setActiveId(d.id)}
                  >
                    {/* Name (a typed extension overrides the dropdown) · language · × */}
                    <Frame flow="horizontal" align="center" gap={6}>
                      <input
                        autoFocus={i === vm.drafts.length - 1}
                        value={d.name}
                        onChange={(e) => vm.updateDraft(d.id, { name: e.target.value })}
                        onFocus={() => vm.setActiveId(d.id)}
                        onBlur={() => vm.normalizeName(d.id)}
                        placeholder="Name or Name.tsx"
                        disabled={vm.submitting}
                        style={{ ...INPUT_STYLE, flex: 1, minWidth: 0 }}
                      />
                      <Frame w={120} shrink={0}>
                        <Dropdown
                          options={ADD_NODE_LANGUAGES.map((id) => ({ value: id, label: LANGUAGES.find((l) => l.id === id)?.label ?? id }))}
                          value={language}
                          // Picking a language drops any typed extension so the two never disagree.
                          onChange={(v) => vm.updateDraft(d.id, { language: v as LanguageId, name: resolveDraft(d).base })}
                          w="fill"
                        />
                      </Frame>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => vm.removeDraft(d.id)}
                        disabled={vm.submitting || vm.drafts.length <= 1}
                        title="Remove"
                      >
                        ×
                      </Button>
                    </Frame>

                    {/* Per-node description — part of the card, set off by a divider rather than its own box. */}
                    <div style={{ height: 1, background: 'var(--border-1)' }} />
                    <textarea
                      value={d.description}
                      onChange={(e) => vm.updateDraft(d.id, { description: e.target.value })}
                      onFocus={() => vm.setActiveId(d.id)}
                      placeholder="Description (optional)"
                      rows={2}
                      disabled={vm.submitting}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        resize: 'vertical',
                        color: 'var(--text-1)',
                        fontSize: 12,
                        padding: '2px 2px',
                        ...MONO,
                      }}
                    />

                    {/* Role checkboxes — only on the row being edited; html/css have no roles. */}
                    {isActive && architectural && (
                      <Frame flow="horizontal" wrap="wrap" gap={4}>
                        {/* Toggle chips — outlined when off, filled when on. */}
                        {ROLE_OPTIONS.map((role) => {
                          const checked = d.roles.includes(role.id)
                          return (
                            // Chip = label (toggle on/off) + "+" (add another numbered copy).
                            <span
                              key={role.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'stretch',
                                borderRadius: 999,
                                border: `1px solid ${checked ? 'var(--text-2)' : 'var(--border-2)'}`,
                                background: checked ? 'rgba(var(--item-ink, 255,255,255), 0.14)' : 'transparent',
                                overflow: 'hidden',
                              }}
                            >
                              <button
                                type="button"
                                aria-pressed={checked}
                                onClick={() => vm.toggleRole(d.id, role.id)}
                                disabled={vm.submitting}
                                title={checked ? `Remove ${role.label}` : `Add ${role.label}`}
                                style={{ ...CHIP_BUTTON, padding: '4px 4px 4px 8px', color: checked ? 'var(--text-1)' : 'var(--text-3)' }}
                              >
                                {role.label}
                                {roleCount(d, role.id) > 1 && <span style={{ color: 'var(--text-3)' }}> ×{roleCount(d, role.id)}</span>}
                              </button>
                              <button
                                type="button"
                                onClick={() => vm.addRoleCopy(d.id, role.id)}
                                disabled={vm.submitting}
                                title={checked ? `Add another ${role.label} copy` : `Add ${role.label}`}
                                style={{ ...CHIP_BUTTON, padding: '4px 7px 4px 4px', color: 'var(--text-3)' }}
                              >
                                +
                              </button>
                            </span>
                          )
                        })}
                      </Frame>
                    )}

                    {/* Live list of every file this card creates, updating as you
                        type — the row's own file first (not removable), then each
                        role copy with its own ×. */}
                    {files.map((f) => (
                      <Frame key={`${f.role ?? 'main'}-${f.copy}`} flow="horizontal" align="center" justify="between" gap={6} padding={{ left: 10 }} minH={22}>
                        <span style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...MONO }}>
                          ↳ {f.fileName}
                        </span>
                        {f.role && (
                          <Button variant="ghost" size="sm" onClick={() => vm.removeRoleCopy(d.id, f.role!)} disabled={vm.submitting} title="Remove">
                            ×
                          </Button>
                        )}
                      </Frame>
                    ))}
                  </Frame>
                )
              })}

              <Frame>
                <Button variant="ghost" size="sm" onClick={vm.addDraft} disabled={vm.submitting}>
                  + Create New
                </Button>
              </Frame>
            </Frame>

            <TargetFolderField
              value={vm.targetFolder}
              onChange={vm.setTargetFolder}
              effectiveFolder={vm.effectiveFolder}
              folders={vm.existingFolders}
              workspaceName={vm.workspaceName}
              disabled={vm.submitting}
            />

            {vm.error && (
              <span style={{ fontSize: 11, color: '#e07a7a', ...MONO }}>{vm.error}</span>
            )}

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={vm.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={vm.submit} disabled={vm.submitting || !vm.canSubmit}>
                {vm.submitting ? 'Creating…' : 'Create'}
              </Button>
            </Frame>
          </Card>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
