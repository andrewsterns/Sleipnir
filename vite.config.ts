/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ServerResponse } from 'node:http'
import type { Connect, ViteDevServer } from 'vite'
import * as backend from './tools/sleipnir-backend.mjs'
import { startLspProxy } from './tools/lsp-proxy.mjs'

// ─── Sleipnir local API (dev server only — never part of the production build) ──
// Backs the in-app "create component" flow, file browsing/reading, and the
// archive manifest. All the actual filesystem logic lives in
// tools/sleipnir-backend.mjs (shared with electron/main.cjs) — this plugin
// is just the HTTP request/response glue on top of it.

function readJsonBody(req: Connect.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) }
      catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = status
  res.end(JSON.stringify(data))
}

function sleipnirApiPlugin() {
  return {
    name: 'sleipnir-api',
    configureServer(server: ViteDevServer) {
      startLspProxy()
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost')

        if (url.pathname === '/api/sleipnir/scaffold-component' && req.method === 'POST') {
          try {
            const { name, tier, language, parts } = await readJsonBody(req)
            const result = backend.scaffoldComponent(
              String(name ?? ''),
              String(tier ?? ''),
              language ? String(language) : undefined,
              Array.isArray(parts) ? parts.map(String) : undefined,
            )
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/regenerate-graph' && req.method === 'POST') {
          try {
            const result = await backend.regenerateGraph()
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 500, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/read-file' && req.method === 'GET') {
          try {
            const relPath = url.searchParams.get('path') ?? ''
            sendJson(res, 200, { success: true, ...backend.readFile(relPath) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/list-dir' && req.method === 'GET') {
          try {
            const relPath = url.searchParams.get('path') || '02_components'
            sendJson(res, 200, { success: true, ...backend.listDir(relPath) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/write-file' && req.method === 'POST') {
          try {
            const { path: relPath, content } = await readJsonBody(req)
            backend.writeFile(String(relPath ?? ''), String(content ?? ''))
            sendJson(res, 200, { success: true })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/create-file' && req.method === 'POST') {
          try {
            const { path: relPath, content } = await readJsonBody(req)
            backend.createFile(String(relPath ?? ''), String(content ?? ''))
            sendJson(res, 200, { success: true })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/create-dir' && req.method === 'POST') {
          try {
            const { path: relPath } = await readJsonBody(req)
            backend.createDir(String(relPath ?? ''))
            sendJson(res, 200, { success: true })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/archive' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...backend.getArchivedPaths() })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/archive' && req.method === 'POST') {
          try {
            const { path: relPath, archived, label } = await readJsonBody(req)
            const result = backend.setArchived(String(relPath ?? ''), Boolean(archived), label ? String(label) : undefined)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/notes' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...backend.getNotes() })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/run-script' && req.method === 'POST') {
          try {
            const { path: relPath } = await readJsonBody(req)
            const result = await backend.runScript(String(relPath ?? ''))
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/notes' && req.method === 'POST') {
          try {
            const { map, label, description } = await readJsonBody(req)
            const result = backend.addNote(String(map ?? ''), String(label ?? ''), description ? String(description) : undefined)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/refactor/preview' && req.method === 'POST') {
          try {
            const { architecture } = await readJsonBody(req)
            const result = backend.previewRefactor(String(architecture ?? ''))
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/refactor/apply' && req.method === 'POST') {
          try {
            const { architecture } = await readJsonBody(req)
            const result = await backend.applyRefactor(String(architecture ?? ''))
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/refactor/current' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...backend.getCurrentArchitecture() })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    sleipnirApiPlugin(),
  ],
  server: {
    watch: {
      ignored: ['**/.nx/**'],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/04_validation/setup.ts'],
    exclude: ['node_modules/**', '.claude/**'],
    server: {
      deps: {
        inline: [/@csstools/, /@asamuzakjp/],
      },
    },
  },
})
