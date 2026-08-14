import { LSPClient, languageServerExtensions, Workspace, LSPPlugin, jumpToDefinition, type Transport, type WorkspaceFile } from '@codemirror/lsp-client'
import { Text, type TransactionSpec, type ChangeSet } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { readRepoFile } from '../../00_planning/api/sleipnirApi'

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

// Takes an already REPO_ROOT-relative path — callers are responsible for
// getting there (see CodeEditorView.ViewModel's repoRelativePathForScope,
// ROADMAP.md's Phase 1). Used to hardcode a "/src/" prefix here, which was
// correct only for scope:'src' callers and silently produced wrong/doubled
// paths for scope:'repo' files outside a registered component library
// (e.g. vite.config.ts opened via File > Open).
export function uriForPath(repoRelativePath: string): string {
  return `${FAKE_ROOT_URI}/${repoRelativePath}`
}

// Inverse of uriForPath — recovers a REPO_ROOT-relative path from a
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

// Bridges this plain (non-React) module to App.tsx's openFile() routing
// (Components vs Open Files) — registered once from an App.tsx effect. Lets
// SleipnirWorkspace actually bring a not-yet-open file's tab to front for a
// cross-file LSP navigation or rename, which the library's default
// Workspace has no hook for at all (ROADMAP.md's Phase 1 — the fix for
// "go-to-definition/rename only work for already-open tabs").
type LspFileOpener = (repoRelativePath: string) => void
let lspFileOpener: LspFileOpener | null = null
export function registerLspFileOpener(handler: LspFileOpener) {
  lspFileOpener = handler
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

    const path = repoRelativePathForUri(uri)
    if (path == null || !lspFileOpener) {
      console.info(`[lsp] can't display ${uri} — outside the repo, or no file-opener registered yet`)
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
    const path = repoRelativePathForUri(uri)
    if (path == null) return null
    try {
      const { content } = await readRepoFile(path)
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
    const path = repoRelativePathForUri(uri)
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

function createWebSocketTransport(url: string): Transport {
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
  }
}

// Page-lifetime singleton — one connection, one server process, shared by
// every open TS/JS file (LSP servers are natively multi-file per session).
let client: LSPClient | null = null

export function getTypeScriptLspClient(): LSPClient {
  if (!client) {
    client = new LSPClient({
      rootUri: FAKE_ROOT_URI,
      extensions: languageServerExtensions(),
      workspace: (c) => new SleipnirWorkspace(c),
    })
    client.connect(createWebSocketTransport(LSP_WS_URL))
  }
  return client
}
