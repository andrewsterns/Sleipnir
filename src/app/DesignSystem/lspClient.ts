import { LSPClient, languageServerExtensions, Workspace, LSPPlugin, jumpToDefinition, hoverTooltips, type Transport, type WorkspaceFile } from '@codemirror/lsp-client'
import { Text, StateField, StateEffect, type TransactionSpec, type ChangeSet } from '@codemirror/state'
import { EditorView, Decoration, type DecorationSet } from '@codemirror/view'
import { readRepoFile, readWorkspaceFile } from '../../00_planning/api/sleipnirApi'
import { getLspFileOpener } from './lspFileOpener'

// Must match tools/lsp-proxy.mjs's FAKE_ROOT_URI exactly — the proxy
// rewrites this to the real absolute repo path server-side, since the
// browser has no way to know that path itself.
const FAKE_ROOT_URI = 'file:///__SLEIPNIR_ROOT__'
const LSP_WS_URL = 'ws://localhost:7081'

const LSP_LANGUAGE_ID: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  mjs: 'javascript',
  cjs: 'javascript',
}

export function lspLanguageIdForPath(srcRelativePath: string): string | null {
  const ext = srcRelativePath.split('.').pop()?.toLowerCase() ?? ''
  return LSP_LANGUAGE_ID[ext] ?? null
}

// Which language-server "project" an editor should attach to: Sleipnir's own
// repo (the one shared, page-lifetime tsserver, rooted via FAKE_ROOT_URI
// since the renderer never learns Sleipnir's own packaged-app install path),
// or an external Workspace project rooted at a real absolute path the
// renderer already legitimately knows (WorkspaceInfo.root — already shown in
// the UI, nothing to hide) — see CodeEditorView.ViewModel's LspRoot
// resolution and tools/lsp-proxy.mjs's per-connection routing.
export type LspRoot = { kind: 'self' } | { kind: 'external'; root: string }

function encodeSegments(relPath: string): string {
  return relPath.split('/').map(encodeURIComponent).join('/')
}

// Browser-safe path→file:// URI encoder for the external scheme — there's no
// Node pathToFileURL reachable from the renderer (electron/main.cjs runs with
// contextIsolation:true, nodeIntegration:false). Keeps the drive letter
// literal (uppercased, matching Node's own pathToFileURL convention) rather
// than percent-encoding it, and percent-encodes every other segment — same
// per-segment encoding uriForPath already uses for the self-host scheme.
function fileUriForAbsolutePath(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, '/')
  const driveMatch = /^([a-zA-Z]):\/(.*)$/.exec(normalized)
  if (driveMatch) {
    const [, drive, rest] = driveMatch
    const encodedRest = encodeSegments(rest)
    return `file:///${drive.toUpperCase()}:${encodedRest ? '/' + encodedRest : ''}`
  }
  return `file:///${encodeSegments(normalized.replace(/^\/+/, ''))}`
}

// Inverse of fileUriForAbsolutePath. tools/lsp-proxy.mjs's toFakeUris/toRealUris
// rewriting only ever applies to the self-host (FAKE_ROOT_URI) scheme —
// external-scheme messages pass through the proxy untouched — so this needs
// the same case/encoding-insensitive drive-letter matching the proxy's own
// REAL_ROOT_PATTERN uses, to tolerate the same observed Windows quirk
// (tsserver sometimes emitting a lowercase, percent-encoded drive letter)
// client-side instead.
function workspaceRelativePathForUri(root: string, uri: string): string | null {
  const rootUri = fileUriForAbsolutePath(root)
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const driveMatch = /^file:\/\/\/([a-zA-Z]):(.*)$/.exec(rootUri)
  const pattern = driveMatch
    ? new RegExp(`^file:///${driveMatch[1]}(?::|%3[aA])${escape(driveMatch[2])}`, 'i')
    : new RegExp(`^${escape(rootUri)}`, 'i')
  if (!pattern.test(uri)) return null
  const rest = uri.replace(pattern, '')
  return rest.startsWith('/') ? decodeURIComponent(rest.slice(1)) : null
}

// Self-host scheme — unchanged from the original single-root design.
// Percent-encodes each segment — the exact inverse of repoRelativePathForUri's
// decodeURIComponent below. Without this, a path containing characters that
// need URI-encoding (most commonly `@` in a scoped npm package, e.g.
// go-to-definition landing in node_modules/@types/react/index.d.ts for a
// plain intrinsic JSX element like <div>) round-trips to a URI string that
// doesn't match the raw, properly percent-encoded one the language server
// actually sent — silently breaking SleipnirWorkspace.displayFile's
// waitForFile/getFile exact-string-match lookups for that file specifically.
function selfUriForPath(repoRelativePath: string): string {
  return `${FAKE_ROOT_URI}/${encodeSegments(repoRelativePath)}`
}

// Inverse of selfUriForPath — recovers a REPO_ROOT-relative path from a
// FAKE_ROOT_URI-prefixed URI. Returns null for a URI that never had that
// prefix: tools/lsp-proxy.mjs's toFakeUris only rewrites paths under
// REPO_ROOT, so a definition landing genuinely outside it (vanishingly
// rare, since tsserver's project root is REPO_ROOT itself) passes through
// as a real, unmappable file:// URI — deliberately not routed through the
// app's tab system in that case (see SleipnirWorkspace.displayFile below).
function repoRelativePathForUri(uri: string): string | null {
  const prefix = `${FAKE_ROOT_URI}/`
  if (!uri.startsWith(prefix)) return null
  return decodeURIComponent(uri.slice(prefix.length))
}

// Resolves an LspRoot to the concrete URI scheme + file-read implementation
// SleipnirWorkspace and getTypeScriptLspClient need — the one place that
// decides between "Sleipnir's own repo" and "an external Workspace project"
// so neither of those has to duplicate the branch.
function schemeFor(root: LspRoot) {
  if (root.kind === 'self') {
    return {
      rootUri: FAKE_ROOT_URI,
      uriForPath: selfUriForPath,
      pathForUri: repoRelativePathForUri,
      readFile: readRepoFile,
    }
  }
  const base = root.root
  return {
    rootUri: fileUriForAbsolutePath(base),
    uriForPath: (relPath: string) => `${fileUriForAbsolutePath(base)}/${encodeSegments(relPath)}`,
    pathForUri: (uri: string) => workspaceRelativePathForUri(base, uri),
    readFile: readWorkspaceFile,
  }
}

// Builds the LSP URI for a root-relative path, in whichever scheme `root`
// resolves to (see CodeEditorView.ViewModel's LspRoot for how a file's scope
// maps to one).
export function uriForPath(root: LspRoot, relPath: string): string {
  return schemeFor(root).uriForPath(relPath)
}

// Resolved once openFile()'s resulting CodeEditorView mounts and registers
// itself with the workspace (see SleipnirWorkspace.openFile below) — or
// after a timeout, so a jump to a path that can't actually be opened (a
// broken/stale reference) doesn't hang forever.
const OPEN_WAIT_TIMEOUT_MS = 2000
const pendingOpens = new Map<string, Array<(file: WorkspaceFile) => void>>()

function waitForFile(uri: string): Promise<WorkspaceFile | null> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (file: WorkspaceFile | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const waiters = pendingOpens.get(uri)
      if (waiters) {
        const idx = waiters.indexOf(onOpen)
        if (idx !== -1) waiters.splice(idx, 1)
        if (waiters.length === 0) pendingOpens.delete(uri)
      }
      resolve(file)
    }
    const onOpen = (file: WorkspaceFile) => settle(file)
    const timer = setTimeout(() => settle(null), OPEN_WAIT_TIMEOUT_MS)
    const waiters = pendingOpens.get(uri) ?? []
    waiters.push(onOpen)
    pendingOpens.set(uri, waiters)
  })
}

function resolvePendingOpens(uri: string, file: WorkspaceFile) {
  const waiters = pendingOpens.get(uri)
  if (!waiters || waiters.length === 0) return
  // Copy first — each waiter's settle() mutates the same array via splice.
  for (const w of [...waiters]) w(file)
}

// A custom Workspace (see the library's own doc comment: "Implementing your
// own workspace class can provide more control...") — ports the library's
// internal, unexported DefaultWorkspace's reference semantics for files/
// syncFiles/openFile/closeFile as-is (read directly from
// node_modules/@codemirror/lsp-client/dist/index.js), and additionally
// overrides displayFile/requestFile/updateFile to actually open a tab for a
// file that isn't one already, instead of the base class's default
// "only works if already open" behavior.
class SleipnirWorkspace extends Workspace {
  files: WorkspaceFile[] = []
  private fileVersions: Record<string, number> = Object.create(null)
  // Resolved once at construction from the LspRoot this workspace's client
  // was created for (see getTypeScriptLspClient) — lets displayFile/
  // requestFile/updateFile below stay scheme-agnostic instead of duplicating
  // this whole class for the external-workspace case.
  private pathForUri: (uri: string) => string | null
  private readFile: (path: string) => Promise<{ content: string }>

  constructor(client: LSPClient, pathForUri: (uri: string) => string | null, readFile: (path: string) => Promise<{ content: string }>) {
    super(client)
    this.pathForUri = pathForUri
    this.readFile = readFile
  }

  private nextFileVersion(uri: string): number {
    const next = (this.fileVersions[uri] ?? -1) + 1
    this.fileVersions[uri] = next
    return next
  }

  syncFiles() {
    const result: { file: WorkspaceFile; prevDoc: Text; changes: ChangeSet }[] = []
    for (const file of this.files) {
      const view = file.getView()
      if (!view) continue
      const plugin = LSPPlugin.get(view)
      if (!plugin) continue
      const changes = plugin.unsyncedChanges
      if (!changes.empty) {
        result.push({ changes, file, prevDoc: file.doc })
        file.doc = view.state.doc
        file.version = this.nextFileVersion(file.uri)
        plugin.clear()
      }
    }
    return result
  }

  openFile(uri: string, languageId: string, view: EditorView) {
    if (this.getFile(uri)) {
      throw new Error("SleipnirWorkspace doesn't support multiple views on the same file")
    }
    const file: WorkspaceFile = {
      uri,
      languageId,
      version: this.nextFileVersion(uri),
      doc: view.state.doc,
      getView: () => view,
    }
    this.files.push(file)
    this.client.didOpen(file)
    resolvePendingOpens(uri, file)
  }

  closeFile(uri: string) {
    const file = this.getFile(uri)
    if (file) {
      this.files = this.files.filter((f) => f !== file)
      this.client.didClose(uri)
    }
  }

  // The actual cross-file-navigation fix: the base Workspace's displayFile
  // just returns null when the target isn't already a tracked, visible
  // editor (see its source — no hook for "open a new tab" at all). Here,
  // resolve the URI back to a repo-relative path and route it through
  // App.tsx's openFile() (registerLspFileOpener), then wait for the
  // resulting CodeEditorView to mount and register itself via openFile()
  // above.
  async displayFile(uri: string): Promise<EditorView | null> {
    const existingView = this.getFile(uri)?.getView()
    if (existingView) return existingView

    const path = this.pathForUri(uri)
    const lspFileOpener = getLspFileOpener()
    if (path == null || !lspFileOpener) {
      console.info(`[lsp] can't display ${uri} — outside this workspace, or no file-opener registered yet`)
      return null
    }
    lspFileOpener(path)
    const file = await waitForFile(uri)
    return file?.getView() ?? null
  }

  // Deliberately lighter than displayFile — backs only the find-references
  // panel's preview line (never pushed into `this.files`, no didOpen sent,
  // no tab opened). Forcing every referenced file open as a real tab just to
  // list them would pop open dozens of tabs for one Shift-F12; only actually
  // clicking a reference (which calls displayFile, not requestFile) should
  // do that.
  async requestFile(uri: string): Promise<WorkspaceFile | null> {
    const existing = this.getFile(uri)
    if (existing) return existing
    const path = this.pathForUri(uri)
    if (path == null) return null
    try {
      const { content } = await this.readFile(path)
      return {
        uri,
        languageId: '',
        version: 0,
        doc: Text.of(content.split(/\r\n|\r|\n/)),
        getView: () => null,
      }
    } catch {
      return null
    }
  }

  // Matches the base class's default when a live view already exists.
  // Otherwise — a server-initiated edit (renameSymbol's WorkspaceEdit)
  // targeting a file that isn't currently open — force it open as a real
  // tab and apply the edit once it mounts, rather than silently dropping it
  // (the base default just no-ops when there's no view; that silent drop is
  // the root cause of "rename reports success but misses un-open files").
  updateFile(uri: string, update: TransactionSpec) {
    const existingView = this.getFile(uri)?.getView()
    if (existingView) {
      existingView.dispatch(update)
      return
    }
    const path = this.pathForUri(uri)
    const lspFileOpener = getLspFileOpener()
    if (path == null || !lspFileOpener) return
    lspFileOpener(path)
    waitForFile(uri).then((file) => {
      file?.getView()?.dispatch(update)
    })
  }
}

// Ctrl/Cmd+click a symbol to jump to its definition — the "drill into" gesture
// from VS Code. The lsp-client library only ships F12 (jumpToDefinitionKeymap);
// this layers the pointer gesture on top. Two things worth knowing:
//   • CodeMirror's own default for Ctrl/Cmd+click is "add a selection range"
//     (multi-cursor). We claim the gesture at mousedown and return true, which
//     makes CodeMirror preventDefault and skip its built-in mouse handler (core
//     mouse handling is always appended last in the handler chain, so a plugin
//     handler that returns true short-circuits it).
//   • jumpToDefinition reads the *main selection head*, not the click, so we
//     move the caret to the clicked position first, then invoke it. Cross-file
//     targets open a tab via SleipnirWorkspace.displayFile.
// The mousemove/mouseleave pair toggles a class so the caret renders as a
// pointer while the modifier is held (discoverability — see codeEditorTheme.ts
// for the matching cursor rule). Only added for LSP-backed files (see
// CodeEditorView.ViewModel), so with no language server jumpToDefinition can't
// be a no-op gesture.
export const goToDefinitionOnModClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return false
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos == null) return false
    view.dispatch({ selection: { anchor: pos } })
    view.focus()
    jumpToDefinition(view)
    return true
  },
  mousemove(event, view) {
    const active = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
    if (active !== view.dom.classList.contains('cm-goToDef')) view.dom.classList.toggle('cm-goToDef', active)
    return false
  },
  mouseleave(_event, view) {
    view.dom.classList.remove('cm-goToDef')
    return false
  },
})

// Plain hover (no modifier) — a native tooltip with the symbol's type/doc
// info from the language server. The library ships this outright, no custom
// logic needed. Also doubles as the simplest possible "is the LSP actually
// connected and responding" check, since it needs no click and no Ctrl/Cmd
// hold — if hovering never shows a tooltip, the problem is the LSP
// connection/attachment itself, not the click-handling code.
export const lspHoverTooltips = hoverTooltips()

// Ctrl/Cmd-hover "is this actually clickable" affordance — underlines the
// word under the pointer while the modifier is held, but ONLY once the
// language server confirms a definition genuinely exists there (a real
// textDocument/definition round-trip — the same request jumpToDefinition
// itself makes). So the underline is direct visual proof the LSP is
// resolving definitions correctly, decoupled from whatever the click
// handler's own preventDefault/dispatch dance does — the classic VS Code
// "hold Ctrl, hover, see the link" gesture.
const setHoverLink = StateEffect.define<{ from: number; to: number } | null>()
const hoverLinkMark = Decoration.mark({ class: 'cm-hoverDefLink' })
const hoverLinkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setHoverLink)) deco = e.value ? Decoration.set([hoverLinkMark.range(e.value.from, e.value.to)]) : Decoration.none
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

function clearHoverLink(view: EditorView) {
  if (view.state.field(hoverLinkField, false)?.size) view.dispatch({ effects: setHoverLink.of(null) })
}

// Module-level, not per-view: a slow response from an earlier hover must
// never clobber a newer hover's result (or a mouseleave/modifier-release that
// already cleared it) — bumped on every new lookup, checked when the
// response comes back. Safe across multiple open tabs since a hidden tab's
// (display:none) editor can't receive mousemove in the first place, so only
// one view is ever actually generating lookups at a time.
let hoverLinkToken = 0

export const modHoverDefinitionLink = [
  hoverLinkField,
  EditorView.domEventHandlers({
    mousemove(event, view) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        clearHoverLink(view)
        return false
      }
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      const word = pos == null ? null : view.state.wordAt(pos)
      if (!word) {
        clearHoverLink(view)
        return false
      }
      const plugin = LSPPlugin.get(view)
      if (!plugin || !plugin.client.serverCapabilities?.definitionProvider) return false
      const token = ++hoverLinkToken
      plugin.client.sync()
      plugin.client
        .request('textDocument/definition', { textDocument: { uri: plugin.uri }, position: plugin.toPosition(word.from) })
        .then((response: unknown) => {
          if (token !== hoverLinkToken) return // superseded by a newer hover
          const found = Array.isArray(response) ? response.length > 0 : !!response
          view.dispatch({ effects: setHoverLink.of(found ? { from: word.from, to: word.to } : null) })
        })
        .catch(() => {})
      return false
    },
    mouseleave(_event, view) {
      clearHoverLink(view)
      return false
    },
  }),
]

// Returns `close` alongside the Transport because LSPClient.disconnect()
// (verified against node_modules/@codemirror/lsp-client/dist/index.js) only
// unsubscribes its message handler — it never touches the transport itself.
// Without an explicit close(), swapping the external-scheme client for a
// different root (see getTypeScriptLspClient below) would leak the old
// WebSocket connection, and on the proxy side, its bound tsserver-stdout
// listener along with it.
function createWebSocketTransport(url: string): { transport: Transport; close: () => void } {
  const socket = new WebSocket(url)
  const handlers = new Set<(value: string) => void>()
  const pending: string[] = []
  let open = false

  socket.addEventListener('open', () => {
    open = true
    for (const message of pending.splice(0)) socket.send(message)
  })
  socket.addEventListener('message', (e) => {
    for (const handler of handlers) handler(String(e.data))
  })

  return {
    transport: {
      send(message) {
        if (open) socket.send(message)
        else pending.push(message)
      },
      subscribe(handler) {
        handlers.add(handler)
      },
      unsubscribe(handler) {
        handlers.delete(handler)
      },
    },
    close: () => socket.close(),
  }
}

type ClientSlot = { client: LSPClient; close: () => void; root: LspRoot }

function sameRoot(a: LspRoot, b: LspRoot): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === 'self' || (b.kind === 'external' && a.root === b.root)
}

function createClientFor(root: LspRoot): ClientSlot {
  const scheme = schemeFor(root)
  const { transport, close } = createWebSocketTransport(LSP_WS_URL)
  const client = new LSPClient({
    rootUri: scheme.rootUri,
    extensions: languageServerExtensions(),
    workspace: (c) => new SleipnirWorkspace(c, scheme.pathForUri, scheme.readFile),
  })
  client.connect(transport)
  return { client, close, root }
}

// Two page-lifetime slots, not one: `self` (Sleipnir's own repo — created
// once, never evicted, exactly like the original single-client design) and
// `external` (whatever Workspace project is currently open — a single slot,
// swapped whenever a different root is requested). Two slots, not one shared
// slot, because App.tsx's secondary split pane can have Components
// (self-host) and Workspace (external) editors mounted simultaneously — a
// single "last requested root wins" cache would silently kill LSP in
// whichever pane's editor mounted second.
let selfSlot: ClientSlot | null = null
let externalSlot: ClientSlot | null = null

export function getTypeScriptLspClient(root: LspRoot): LSPClient {
  if (root.kind === 'self') {
    if (!selfSlot) selfSlot = createClientFor(root)
    return selfSlot.client
  }
  if (externalSlot && sameRoot(externalSlot.root, root)) return externalSlot.client
  if (externalSlot) {
    externalSlot.client.disconnect()
    externalSlot.close()
  }
  externalSlot = createClientFor(root)
  return externalSlot.client
}
