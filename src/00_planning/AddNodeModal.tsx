import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Button } from '../app/UIKit/Button/Button'
import { Text } from '../app/UIKit/Text/Text'
import { Dropdown } from '../app/UIKit/Dropdown/Dropdown'
import { ARCHITECTURES, LANGUAGES } from './graph/architectures'
import { useAddNodeViewModel, type AddNodeModalProps } from './AddNodeModal.ViewModel'
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
        <Frame flow="vertical" gap={0} radius="var(--radius-2)" stroke={{ color: 'border-1' }} clipContent>
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

const INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 'var(--radius-2)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: '7px 9px',
  ...MONO,
}

// The one Planning node-creation modal — replaces what used to be two
// separate entry points (a plain "New Node" inline form plus a second
// "Scaffold Files…" modal). Leaving every File Types checkbox unchecked
// creates a bare note, same as the old quick-note form; checking any creates
// real, linked files (see AddNodeModal.ViewModel's submit for the branch).
//
// Same portal-to-nearest-theme-scope pattern as DeletePlanModal, but built
// directly on Frame + radius (matching Dropdown's own rounded visual
// language) rather than TacticalPanel/chamfer — chamfer and radius are
// mutually exclusive on Frame, and this modal is meant to read as one
// consistent control alongside the two Dropdowns inside it, not the angular
// chamfer look every other modal in this app uses.
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
          <Frame
            flow="vertical"
            gap={14}
            padding={20}
            variant="surface"
            radius="var(--radius-3)"
            relative
            w={440}
            maxH="80vh"
            scroll="y"
            effects={{ 'drop-shadow': { x: 0, y: 8, blur: 24, spread: 0, color: 'rgba(0,0,0,0.06)' } }}
          >
            <Text variant="xs" weight="black" color="text-2">Add Node</Text>

            <input
              autoFocus
              value={vm.label}
              onChange={(e) => vm.setLabel(e.target.value)}
              placeholder="Name (e.g. ShoppingCart)"
              disabled={vm.submitting}
              style={INPUT_STYLE}
            />

            <textarea
              value={vm.description}
              onChange={(e) => vm.setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              disabled={vm.submitting}
              style={{ ...INPUT_STYLE, resize: 'vertical' }}
            />

            {vm.architectural && (
              <Dropdown
                label="Architecture"
                options={ARCHITECTURES.map((a) => ({ value: a.id, label: a.label }))}
                value={vm.architecture}
                onChange={(v) => vm.setArchitecture(v as typeof vm.architecture)}
                w="fill"
              />
            )}

            <Dropdown
              label="Language"
              options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
              value={vm.language}
              onChange={(v) => vm.setLanguage(v as typeof vm.language)}
              w="fill"
            />

            {vm.architectural ? (
              <Frame flow="vertical" gap={0}>
                <Frame flow="horizontal" align="center" justify="between">
                  <Text variant="xs" weight="black" color="text-2">File Types</Text>
                  <Text variant="xs" color="text-3">optional — none = plain note</Text>
                </Frame>
                <Frame flow="vertical" gap={0} padding={{ top: 6 }} radius="var(--radius-2)" stroke={{ color: 'border-1' }} clipContent>
                  {vm.roles.map((role) => {
                    const checked = vm.checkedRoles.has(role.id)
                    return (
                      <Frame
                        as="button"
                        key={role.id}
                        onClick={() => vm.toggleRole(role.id)}
                        w="fill"
                        flow="horizontal"
                        align="center"
                        gap={8}
                        padding={{ x: 12, y: 8 }}
                        stroke={{ bottom: { color: 'border-1' } }}
                        hoverFill="bg-3"
                        fill={{ solid: 'transparent' }}
                      >
                        <span>{checked ? '☑' : '☐'}</span>
                        <Text variant="small" weight="bold" italic transform="uppercase" tracking="tighter" color="text-1" align="left">
                          {role.label}
                        </Text>
                      </Frame>
                    )
                  })}
                </Frame>
              </Frame>
            ) : (
              // html/css: no architecture, no roles — just one file.
              <Text variant="xs" color="text-3">Single file — no architecture.</Text>
            )}

            {(vm.checkedRoles.size > 0 || !vm.architectural) && (
              <TargetFolderField
                value={vm.targetFolder}
                onChange={vm.setTargetFolder}
                effectiveFolder={vm.effectiveFolder}
                folders={vm.existingFolders}
                workspaceName={vm.workspaceName}
                disabled={vm.submitting}
              />
            )}

            {vm.error && (
              <span style={{ fontSize: 11, color: '#e07a7a', ...MONO }}>{vm.error}</span>
            )}

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={vm.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={vm.submit} disabled={vm.submitting || !vm.label.trim()}>
                {vm.submitting ? 'Creating…' : 'Create'}
              </Button>
            </Frame>
          </Frame>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
