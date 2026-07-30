import React, { useState } from 'react'
import { Frame } from '../02_components/01_atoms/Frame/Frame'
import { ScrollWindow } from '../02_components/02_molecules/ScrollWindow/ScrollWindow'
import { Tabs } from '../02_components/02_molecules/Tabs/Tabs'
import { GraphCanvas } from './graph/GraphCanvas'
import { GRAPH_MAPS, type GraphMapId, type GraphNode } from './graph/types'
import {
  scaffoldComponent,
  regenerateGraph,
  type ComponentTier,
  type ScaffoldLanguage,
  type ScaffoldPart,
  type ScaffoldComponentResult,
} from './api/sleipnirApi'
import { usePlanningViewModel, folderPathForNode } from './PlanningView.ViewModel'
import { Search } from '../02_components/02_molecules/Search/Search'
import { RefactorPanel } from '../02_components/02_molecules/RefactorPanel/RefactorPanel'

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

// Kept in sync with tools/languages.mjs's LANGUAGES.
const SCAFFOLD_LANGUAGES: { id: ScaffoldLanguage; label: string }[] = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
]

// Mirrors tools/generate-graph.mjs's toId(): only .ts/.tsx get their
// extension stripped from the node id — other languages keep it.
function stripToId(file: string): string {
  return file.replace(/^src\//, '').replace(/\.(tsx|ts)$/, '')
}

// Picks the "primary" file to auto-select after a (possibly partial) MVVM
// scaffold — View wins if present, then ViewModel, then Interface. Falls
// back to the single file for a non-mvvm (prototype) scaffold.
function idForScaffoldedFile(files: string[], name: string): string | null {
  const baseName = (f: string) => (f.split('/').pop() ?? '').replace(/\.[^./]+$/, '')
  const view = files.find((f) => baseName(f) === name)
  if (view) return stripToId(view)
  const viewModel = files.find((f) => baseName(f) === `${name}ViewModel`)
  if (viewModel) return stripToId(viewModel)
  const iface = files.find((f) => baseName(f) === `i${name}`)
  if (iface) return stripToId(iface)
  if (files.length === 1) return stripToId(files[0])
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
      <button
        onClick={() => setOpen(true)}
        title="New component"
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'var(--text-2)',
          fontSize: 10,
          lineHeight: 1,
          padding: '2px 6px',
          cursor: 'pointer',
          ...MONO,
        }}
      >
        +
      </button>
    )
  }

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    color: active ? 'var(--text-1)' : 'var(--text-3)',
    fontSize: 9,
    letterSpacing: '0.04em',
    padding: '3px 7px',
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
          fontSize: 10,
          padding: '4px 6px',
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
            fontSize: 10,
            padding: '4px 6px',
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
          fontSize: 10,
          padding: '4px 6px',
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
            fontSize: 10,
            padding: '4px 6px',
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
            fontSize: 10,
            padding: '4px 10px',
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
            fontSize: 10,
            padding: '4px 10px',
            cursor: 'pointer',
            ...MONO,
          }}
        >
          Cancel
        </button>
      </Frame>
      {error && (
        <span style={{ fontSize: 9, color: '#e07a7a', ...MONO }}>{error}</span>
      )}
    </Frame>
  )
}

function NodeList({ title, nodes }: { title: string; nodes: GraphNode[] }) {
  return (
    <Frame flow="vertical" gap={6}>
      <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
        {title.toUpperCase()} ({nodes.length})
      </span>
      <Frame flow="vertical" gap={4}>
        {nodes.length === 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>— none —</span>
        )}
        {nodes.map((n) => (
          <span key={n.id} style={{ fontSize: 10, color: 'var(--text-2)', ...MONO }}>
            · {n.label}
          </span>
        ))}
      </Frame>
    </Frame>
  )
}

export const PlanningView: React.FC = () => {
  const {
    mapId,
    setMapId,
    selectedId,
    setSelectedId,
    live,
    archivedEntries,
    hoveredId,
    setHoveredId,
    refreshAll,
    createNote,
    archiveNode,
    restoreEntry,
    selectedNode,
    borrowsFrom,
    borrowedBy,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    filteredNodes,
  } = usePlanningViewModel()

  return (
    <Frame theme="tactical" h="fill" flow="vertical" fill={{ solid: 'var(--bg-1)' }} style={MONO}>
      {/* Top bar: map selector */}
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 24, y: 10 }}
        stroke={{ bottom: { color: 'rgba(255,255,255,0.07)' } }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-2)', ...MONO }}>
          00 — PLANNING
        </span>

        <Tabs.Root
          value={mapId}
          onValueChange={(v) => {
            setMapId(v as GraphMapId)
            setSelectedId(null)
          }}
        >
          <Tabs.List style={{ borderBottom: 'none' }}>
            {GRAPH_MAPS.map((m) => (
              <Tabs.Tab key={m.id} value={m.id}>{m.label}</Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.Root>

        <Frame flow="horizontal" align="center" gap={16}>
          <RefactorPanel onApplied={refreshAll} />
          <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
            {live.nodes.length} NODES · {live.edges.length} EDGES
          </span>
        </Frame>
      </Frame>

      {/* Body: graph canvas + detail panel */}
      <Frame flow="horizontal" grow minH={0}>
        <Frame grow minW={0} style={{ position: 'relative' }}>
          <GraphCanvas
            data={live}
            selectedId={selectedId}
            onSelectNode={(id) => setSelectedId(id || null)}
          />

          <ScrollWindow
            axis="y"
            flow="vertical"
            gap={0}
            padding={16}
            style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 200 }}
          >
            <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-2)', flexShrink: 0, marginBottom: 10, ...MONO }}>
              NODES ({live.nodes.length})
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
            <div style={{ flexShrink: 0, marginBottom: 10 }}>
              <NewComponentForm
                createNote={createNote}
                onCreated={async (id) => {
                  await refreshAll()
                  setSelectedId(id)
                }}
              />
            </div>
            {filteredNodes.map((n) => (
                <div
                  key={n.id}
                  onMouseEnter={() => setHoveredId(n.id)}
                  onMouseLeave={() => setHoveredId((h) => (h === n.id ? null : h))}
                  style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
                >
                  <span
                    onClick={() => setSelectedId(n.id)}
                    style={{
                      fontSize: 10,
                      lineHeight: '22px',
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
                  {hoveredId === n.id && folderPathForNode(n) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); archiveNode(n) }}
                      title="Remove"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-3)',
                        cursor: 'pointer',
                        padding: '0 4px',
                        fontSize: 11,
                        ...MONO,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

            {archivedEntries.length > 0 && (
              <Frame flow="vertical" gap={0} padding={{ top: 12 }} shrink={0}>
                <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', marginBottom: 4, ...MONO }}>
                  ARCHIVED ({archivedEntries.length})
                </span>
                {archivedEntries.map((entry) => (
                  <span
                    key={entry.path}
                    onClick={() => restoreEntry(entry)}
                    title="Restore"
                    style={{
                      fontSize: 10,
                      lineHeight: '22px',
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

            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

            <NodeList title="Borrows from" nodes={borrowsFrom} />
            <NodeList title="Borrowed by" nodes={borrowedBy} />
          </Frame>
        )}
      </Frame>
    </Frame>
  )
}
