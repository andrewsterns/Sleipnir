import React, { useEffect, useState } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Icon, type IconName } from '../app/UIKit/Icon/Icon'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { ScrollWindow } from '../app/UIKit/ScrollWindow/ScrollWindow'
import { WorkspaceHeader } from '../app/WorkspaceHeader/WorkspaceHeader'
import { GraphCanvas } from './graph/GraphCanvas'
import { getGraphForMap } from './graph/combine'
import { getGraphMaps, LIBRARIES, type GraphMapId, type GraphNode, type SavedPlan, type ScaffoldLanguage } from './graph/types'
import { toGraphNodeId } from './graph/resolvePlan'
import { SleipnirLoader } from '../app/UIKit/SleipnirLoader/SleipnirLoader'
import type { GeneratedFile } from '../app/AgentChat/iAgentChat'
import {
  scaffoldComponent,
  regenerateGraph,
  removeLibrary,
  type ComponentTier,
  type ScaffoldPart,
  type ScaffoldComponentResult,
} from './api/sleipnirApi'
import { usePlanningViewModel, folderPathForNode, type PlanningNodeRow } from './PlanningView.ViewModel'
import { Search } from '../app/UIKit/Search/Search'
import { RefactorPanel } from '../app/RefactorPanel/RefactorPanel'
import { Dropdown } from '../app/UIKit/Dropdown/Dropdown'
import { DeleteLibraryModal } from './DeleteLibraryModal'
import { SCAFFOLD_LANGUAGES } from './scaffoldOptions'
import { CreateLibraryModal } from './CreateLibraryModal'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const COMPONENT_TIERS: { id: ComponentTier; label: string }[] = [
  { id: 'atoms', label: 'Atom' },
  { id: 'molecules', label: 'Molecule' },
  { id: 'organisms', label: 'Organism' },
  { id: 'templates', label: 'Template' },
  { id: 'pages', label: 'Page' },
]

const KIND_FILTER_OPTIONS = [
  { id: 'built', label: 'Built' },
  { id: 'proposed', label: 'Proposed' },
]

// Picks the "primary" file to auto-select after a (possibly partial) MVVM
// scaffold — View wins if present, then ViewModel, then Interface. Falls
// back to the single file for a non-mvvm (prototype) scaffold.
function idForScaffoldedFile(files: string[], name: string): string | null {
  const baseName = (f: string) => (f.split('/').pop() ?? '').replace(/\.[^./]+$/, '')
  const view = files.find((f) => baseName(f) === name)
  if (view) return toGraphNodeId(view)
  const viewModel = files.find((f) => baseName(f) === `${name}ViewModel`)
  if (viewModel) return toGraphNodeId(viewModel)
  const iface = files.find((f) => baseName(f) === `i${name}`)
  if (iface) return toGraphNodeId(iface)
  if (files.length === 1) return toGraphNodeId(files[0])
  return null
}

function NewComponentForm({
  onCreated,
  createNote,
}: {
  onCreated: (id: string) => void
  createNote: (label: string, description: string) => Promise<string>
}) {
  const [open, setOpen] = useState(false)
  const [wantsNote, setWantsNote] = useState(false)
  const [wantsView, setWantsView] = useState(true)
  const [wantsViewModel, setWantsViewModel] = useState(true)
  const [wantsInterface, setWantsInterface] = useState(true)
  const [wantsPrototype, setWantsPrototype] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tier, setTier] = useState<ComponentTier>('atoms')
  const [language, setLanguage] = useState<ScaffoldLanguage>('typescript')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isTypescript = language === 'typescript'
  const parts: ScaffoldPart[] = [
    ...(wantsView ? (['view'] as const) : []),
    ...(wantsViewModel ? (['viewModel'] as const) : []),
    ...(wantsInterface ? (['interface'] as const) : []),
  ]
  const scaffoldingComponent = isTypescript && parts.length > 0
  const scaffoldingPrototype = !isTypescript && wantsPrototype
  const nothingSelected = !wantsNote && !scaffoldingComponent && !scaffoldingPrototype

  const reset = () => {
    setOpen(false)
    setName('')
    setDescription('')
    setError(null)
  }

  const handleCreate = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const noteId = wantsNote ? await createNote(name, description) : null

      let scaffoldResult: ScaffoldComponentResult | null = null
      if (scaffoldingComponent) {
        scaffoldResult = await scaffoldComponent(name, tier, language, parts)
      } else if (scaffoldingPrototype) {
        scaffoldResult = await scaffoldComponent(name, tier, language)
      }
      if (scaffoldResult) await regenerateGraph()

      const primaryId = scaffoldResult ? idForScaffoldedFile(scaffoldResult.files, name) : null
      reset()
      const idToSelect = primaryId ?? noteId
      if (idToSelect) onCreated(idToSelect)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <IconButton
        onClick={() => setOpen(true)}
        title="New component"
        icon="plan-node-add"
        iconSize={13}
        textColor="var(--text-2)"
      />
    )
  }

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    color: active ? 'var(--text-1)' : 'var(--text-3)',
    fontSize: 12,
    letterSpacing: '0.02em',
    padding: '6px 10px',
    cursor: 'pointer',
    ...MONO,
  })

  return (
    <Frame flow="vertical" gap={6} padding={{ top: 4 }}>
      <Frame flow="horizontal" gap={4} wrap="wrap">
        <button type="button" onClick={() => setWantsNote((v) => !v)} style={toggleStyle(wantsNote)}>
          Node / Idea
        </button>
        {isTypescript ? (
          <>
            <button type="button" onClick={() => setWantsView((v) => !v)} style={toggleStyle(wantsView)}>
              View
            </button>
            <button type="button" onClick={() => setWantsViewModel((v) => !v)} style={toggleStyle(wantsViewModel)}>
              ViewModel
            </button>
            <button type="button" onClick={() => setWantsInterface((v) => !v)} style={toggleStyle(wantsInterface)}>
              Interface
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setWantsPrototype((v) => !v)} style={toggleStyle(wantsPrototype)}>
            Prototype file
          </button>
        )}
      </Frame>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={wantsNote && !scaffoldingComponent && !scaffoldingPrototype ? 'Note title' : 'ComponentName'}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'var(--text-1)',
          fontSize: 12,
          padding: '7px 9px',
          ...MONO,
        }}
      />
      {wantsNote && (
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={3}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'var(--text-1)',
            fontSize: 12,
            padding: '7px 9px',
            resize: 'vertical',
            ...MONO,
          }}
        />
      )}
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as ScaffoldLanguage)}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'var(--text-1)',
          fontSize: 12,
          padding: '7px 9px',
          ...MONO,
        }}
      >
        {SCAFFOLD_LANGUAGES.map((l) => (
          <option key={l.id} value={l.id}>{l.label}</option>
        ))}
      </select>
      {isTypescript && (
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as ComponentTier)}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'var(--text-1)',
            fontSize: 12,
            padding: '7px 9px',
            ...MONO,
          }}
        >
          {COMPONENT_TIERS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      )}
      <Frame flow="horizontal" gap={6}>
        <button
          onClick={handleCreate}
          disabled={submitting || !name || nothingSelected}
          style={{
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'var(--text-1)',
            fontSize: 12,
            padding: '7px 12px',
            cursor: submitting ? 'default' : 'pointer',
            opacity: submitting || !name || nothingSelected ? 0.5 : 1,
            ...MONO,
          }}
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
        <button
          onClick={reset}
          disabled={submitting}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-3)',
            fontSize: 12,
            padding: '7px 12px',
            cursor: 'pointer',
            ...MONO,
          }}
        >
          Cancel
        </button>
      </Frame>
      {error && (
        <span style={{ fontSize: 11, color: '#e07a7a', ...MONO }}>{error}</span>
      )}
    </Frame>
  )
}

function NodeList({ title, nodes }: { title: string; nodes: GraphNode[] }) {
  return (
    <Frame flow="vertical" gap={6}>
      <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
        {title.toUpperCase()} ({nodes.length})
      </span>
      <Frame flow="vertical" gap={4}>
        {nodes.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-3)', ...MONO }}>— none —</span>
        )}
        {nodes.map((n) => (
          <span key={n.id} style={{ fontSize: 12, color: 'var(--text-2)', ...MONO }}>
            · {n.label}
          </span>
        ))}
      </Frame>
    </Frame>
  )
}

// One row in the left "PLANS" list — every registered map (Welcome, each
// library, the fixed workspace maps), always present regardless of whether
// it's currently open as a tab. Mirrors the hover-reveals-an-action pattern
// LeftRailing uses for Components/Prototypes, just with "close the tab"
// instead of "archive the file" behind the ×.
function PlanRow({
  map,
  active,
  open,
  onOpen,
  onClose,
  icon,
}: {
  map: { id: string; label: string }
  active: boolean
  open: boolean
  onOpen: () => void
  onClose: () => void
  /** Prefixed before the label — used only by the Saved Plans group to visually distinguish those rows from Components/Prototypes/Workspace, which render no icon (undefined here preserves their exact existing look). */
  icon?: IconName
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', minHeight: 28, flexShrink: 0 }}
    >
      {icon && (
        <span style={{ display: 'flex', color: 'var(--text-3)', marginRight: 5, flexShrink: 0 }}>
          <Icon name={icon} size={12} />
        </span>
      )}
      <span
        onClick={onOpen}
        style={{
          fontSize: 12,
          lineHeight: '28px',
          letterSpacing: '0.02em',
          color: active ? 'var(--text-1)' : 'var(--text-2)',
          fontWeight: active ? 700 : 400,
          opacity: active ? 1 : 0.85,
          cursor: 'pointer',
          flex: 1,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          ...MONO,
        }}
      >
        {map.label}
      </span>
      {open && hovered && (
        <IconButton
          onClick={(e) => { e.stopPropagation(); onClose() }}
          title="Close tab"
          glyph="×"
          iconSize={14}
          textColor="var(--text-3)"
        />
      )}
    </div>
  )
}

// A group of PlanRows under a small uppercase header — used to split the
// PLANS list into Components / Prototypes / Workspace, the same grouping
// vocabulary the rest of the app already uses for library kinds.
function PlanGroup({
  title,
  maps,
  mapId,
  openMapIds,
  onOpen,
  onClose,
  icon,
}: {
  title: string
  maps: { id: string; label: string }[]
  mapId: string
  openMapIds: string[]
  onOpen: (id: string) => void
  onClose: (id: string) => void
  icon?: IconName
}) {
  if (maps.length === 0) return null
  return (
    <Frame flow="vertical" gap={0} shrink={0} padding={{ top: 8 }}>
      <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', marginBottom: 2, ...MONO }}>
        {title.toUpperCase()}
      </span>
      {maps.map((m) => (
        <PlanRow
          key={m.id}
          map={m}
          active={m.id === mapId}
          open={openMapIds.includes(m.id)}
          onOpen={() => onOpen(m.id)}
          onClose={() => onClose(m.id)}
          icon={icon}
        />
      ))}
    </Frame>
  )
}

// Which PLANS section a map belongs in — mirrors LIBRARIES' own `kind`
// field for registered libraries. The fixed non-library maps
// (research/validation/todo/claude/open) fall into 'other' — never actually
// rendered as its own PlanGroup (only 'component'/'prototype' are), so this
// branch is just a total-function fallback. Named 'other', not 'workspace',
// so it doesn't collide in terminology with the real, user-facing Workspace
// NAV_ITEMS category (ROADMAP.md's Phase 0 — open-an-external-folder).
function groupForMap(id: GraphMapId): 'component' | 'prototype' | 'other' {
  const lib = LIBRARIES.find((l) => l.id === id)
  if (lib) return lib.kind
  return 'other'
}

export interface PlanningViewProps {
  /** Jump to this component's file in the Component Library tab. */
  onJumpToComponent?: (node: GraphNode) => void
  /** Jump to this opened-file node's tab in the editor (see the "open" map / src/app/OpenEditors/). */
  onJumpToOpenFile?: (node: GraphNode) => void
  /** Set by App.tsx to force a specific map tab open (e.g. 'claude', to watch Claude build nodes live) even when Planning is already mounted. Consumed once. */
  focusMapId?: GraphMapId | null
  onFocusMapIdConsumed?: () => void
  /**
   * Bumped by App.tsx (a nonce, not a boolean, so a second request while
   * Planning is already mounted still re-triggers) when the AI chat's
   * `/plan` command fires — opens the same Create Library modal the "+ New
   * Library" button does. Same "force it open even if already mounted"
   * pattern as focusMapId/onFocusMapIdConsumed below.
   */
  createLibraryRequestId?: number
  onCreateLibraryRequestConsumed?: () => void
  /** Fired once the generate_code tool stages files for an approved plan node — the host app opens them in the Code Editor for review. */
  onCodeGenerated?: (planNodeId: string, files: GeneratedFile[]) => void
  /** Owned by App.tsx (fetched once, appended to locally on create) — see its `plans` state doc comment. */
  plans: SavedPlan[]
  onDeletePlan: (id: string) => void
}

const COMPONENT_LIBRARY_ROOTS = LIBRARIES.filter((lib) => lib.kind === 'component').map((lib) => lib.root)

// A "component" node is anything that lives under a registered component
// library's root — as opposed to a prototype file or a filepath-less note/idea.
function isComponentNode(node: GraphNode): boolean {
  const path = node.filePath?.replace(/^src\//, '') ?? ''
  return COMPONENT_LIBRARY_ROOTS.some((root) => path.startsWith(`${root}/`))
}

function isComponentLibraryMap(mapId: GraphMapId): boolean {
  return LIBRARIES.some((lib) => lib.id === mapId && lib.kind === 'component')
}

// The one seeded-at-creation library can't be removed (see
// tools/sleipnir-backend.mjs#assertRemovable) — everything else registered
// via "+ New Library" can be.
const PROTECTED_LIBRARY_IDS = new Set(['dsm'])
function removableLibraryFor(mapId: GraphMapId) {
  return LIBRARIES.find((lib) => lib.id === mapId && !PROTECTED_LIBRARY_IDS.has(lib.id))
}

export const PlanningView: React.FC<PlanningViewProps> = ({
  onJumpToComponent,
  onJumpToOpenFile,
  focusMapId,
  onFocusMapIdConsumed,
  createLibraryRequestId,
  onCreateLibraryRequestConsumed,
  onCodeGenerated,
  plans,
  onDeletePlan,
}) => {
  const removablePlanFor = (mapId: GraphMapId) => plans.find((p) => p.id === mapId)
  const {
    mapId,
    setMapId,
    openMapIds,
    openMap,
    closeMap,
    switchToMap,
    selectedId,
    setSelectedId,
    live,
    archivedEntries,
    hoveredId,
    setHoveredId,
    refreshAll,
    createNote,
    setPlanNodeStatus,
    archiveNode,
    restoreEntry,
    selectedNode,
    borrowsFrom,
    borrowedBy,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    nodeRows,
    isGlobalSearch,
  } = usePlanningViewModel('welcome', focusMapId, onFocusMapIdConsumed, plans)

  const [isCreatingLibrary, setIsCreatingLibrary] = useState(false)
  const [deletingLibrary, setDeletingLibrary] = useState<(typeof LIBRARIES)[number] | null>(null)
  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  useEffect(() => {
    if (!createLibraryRequestId) return
    setIsCreatingLibrary(true)
    onCreateLibraryRequestConsumed?.()
  }, [createLibraryRequestId, onCreateLibraryRequestConsumed])

  // Reversible — just unregisters, files stay on disk — so a lightweight
  // native confirm is enough friction. Deleting is the one irreversible
  // library action and gets the real type-to-confirm modal instead.
  const handleRemoveLibrary = async (lib: (typeof LIBRARIES)[number]) => {
    if (!window.confirm(`Remove "${lib.label}" from Planning? Its files stay on disk — you can re-add it later.`)) return
    await removeLibrary(lib.id)
    setMapId('dsm')
  }

  // Shared routing decision — extracted so the NODES search's cross-map
  // quick-jump (selectNodeRow, below) doesn't have to duplicate it.
  const routeToNode = (node: GraphNode) => {
    if (node.type === 'opened-file') onJumpToOpenFile?.(node)
    else if (isComponentNode(node)) onJumpToComponent?.(node)
  }

  const handleActivateNode = (id: string) => {
    const node = live.nodes.find((n) => n.id === id)
    if (!node) return
    routeToNode(node)
  }

  // The NODES search box's cross-map quick-jump (ROADMAP.md's Phase 1
  // follow-up) — takes the already-known GraphNode straight from the
  // aggregate (usePlanningViewModel's nodeRows) rather than re-looking it up
  // in `live.nodes`, since switchToMap's data refetch is async and wouldn't
  // be visible on this same tick. Mirrors the existing fire-and-forget
  // switchToMap(...).catch(() => {}) pattern already used elsewhere in this
  // file (CreateLibraryModal's onCreated).
  const selectNodeRow = (row: PlanningNodeRow) => {
    if (row.mapId !== mapId) switchToMap(row.mapId).catch(() => {})
    setSelectedId(row.node.id)
    routeToNode(row.node)
  }

  // Headless — doesn't touch the visible AgentChat conversation at all, just
  // a one-off chat session dedicated to this single generate_code request.
  // The SleipnirLoader in the detail panel below is the only "it's working"
  // signal, same role the chat panel's own loader plays for a live chat turn.
  const generateCode = (node: GraphNode) => {
    const api = window.chatAPI
    if (!api) {
      setGenerateError('AI chat is desktop-only — run the Electron app.')
      return
    }
    setGenerateError(null)
    setGeneratingNodeId(node.id)
    const sessionId = crypto.randomUUID()

    // Loosely match the plan step's label against the DSM graph so the
    // model has a real shot at editing the actual existing file (e.g.
    // "Change Button Component Color to Red" -> src/.../Button/Button.tsx)
    // instead of guessing a path or scaffolding a duplicate component.
    const nameGuess = node.label.replace(/\s+component$/i, '').trim()
    const candidates = getGraphForMap('dsm')
      .nodes.filter((n) => n.filePath && nameGuess && n.label.toLowerCase().includes(nameGuess.toLowerCase()))
      .slice(0, 5)
      .map((n) => n.filePath)

    const prompt = [
      'Generate code for this approved plan step using the generate_code tool.',
      `Label: ${node.label}`,
      node.description ? `Description: ${node.description}` : null,
      candidates.length
        ? `Likely existing file(s) this refers to — edit one via existing_path if it matches: ${candidates.join(', ')}`
        : 'No obviously matching existing file was found. If this is a new component, scaffold it via component_name/tier/parts.',
    ].filter(Boolean).join('\n')

    let settled = false
    const cleanup = () => {
      settled = true
      unsubCode()
      unsubDone()
      unsubError()
    }
    const unsubCode = api.onCodeGenerated(sessionId, (payload) => {
      cleanup()
      setGeneratingNodeId(null)
      onCodeGenerated?.(node.id, payload.files)
    })
    const unsubDone = api.onDone(sessionId, () => {
      if (settled) return
      cleanup()
      setGeneratingNodeId(null)
      setGenerateError("Claude responded without generating code — try again, or rephrase the plan step's description.")
    })
    const unsubError = api.onError(sessionId, (message) => {
      cleanup()
      setGeneratingNodeId(null)
      setGenerateError(message)
    })

    api.sendMessage(sessionId, [], prompt)
  }

  const allMaps = getGraphMaps()
  // Saved plans are never in getGraphMaps() (see App.tsx's plans state doc
  // comment) — kept out of `allMaps` itself since componentMaps/prototypeMaps
  // below both derive from it via groupForMap. Used only for resolving an
  // open tab's label/icon.
  const allMapsWithPlans = [...allMaps, ...plans]
  const openTabs = openMapIds
    .map((id) => allMapsWithPlans.find((m) => m.id === id))
    .filter((m): m is { id: string; label: string } => !!m)
  const welcomeMap = allMaps.find((m) => m.id === 'welcome')
  const componentMaps = allMaps.filter((m) => m.id !== 'welcome' && groupForMap(m.id) === 'component')
  const prototypeMaps = allMaps.filter((m) => m.id !== 'welcome' && groupForMap(m.id) === 'prototype')

  const activateMap = (id: GraphMapId) => {
    openMap(id)
    setSelectedId(null)
  }

  return (
    <Frame theme="tactical" h="fill" flow="vertical" fill={{ solid: 'var(--bg-1)' }} style={MONO}>
      <WorkspaceHeader
        title={`00 — PLANNING · ${(allMapsWithPlans.find((m) => m.id === mapId)?.label ?? mapId).toUpperCase()}`}
        actions={
          <>
            {/* Refactor only ever reorganizes a component library — showing it
                on Prototypes/Research/Validation/TODO/Claude would dangle a
                control that does nothing relevant to what's on screen. */}
            {isComponentLibraryMap(mapId) && <RefactorPanel onApplied={refreshAll} libraryId={mapId} />}
            {removableLibraryFor(mapId) && (
              <Dropdown
                options={[
                  { value: 'remove', label: 'Remove from Planning' },
                  { value: 'delete', label: 'Delete Permanently' },
                ]}
                onChange={(v) => {
                  const lib = removableLibraryFor(mapId)
                  if (!lib) return
                  if (v === 'remove') handleRemoveLibrary(lib)
                  else setDeletingLibrary(lib)
                }}
                variant="none"
                w="auto"
                trigger={
                  <span style={{ fontSize: 12, color: 'var(--text-3)', padding: '0 4px', ...MONO }} title="Library actions">
                    ⋯
                  </span>
                }
              />
            )}
            {removablePlanFor(mapId) && (
              <Dropdown
                options={[{ value: 'delete', label: 'Delete Plan' }]}
                onChange={() => {
                  if (!window.confirm('Delete this saved plan? The files it references are untouched.')) return
                  onDeletePlan(mapId)
                  setMapId('dsm')
                }}
                variant="none"
                w="auto"
                trigger={
                  <span style={{ fontSize: 12, color: 'var(--text-3)', padding: '0 4px', ...MONO }} title="Plan actions">
                    ⋯
                  </span>
                }
              />
            )}
            <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
              {live.nodes.length} NODES · {live.edges.length} EDGES
            </span>
          </>
        }
        tabs={openTabs.map((m) => ({
          id: m.id,
          label: m.label,
          closable: true,
          icon: removablePlanFor(m.id) ? 'plan-node' : undefined,
        }))}
        activeTabId={mapId}
        onActivateTab={activateMap}
        onCloseTab={closeMap}
      />

      {deletingLibrary && (
        <DeleteLibraryModal
          library={deletingLibrary}
          onClose={() => setDeletingLibrary(null)}
          onDeleted={() => {
            setDeletingLibrary(null)
            setMapId('dsm')
          }}
        />
      )}

      {isCreatingLibrary && (
        <CreateLibraryModal
          onClose={() => setIsCreatingLibrary(false)}
          onCreated={(libraryId) => {
            setIsCreatingLibrary(false)
            switchToMap(libraryId).catch(() => {})
          }}
        />
      )}

      {/* Body: graph canvas + detail panel */}
      <Frame flow="horizontal" grow minH={0}>
        <Frame grow minW={0} style={{ position: 'relative' }}>
          <GraphCanvas
            data={live}
            selectedId={selectedId}
            onSelectNode={(id) => setSelectedId(id || null)}
            onActivateNode={handleActivateNode}
          />

          <ScrollWindow
            axis="y"
            flow="vertical"
            gap={0}
            padding={16}
            style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 200 }}
          >
            <Frame flow="vertical" gap={0} shrink={0} padding={{ bottom: 10 }}>
              <Frame flow="horizontal" align="center" justify="between">
                <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-2)', ...MONO }}>
                  PLANS
                </span>
                <IconButton
                  onClick={() => setIsCreatingLibrary(true)}
                  title="New library"
                  icon="plan-node-add"
                  iconSize={13}
                  textColor="var(--text-2)"
                />
              </Frame>
              {welcomeMap && (
                <PlanRow
                  map={welcomeMap}
                  active={welcomeMap.id === mapId}
                  open={openMapIds.includes(welcomeMap.id)}
                  onOpen={() => activateMap(welcomeMap.id)}
                  onClose={() => closeMap(welcomeMap.id)}
                />
              )}
              <PlanGroup title="Components" maps={componentMaps} mapId={mapId} openMapIds={openMapIds} onOpen={activateMap} onClose={closeMap} />
              <PlanGroup title="Prototypes" maps={prototypeMaps} mapId={mapId} openMapIds={openMapIds} onOpen={activateMap} onClose={closeMap} />
              <PlanGroup title="Saved Plans" maps={plans} mapId={mapId} openMapIds={openMapIds} onOpen={activateMap} onClose={closeMap} icon="plan-node" />
            </Frame>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', flexShrink: 0, marginBottom: 10 }} />

            <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-2)', flexShrink: 0, marginBottom: 10, ...MONO }}>
              {isGlobalSearch ? `RESULTS (${nodeRows.length})` : `NODES (${live.nodes.length})`}
            </span>
            <div style={{ flexShrink: 0, marginBottom: 10 }}>
              <Search
                value={query}
                onChange={setQuery}
                placeholder="Search nodes…"
                w="fill"
                filters={{ options: KIND_FILTER_OPTIONS, active: kindFilter, onChange: setKindFilter }}
              />
            </div>
            {/* createNote posts to whichever map is active — a plan id isn't
                a registered map, so the backend would reject it (see
                isValidMapId in tools/sleipnir-backend.mjs). */}
            {!removablePlanFor(mapId) && (
              <div style={{ flexShrink: 0, marginBottom: 10 }}>
                <NewComponentForm
                  createNote={createNote}
                  onCreated={async (id) => {
                    await refreshAll()
                    setSelectedId(id)
                  }}
                />
              </div>
            )}
            {nodeRows.map((row) => {
                const n = row.node
                return (
                <div
                  key={isGlobalSearch ? `${row.mapId}::${n.id}` : n.id}
                  onMouseEnter={() => setHoveredId(n.id)}
                  onMouseLeave={() => setHoveredId((h) => (h === n.id ? null : h))}
                  style={{ display: 'flex', alignItems: 'center', minHeight: 28, flexShrink: 0 }}
                >
                  {n.status && (
                    <span
                      title={n.status}
                      style={{
                        fontSize: 11,
                        marginRight: 5,
                        color: n.status === 'done' ? 'var(--text-1)' : n.status === 'approved' ? '#e0a040' : 'var(--text-3)',
                        ...MONO,
                      }}
                    >
                      {n.status === 'done' ? '☑' : n.status === 'approved' ? '◐' : '☐'}
                    </span>
                  )}
                  <span
                    onClick={() => selectNodeRow(row)}
                    style={{
                      fontSize: 12,
                      lineHeight: '28px',
                      letterSpacing: '0.02em',
                      color: n.id === selectedId ? 'var(--text-1)' : 'var(--text-2)',
                      opacity: n.id === selectedId ? 1 : 0.85,
                      cursor: 'pointer',
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      ...MONO,
                    }}
                  >
                    {n.label}
                  </span>
                  {/* Only meaningful during global search — a per-map row
                      trivially belongs to the already-visible active tab, so
                      tagging it there would just be clutter. */}
                  {isGlobalSearch && (
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--text-3)',
                        marginLeft: 6,
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                        ...MONO,
                      }}
                    >
                      {row.mapLabel}
                    </span>
                  )}
                  {/* archiveNode archives the real underlying file app-wide —
                      unsafe on a plan tab, which only ever references nodes
                      that "belong" to other maps, and equally unsafe during
                      global search, where a row's mapId may not be the
                      active tab at all. */}
                  {!isGlobalSearch && !removablePlanFor(mapId) && hoveredId === n.id && folderPathForNode(n) && (
                    <IconButton
                      onClick={(e) => { e.stopPropagation(); archiveNode(n) }}
                      title="Remove"
                      glyph="×"
                      iconSize={14}
                      textColor="var(--text-3)"
                    />
                  )}
                </div>
                )
              })}

            {archivedEntries.length > 0 && (
              <Frame flow="vertical" gap={0} padding={{ top: 12 }} shrink={0}>
                <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', marginBottom: 4, ...MONO }}>
                  ARCHIVED ({archivedEntries.length})
                </span>
                {archivedEntries.map((entry) => (
                  <span
                    key={entry.path}
                    onClick={() => restoreEntry(entry)}
                    title="Restore"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: 28,
                      fontSize: 12,
                      letterSpacing: '0.02em',
                      color: 'var(--text-3)',
                      textDecoration: 'line-through',
                      opacity: 0.6,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      ...MONO,
                    }}
                  >
                    {entry.label}
                  </span>
                ))}
              </Frame>
            )}
          </ScrollWindow>
        </Frame>

        {selectedNode && (
          <Frame
            flow="vertical"
            minW={260}
            w={260}
            h="fill"
            fill={{ solid: 'bg-1' }}
            stroke={{ left: { color: 'rgba(255,255,255,0.08)' } }}
            padding={20}
            gap={14}
            scroll="y"
          >
            <span
              style={{
                fontSize: 9,
                letterSpacing: '0.14em',
                color: selectedNode.kind === 'proposed' ? '#e0a040' : 'var(--text-3)',
                ...MONO,
              }}
            >
              {selectedNode.kind === 'proposed' ? 'PROPOSED' : 'BUILT'} · {(selectedNode.type ?? '').toUpperCase()}
            </span>

            <span style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 600, letterSpacing: '0.06em', ...MONO }}>
              {selectedNode.label}
            </span>

            {selectedNode.filePath && (
              <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.02em', wordBreak: 'break-all', ...MONO }}>
                {selectedNode.filePath}
              </span>
            )}

            {selectedNode.description && (
              <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
                {selectedNode.description}
              </span>
            )}

            {selectedNode.status && (
              <>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
                {selectedNode.status === 'draft' ? (
                  <button
                    onClick={() => setPlanNodeStatus(selectedNode, 'approved')}
                    style={{
                      background: 'rgba(255,255,255,0.10)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'var(--text-1)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      ...MONO,
                    }}
                  >
                    APPROVE
                  </button>
                ) : selectedNode.status === 'approved' ? (
                  generatingNodeId === selectedNode.id ? (
                    <Frame flow="horizontal" align="center" gap={8}>
                      <SleipnirLoader size={28} />
                      <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
                        GENERATING…
                      </span>
                    </Frame>
                  ) : (
                    <button
                      onClick={() => generateCode(selectedNode)}
                      style={{
                        background: 'rgba(255,255,255,0.10)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: 'var(--text-1)',
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        ...MONO,
                      }}
                    >
                      GENERATE CODE
                    </button>
                  )
                ) : (
                  <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
                    {selectedNode.status.toUpperCase()}
                  </span>
                )}
                {generateError && generatingNodeId === null && (
                  <span style={{ fontSize: 9, color: '#e07a7a', lineHeight: 1.5, ...MONO }}>{generateError}</span>
                )}
              </>
            )}

            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

            {isComponentNode(selectedNode) && (
              <span
                onClick={() => onJumpToComponent?.(selectedNode)}
                style={{
                  fontSize: 10,
                  color: 'var(--text-1)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  ...MONO,
                }}
              >
                Open in Component Library →
              </span>
            )}

            {selectedNode.type === 'opened-file' && (
              <span
                onClick={() => onJumpToOpenFile?.(selectedNode)}
                style={{
                  fontSize: 10,
                  color: 'var(--text-1)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  ...MONO,
                }}
              >
                Open in Editor →
              </span>
            )}

            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

            <NodeList title="Borrows from" nodes={borrowsFrom} />
            <NodeList title="Borrowed by" nodes={borrowedBy} />
          </Frame>
        )}
      </Frame>
    </Frame>
  )
}
