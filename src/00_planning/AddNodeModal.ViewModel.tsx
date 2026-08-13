import { useEffect, useState } from 'react'
import {
  scaffoldNodes,
  getWorkspaceInfo,
  addNote,
  getNotes,
  setNodeBorrows,
  readWorkspaceFile,
  writeWorkspaceFile,
  listWorkspaceDir,
} from './api/sleipnirApi'
import type { FileTreeNode } from './api/PlatformAPI'
import { rolesForArchitecture, isArchitecturalLanguage, NODE_ROLE, type ArchitectureId, type LanguageId, type NodeRole } from './graph/architectures'
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

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'node'
}

// Every directory in the open Workspace, flattened depth-first — the target
// folder field's suggestion list, so you can scaffold *into* an existing
// feature folder (which is also what makes cross-batch auto-linking find its
// siblings, see submit's `existingInFolder`) instead of only typing a new one.
function flattenDirs(nodes: FileTreeNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'dir') {
      into.push(n.path)
      if (n.children) flattenDirs(n.children, into)
    }
  }
  return into
}

// The single Planning node-creation flow: Name/Description are always
// needed, everything below is optional. No file types checked means "just a
// note" (addNote — no backing file, matching the old standalone "New Node"
// form's behavior exactly); checking any means "scaffold real files"
// (scaffoldNodes), wired together per the chosen architecture. One flow, one
// button, so there's no longer a second "Scaffold Files…" entry point to
// confuse with this one.
export function useAddNodeViewModel({ mapId, onClose, onCreated }: AddNodeModalProps) {
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [architecture, setArchitectureRaw] = useState<ArchitectureId>('mvvm')
  const [language, setLanguageRaw] = useState<LanguageId>('react')
  // The root 'Node' is checked by default and at least one role is always
  // required (see canSubmit) — every creation produces at least the root node.
  // The root is a Markdown doc (nodeName.md), distinct from the suffixed code
  // files (nodeNameView.tsx …); checking more roles adds those alongside it.
  const [checkedRoles, setCheckedRoles] = useState<Set<NodeRole>>(new Set<NodeRole>(['node']))
  const [targetFolder, setTargetFolder] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // For the target-folder field's "here's where it lands" preview + its
  // existing-folder suggestions. Fetched once on open; both stay null/empty
  // (and the field just behaves like a plain text input) when no Workspace
  // is open, which is fine — submit re-checks and reports that itself.
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

  const roles = rolesForArchitecture(architecture)
  // html/css are single files with no architecture/roles — the view hides
  // both dropdowns for them and submit scaffolds one file (see below).
  const architectural = isArchitecturalLanguage(language)

  // Switching architecture can make a previously-checked role unavailable
  // (e.g. 'interface' isn't part of MVC) — drop anything that's no longer valid.
  const setArchitecture = (id: ArchitectureId) => {
    setArchitectureRaw(id)
    const validIds = new Set(rolesForArchitecture(id).map((r) => r.id))
    setCheckedRoles((prev) => new Set([...prev].filter((r) => validIds.has(r))))
  }

  // Switching to a non-architectural language (html/css) drops any checked
  // roles — there are no role files to scaffold, just one plain file. Switching
  // back to an architectural language re-seeds the required root 'Node' if the
  // set was emptied, so the "≥1 checked" invariant always holds there.
  const setLanguage = (id: LanguageId) => {
    setLanguageRaw(id)
    if (!isArchitecturalLanguage(id)) setCheckedRoles(new Set())
    else setCheckedRoles((prev) => (prev.size === 0 ? new Set<NodeRole>(['node']) : prev))
  }

  const toggleRole = (role: NodeRole) => {
    setCheckedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  // Fired when the name field blurs: if the user typed the extension into the
  // name ("MyFile.css"), auto-select the matching language and strip the
  // extension from the visible name — so the filetype dropdown reflects it and
  // the scaffolder produces "myFile.css", never a doubled "myFileCss.css".
  // setLanguage brings its own role side-effects (html/css drop roles, an
  // architectural language re-seeds the root Node), so the whole form stays
  // consistent afterward. submit re-applies the same split as a safety net for
  // a name typed and submitted without the field ever blurring.
  const normalizeLabel = () => {
    const { base, language: detected } = splitLabelExtension(label)
    if (detected && base) {
      setLabel(base)
      setLanguage(detected)
    }
  }

  const effectiveFolder = targetFolder.trim() || slugify(label)

  const submit = async () => {
    // Safety net for the doubled-extension bug when the field never blurred
    // (name typed, then straight to Create): split a trailing recognized
    // extension off the name and let it pick the language, exactly as
    // normalizeLabel does on blur. `activeLanguage`/`activeArchitectural`
    // stand in for the raw `language`/`architectural` for the rest of submit.
    const { base, language: detected } = splitLabelExtension(label)
    const trimmedLabel = base.trim()
    const activeLanguage = detected ?? language
    const activeArchitectural = isArchitecturalLanguage(activeLanguage)
    if (!trimmedLabel) {
      setError('Name is required')
      return
    }

    // No file types checked on an architectural language — a plain note, same
    // as the old standalone "New Node" form. No Workspace requirement either:
    // a note has no file to write, so this works even with nothing open.
    // html/css (non-architectural) skip this and always scaffold one file.
    if (activeArchitectural && checkedRoles.size === 0) {
      setSubmitting(true)
      setError(null)
      try {
        const { node } = await addNote(mapId, trimmedLabel, description.trim() || undefined)
        onCreated([node])
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSubmitting(false)
      }
      return
    }

    const info = await getWorkspaceInfo()
    if (!info.root) {
      setError('No project is open — open a project from File first')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      // html/css scaffold exactly one architecture-less file (the plain 'node'
      // role, no suffix); architectural languages scaffold the checked roles.
      const orderedRoles = activeArchitectural ? roles.filter((r) => checkedRoles.has(r.id)) : [NODE_ROLE]
      const entries: ScaffoldEntry[] = orderedRoles.map((r) => {
        // The root 'Node' role is a Markdown doc (nodeName.md), never a code
        // file — it names/describes the cluster and so can never share a name
        // with the suffixed role files (nodeNameView.tsx …). It carries no
        // `language`, so it's never same-language-linked to or spliced into.
        // Only in the architectural flow; a plain html/css single file still
        // uses its own language + extension (that path also uses NODE_ROLE).
        if (activeArchitectural && r.id === 'node') {
          const body = description.trim()
          return {
            label: trimmedLabel,
            role: r.id,
            architecture,
            description: body || undefined,
            filePath: `${effectiveFolder}/${toCamelCase(trimmedLabel)}.md`,
            content: `# ${toPascalCase(trimmedLabel)}\n${body ? `\n${body}\n` : ''}`,
          }
        }
        const { fileName, content } = renderTemplate(activeLanguage, r.id, trimmedLabel)
        return {
          label: trimmedLabel,
          role: r.id,
          language: activeLanguage,
          architecture: activeArchitectural ? architecture : undefined,
          description: description.trim() || undefined,
          filePath: `${effectiveFolder}/${fileName}`,
          content,
        }
      })

      // Architecture-implied auto-links (e.g. View -> ViewModel): both a
      // graph edge AND a real import statement (every supported language
      // has an adapter — see graph/importAdapters) spliced into the source
      // role's generated content before it's ever written — so the batch
      // ships already wired, not just graph-linked.
      const roleIndex = new Map(orderedRoles.map((r, i) => [r.id, i]))
      const links: ScaffoldLink[] = []
      const adapter = adapterForLanguage(activeLanguage)
      for (const r of orderedRoles) {
        const fromIndex = roleIndex.get(r.id)
        if (fromIndex === undefined) continue
        for (const targetRole of r.linksTo) {
          const toIndex = roleIndex.get(targetRole)
          if (toIndex === undefined) continue
          links.push({ from: fromIndex, to: toIndex })
          if (adapter) {
            const fromEntry = entries[fromIndex]
            const toEntry = entries[toIndex]
            fromEntry.content = adapter.insertImport(fromEntry.content, fromEntry.filePath, toEntry.filePath, trimmedLabel, toEntry.role)
          }
        }
      }

      // Cross-batch links: the same architecture wiring, but to roles that
      // already exist in this feature's folder from an EARLIER creation —
      // otherwise scaffolding a ViewModel today never connects to the View
      // you scaffolded yesterday (the whole point of "we need this for MVC/
      // MVP and all architectures"). A folder is treated as one feature:
      // existing scaffolded nodes under the same target folder + language are
      // the candidates, matched against the architecture's own linksTo table
      // in BOTH directions.
      const { nodes: existingNodes, edges: existingEdges } = await getNotes()
      const folderPrefix = `${effectiveFolder}/`
      const existingInFolder = existingNodes.filter(
        (n) => n.role && n.filePath && n.language === activeLanguage && n.filePath.startsWith(folderPrefix),
      )
      const roleById = new Map(roles.map((r) => [r.id, r]))
      // new entry -> existing file (new imports existing): spliced into the
      // new entry's content now, edge wired after ids exist.
      const crossOut: { fromIndex: number; toNode: GraphNode }[] = []
      // existing file -> new entry (existing imports new): the existing file
      // is edited on disk after creation (its content + id already exist).
      const crossIn: { fromNode: GraphNode; toIndex: number }[] = []
      for (let i = 0; i < orderedRoles.length; i++) {
        const r = orderedRoles[i]
        for (const targetRole of r.linksTo) {
          if (roleIndex.has(targetRole)) continue // same-batch pair, already handled above
          const existing = existingInFolder.find((n) => n.role === targetRole)
          if (existing && existing.filePath) {
            crossOut.push({ fromIndex: i, toNode: existing })
            if (adapter) {
              entries[i].content = adapter.insertImport(entries[i].content, entries[i].filePath, existing.filePath, existing.label, existing.role)
            }
          }
        }
        for (const existing of existingInFolder) {
          if (existing.role && roleIndex.has(existing.role)) continue // that role is also being (re)created in this batch
          const existingRoleDef = existing.role ? roleById.get(existing.role) : undefined
          if (existingRoleDef?.linksTo.includes(r.id)) {
            crossIn.push({ fromNode: existing, toIndex: i })
          }
        }
      }

      const { nodes } = await scaffoldNodes(mapId, entries, links)

      if (adapter && (crossOut.length || crossIn.length)) {
        // Each setNodeBorrows is a full replace, so a node's whole outgoing
        // set has to be rebuilt at once. New nodes: in-batch targets + cross
        // targets. Existing nodes: their current edges + the new target(s).
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

        // Group incoming by the existing source node so its file is read/
        // written once and its edge set is replaced once, even if it imports
        // several new siblings.
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
            if (newNode?.filePath) {
              content = adapter.insertImport(content, fromNode.filePath, newNode.filePath, newNode.label, newNode.role)
            }
          }
          await writeWorkspaceFile(fromNode.filePath, content)
        }
      }

      onCreated(nodes)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  // At least one role must be checked in the architectural flow (the root
  // 'Node' defaults checked) — html/css has no roles, so only a name is needed.
  const canSubmit = !!label.trim() && (!architectural || checkedRoles.size > 0)

  return {
    label, setLabel, normalizeLabel,
    description, setDescription,
    architecture, setArchitecture,
    language, setLanguage,
    architectural,
    roles, checkedRoles, toggleRole,
    targetFolder, setTargetFolder, effectiveFolder,
    workspaceName, existingFolders,
    canSubmit,
    submitting, error, submit, onClose,
  }
}
