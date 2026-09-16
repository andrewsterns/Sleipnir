import { useEffect, useState } from 'react'
import {
  scaffoldNodes,
  getWorkspaceInfo,
  getNotes,
  setNodeBorrows,
  readWorkspaceFile,
  writeWorkspaceFile,
  listWorkspaceDir,
} from './api/sleipnirApi'
import type { FileTreeNode } from './api/PlatformAPI'
import { ROLE_OPTIONS, isArchitecturalLanguage, type LanguageId, type NodeRole } from './graph/architectures'
import { renderTemplate } from './graph/templates'
import { toCamelCase, toPascalCase, splitLabelExtension } from './graph/naming'
import { adapterForLanguage } from './graph/importAdapters'
import type { GraphNode, ScaffoldEntry, ScaffoldLink } from './graph/types'

export interface AddNodeModalProps {
  /** Which map new nodes land in — posts to whichever map is currently active. */
  mapId: string
  onClose: () => void
  onCreated: (nodes: GraphNode[]) => void
}

/** One name row in the popup. Its own file is `name.<ext>`; each checked role adds a child file (nameView.tsx, name.md …) under it. */
export interface DraftNode {
  id: string
  name: string
  language: LanguageId
  roles: NodeRole[]
  /** Optional — applied to every file this row creates (and the body of its .md doc). */
  description: string
}

let nextDraftId = 0
const newDraft = (language: LanguageId = 'react'): DraftNode => ({ id: `draft-${nextDraftId++}`, name: '', language, roles: [], description: '' })

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'node'
}

// Every directory in the open Workspace, flattened depth-first — the target
// folder field's suggestion list, so you can scaffold *into* an existing
// feature folder (which is also what makes cross-batch auto-linking find its
// siblings, see scaffoldDraft's `existingInFolder`).
function flattenDirs(nodes: FileTreeNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'dir') {
      into.push(n.path)
      if (n.children) flattenDirs(n.children, into)
    }
  }
  return into
}

// A typed extension ("Cart.css") overrides the row's dropdown language.
export function resolveDraft(d: DraftNode) {
  const { base, language: detected } = splitLabelExtension(d.name)
  const language = detected ?? d.language
  return { base: base.trim(), language, architectural: isArchitecturalLanguage(language) }
}

// Extra copies of a role (the chip's "+") are numbered before the extension:
// cartView.tsx, cartView(1).tsx, cartView(2).tsx …
function withCopy(fileName: string, copy: number): string {
  return copy === 0 ? fileName : fileName.replace(/(\.[^.]+)$/, `(${copy})$1`)
}

/** How many copies of `role` this row will create (0 = chip off). `roles` holds one entry per copy. */
export function roleCount(d: DraftNode, role: NodeRole): number {
  return d.roles.filter((r) => r === role).length
}

function roleFileName(language: LanguageId, role: NodeRole, name: string, copy: number): string {
  return withCopy(role === 'node' ? `${toCamelCase(name)}.md` : renderTemplate(language, role, name).fileName, copy)
}

/** Every file a row will create, for the live preview — its own file first, then each role's copies. */
export function draftFileNames(d: DraftNode): { role: NodeRole | null; copy: number; fileName: string }[] {
  const { base, language, architectural } = resolveDraft(d)
  const name = base || 'name'
  const files: { role: NodeRole | null; copy: number; fileName: string }[] = [
    { role: null, copy: 0, fileName: renderTemplate(language, 'node', name).fileName },
  ]
  if (!architectural) return files
  for (const r of ROLE_OPTIONS) {
    for (let copy = 0; copy < roleCount(d, r.id); copy++) {
      files.push({ role: r.id, copy, fileName: roleFileName(language, r.id, name, copy) })
    }
  }
  return files
}

// Planning's node-creation popup: any number of name rows, each creating its
// own file plus whichever role files are checked under it. No architecture to
// pick — ROLE_OPTIONS carries the combined auto-link table.
export function useAddNodeViewModel({ mapId, onClose, onCreated }: AddNodeModalProps) {
  const [drafts, setDrafts] = useState<DraftNode[]>(() => [newDraft()])
  const [activeId, setActiveId] = useState<string>(() => drafts[0].id)
  const [targetFolder, setTargetFolder] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [workspaceName, setWorkspaceName] = useState<string | null>(null)
  const [existingFolders, setExistingFolders] = useState<string[]>([])
  useEffect(() => {
    getWorkspaceInfo()
      .then((info) => {
        if (!info.root) return
        setWorkspaceName(info.name ?? null)
        return listWorkspaceDir('').then(({ tree }) => setExistingFolders(flattenDirs(tree)))
      })
      .catch(() => {})
  }, [])

  const updateDraft = (id: string, patch: Partial<DraftNode>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))

  // New rows inherit the last row's language — batches are usually one stack.
  const addDraft = () => {
    const d = newDraft(drafts[drafts.length - 1]?.language)
    setDrafts((prev) => [...prev, d])
    setActiveId(d.id)
  }

  const removeDraft = (id: string) => {
    if (drafts.length <= 1) return
    const remaining = drafts.filter((d) => d.id !== id)
    setDrafts(remaining)
    if (activeId === id) setActiveId(remaining[remaining.length - 1].id)
  }

  // Chip body: off → one copy; on → none (clears every copy).
  const toggleRole = (id: string, role: NodeRole) =>
    setDrafts((prev) => prev.map((d) => (d.id !== id ? d : { ...d, roles: d.roles.includes(role) ? d.roles.filter((r) => r !== role) : [...d.roles, role] })))

  // Chip "+": one more numbered copy of the role.
  const addRoleCopy = (id: string, role: NodeRole) =>
    setDrafts((prev) => prev.map((d) => (d.id !== id ? d : { ...d, roles: [...d.roles, role] })))

  // A file row's ×: drops one copy of that role (later copies renumber down).
  const removeRoleCopy = (id: string, role: NodeRole) =>
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d
        const at = d.roles.lastIndexOf(role)
        return at < 0 ? d : { ...d, roles: d.roles.filter((_, i) => i !== at) }
      }),
    )

  // On blur: a typed extension moves into the dropdown and leaves the bare
  // name, so the scaffolder never produces "cartCss.css".
  const normalizeName = (id: string) => {
    const d = drafts.find((x) => x.id === id)
    if (!d) return
    const { base, language } = splitLabelExtension(d.name)
    if (language && base) updateDraft(id, { name: base, language })
  }

  // Unspecified folder → `.planning/<slug>` per row, same idea as canvas files
  // living under `.canvas`, so ad-hoc nodes don't scatter folders through src.
  const folderFor = (d: DraftNode) => targetFolder.trim() || `.planning/${slugify(resolveDraft(d).base)}`
  const activeDraft = drafts.find((d) => d.id === activeId) ?? drafts[0]

  const scaffoldDraft = async (d: DraftNode): Promise<GraphNode[]> => {
    const { base, language, architectural } = resolveDraft(d)
    const folder = folderFor(d)
    const body = d.description.trim()
    const checked = architectural ? ROLE_OPTIONS.filter((r) => d.roles.includes(r.id)) : []
    const codeRoles = checked.filter((r) => r.id !== 'node')

    // [0] the row's own file, then each code role, then the optional .md doc.
    const main = renderTemplate(language, 'node', base)
    const entries: ScaffoldEntry[] = [
      { label: base, role: 'node', language, description: body || undefined, filePath: `${folder}/${main.fileName}`, content: main.content },
      ...codeRoles.map((r) => {
        const { fileName, content } = renderTemplate(language, r.id, base)
        return { label: base, role: r.id, language, description: body || undefined, filePath: `${folder}/${fileName}`, content }
      }),
    ]
    if (checked.some((r) => r.id === 'node')) {
      // The Markdown doc carries no `language`, so it's never linked or spliced into.
      entries.push({
        label: base,
        role: 'node',
        description: body || undefined,
        filePath: `${folder}/${toCamelCase(base)}.md`,
        content: `# ${toPascalCase(base)}\n${body ? `\n${body}\n` : ''}`,
      })
    }

    // Extra numbered copies from the chip "+" (cartView(1).tsx …) — plain
    // files appended after everything else, outside the auto-link wiring so
    // they never add duplicate imports/edges.
    for (const r of checked) {
      for (let copy = 1; copy < roleCount(d, r.id); copy++) {
        const fileName = roleFileName(language, r.id, base, copy)
        entries.push(
          r.id === 'node'
            ? { label: base, role: 'node', description: body || undefined, filePath: `${folder}/${fileName}`, content: `# ${toPascalCase(base)}\n${body ? `\n${body}\n` : ''}` }
            : { label: base, role: r.id, language, description: body || undefined, filePath: `${folder}/${fileName}`, content: renderTemplate(language, r.id, base).content },
        )
      }
    }

    // In-batch auto-links (e.g. View -> ViewModel): a graph edge plus a real
    // import spliced into the source file before it's written.
    const roleIndex = new Map(codeRoles.map((r, i) => [r.id, i + 1]))
    const links: ScaffoldLink[] = []
    const adapter = adapterForLanguage(language)
    for (const r of codeRoles) {
      const fromIndex = roleIndex.get(r.id)!
      for (const targetRole of r.linksTo) {
        const toIndex = roleIndex.get(targetRole)
        if (toIndex === undefined) continue
        links.push({ from: fromIndex, to: toIndex })
        if (adapter) {
          entries[fromIndex].content = adapter.insertImport(entries[fromIndex].content, entries[fromIndex].filePath, entries[toIndex].filePath, base, entries[toIndex].role)
        }
      }
    }

    // Cross-batch links: the same wiring to role files that already exist in
    // this folder from an earlier creation, in both directions.
    const { nodes: existingNodes, edges: existingEdges } = await getNotes()
    const folderPrefix = `${folder}/`
    const existingInFolder = existingNodes.filter(
      (n) => n.role && n.role !== 'node' && n.filePath && n.language === language && n.filePath.startsWith(folderPrefix),
    )
    const roleById = new Map(ROLE_OPTIONS.map((r) => [r.id, r]))
    const crossOut: { fromIndex: number; toNode: GraphNode }[] = []
    const crossIn: { fromNode: GraphNode; toIndex: number }[] = []
    for (const r of codeRoles) {
      const i = roleIndex.get(r.id)!
      for (const targetRole of r.linksTo) {
        if (roleIndex.has(targetRole)) continue
        const existing = existingInFolder.find((n) => n.role === targetRole)
        if (existing && existing.filePath) {
          crossOut.push({ fromIndex: i, toNode: existing })
          if (adapter) {
            entries[i].content = adapter.insertImport(entries[i].content, entries[i].filePath, existing.filePath, existing.label, existing.role)
          }
        }
      }
      for (const existing of existingInFolder) {
        if (existing.role && roleIndex.has(existing.role)) continue
        const existingRoleDef = existing.role ? roleById.get(existing.role) : undefined
        if (existingRoleDef?.linksTo.includes(r.id)) crossIn.push({ fromNode: existing, toIndex: i })
      }
    }

    const { nodes } = await scaffoldNodes(mapId, entries, links)

    if (adapter && (crossOut.length || crossIn.length)) {
      // setNodeBorrows is a full replace, so each node's outgoing set is rebuilt at once.
      const inBatchTargetsByFrom = new Map<number, string[]>()
      for (const l of links) {
        const list = inBatchTargetsByFrom.get(l.from) ?? []
        list.push(nodes[l.to].id)
        inBatchTargetsByFrom.set(l.from, list)
      }
      const crossOutByFrom = new Map<number, string[]>()
      for (const { fromIndex, toNode } of crossOut) {
        const list = crossOutByFrom.get(fromIndex) ?? []
        list.push(toNode.id)
        crossOutByFrom.set(fromIndex, list)
      }
      for (const [fromIndex, crossTargets] of crossOutByFrom) {
        await setNodeBorrows(nodes[fromIndex].id, [...(inBatchTargetsByFrom.get(fromIndex) ?? []), ...crossTargets])
      }

      const crossInBySource = new Map<string, { fromNode: GraphNode; newIds: string[] }>()
      for (const { fromNode, toIndex } of crossIn) {
        const entry = crossInBySource.get(fromNode.id) ?? { fromNode, newIds: [] }
        entry.newIds.push(nodes[toIndex].id)
        crossInBySource.set(fromNode.id, entry)
      }
      for (const { fromNode, newIds } of crossInBySource.values()) {
        if (!fromNode.filePath) continue
        const existingTargets = existingEdges.filter((e) => e.source === fromNode.id).map((e) => e.target)
        await setNodeBorrows(fromNode.id, [...existingTargets, ...newIds])
        let content = (await readWorkspaceFile(fromNode.filePath)).content
        for (const newId of newIds) {
          const newNode = nodes.find((n) => n.id === newId)
          if (newNode?.filePath) content = adapter.insertImport(content, fromNode.filePath, newNode.filePath, newNode.label, newNode.role)
        }
        await writeWorkspaceFile(fromNode.filePath, content)
      }
    }
    return nodes
  }

  const named = drafts.filter((d) => resolveDraft(d).base)
  const canSubmit = named.length > 0

  const submit = async () => {
    if (!canSubmit) {
      setError('Name is required')
      return
    }
    const info = await getWorkspaceInfo()
    if (!info.root) {
      setError('No project is open — open a project from File first')
      return
    }
    setSubmitting(true)
    setError(null)
    const created: GraphNode[] = []
    try {
      // Sequential, so a later row's cross-batch linking sees earlier rows' files.
      for (const d of named) created.push(...(await scaffoldDraft(d)))
      onCreated(created)
      onClose()
    } catch (e) {
      if (created.length) onCreated(created)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    drafts, activeId, setActiveId, activeDraft,
    updateDraft, addDraft, removeDraft, toggleRole, addRoleCopy, removeRoleCopy, normalizeName,
    targetFolder, setTargetFolder, effectiveFolder: folderFor(activeDraft),
    workspaceName, existingFolders,
    canSubmit,
    submitting, error, submit, onClose,
  }
}
