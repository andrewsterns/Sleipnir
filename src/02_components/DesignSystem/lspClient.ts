import { LSPClient, languageServerExtensions, type Transport } from '@codemirror/lsp-client'

// Must match tools/lsp-proxy.mjs's FAKE_ROOT_URI exactly — the proxy
// rewrites this to the real absolute repo path server-side, since the
// browser has no way to know that path itself.
const FAKE_ROOT_URI = 'file:///__SLEIPNIR_ROOT__'
const LSP_WS_URL = 'ws://localhost:7071'

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

export function uriForPath(srcRelativePath: string): string {
  return `${FAKE_ROOT_URI}/src/${srcRelativePath}`
}

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
    })
    client.connect(createWebSocketTransport(LSP_WS_URL))
  }
  return client
}
