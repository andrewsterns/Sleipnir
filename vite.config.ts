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
      startLspProxy(7081)
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost')

        if (url.pathname === '/api/sleipnir/scaffold-component' && req.method === 'POST') {
          try {
            const { name, tier, language, parts, libraryId } = await readJsonBody(req)
            const result = backend.scaffoldComponent(
              String(name ?? ''),
              String(tier ?? ''),
              language ? String(language) : undefined,
              Array.isArray(parts) ? parts.map(String) : undefined,
              libraryId ? String(libraryId) : undefined,
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

        if (url.pathname === '/api/sleipnir/create-library' && req.method === 'POST') {
          try {
            const { id, kind, label, architecture, language } = await readJsonBody(req)
            const result = backend.createLibrary({
              id: String(id ?? ''),
              kind: String(kind ?? ''),
              label: String(label ?? ''),
              architecture: String(architecture ?? ''),
              language: String(language ?? ''),
            })
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/libraries' && req.method === 'GET') {
          try {
            const kind = url.searchParams.get('kind') || undefined
            const result = backend.getLibraries(kind)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/remove-library' && req.method === 'POST') {
          try {
            const { id } = await readJsonBody(req)
            const result = backend.removeLibrary(String(id ?? ''))
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/delete-library' && req.method === 'POST') {
          try {
            const { id } = await readJsonBody(req)
            const result = backend.deleteLibrary(String(id ?? ''))
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/widgets' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...backend.getWidgets() })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/install-widget' && req.method === 'POST') {
          try {
            const input = await readJsonBody(req)
            const result = backend.installWidget(input)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/widget-catalog' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...backend.getWidgetCatalog() })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
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

        if (url.pathname === '/api/sleipnir/list-repo-dir' && req.method === 'GET') {
          try {
            const relPath = url.searchParams.get('path') ?? ''
            const extraFiles = url.searchParams.getAll('extraFiles')
            sendJson(res, 200, { success: true, ...backend.listRepoDir(relPath, extraFiles) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/read-repo-file' && req.method === 'GET') {
          try {
            const relPath = url.searchParams.get('path') ?? ''
            sendJson(res, 200, { success: true, ...backend.readRepoFile(relPath) })
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

        if (url.pathname === '/api/sleipnir/write-repo-file' && req.method === 'POST') {
          try {
            const { path: relPath, content } = await readJsonBody(req)
            backend.writeRepoFile(String(relPath ?? ''), String(content ?? ''))
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

        if (url.pathname === '/api/sleipnir/workspace/info' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...backend.getWorkspaceInfo() })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/workspace/list-dir' && req.method === 'GET') {
          try {
            const relPath = url.searchParams.get('path') ?? ''
            sendJson(res, 200, { success: true, ...backend.listWorkspaceDir(relPath) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/workspace/read-file' && req.method === 'GET') {
          try {
            const relPath = url.searchParams.get('path') ?? ''
            sendJson(res, 200, { success: true, ...backend.readWorkspaceFile(relPath) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/workspace/write-file' && req.method === 'POST') {
          try {
            const { path: relPath, content } = await readJsonBody(req)
            backend.writeWorkspaceFile(String(relPath ?? ''), String(content ?? ''))
            sendJson(res, 200, { success: true })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/workspace/create-file' && req.method === 'POST') {
          try {
            const { path: relPath, content } = await readJsonBody(req)
            backend.createWorkspaceFile(String(relPath ?? ''), content !== undefined ? String(content) : undefined)
            sendJson(res, 200, { success: true })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/workspace/create-dir' && req.method === 'POST') {
          try {
            const { path: relPath } = await readJsonBody(req)
            backend.createWorkspaceDir(String(relPath ?? ''))
            sendJson(res, 200, { success: true })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/search-repo' && req.method === 'GET') {
          try {
            const query = url.searchParams.get('query') ?? ''
            const limit = url.searchParams.get('limit')
            const result = backend.searchRepo(query, limit ? { limit: Number(limit) } : undefined)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/search-workspace' && req.method === 'GET') {
          try {
            const query = url.searchParams.get('query') ?? ''
            const limit = url.searchParams.get('limit')
            const result = backend.searchWorkspace(query, limit ? { limit: Number(limit) } : undefined)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/list-repo-tree' && req.method === 'GET') {
          try {
            const result = backend.listRepoTree()
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/import-path' && req.method === 'POST') {
          try {
            const { sourceAbsolutePath, destRepoRelativeDir } = await readJsonBody(req)
            const result = backend.importPath(String(sourceAbsolutePath ?? ''), String(destRepoRelativeDir ?? ''))
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/detect-preview-config' && req.method === 'GET') {
          try {
            const relPath = url.searchParams.get('path') ?? ''
            const result = backend.detectPreviewConfig(relPath)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/preview-config' && req.method === 'GET') {
          try {
            const relPath = url.searchParams.get('path') ?? ''
            const result = backend.getPreviewConfig(relPath)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/preview-config' && req.method === 'POST') {
          try {
            const { path: relPath, config } = await readJsonBody(req)
            const result = backend.setPreviewConfig(String(relPath ?? ''), config)
            sendJson(res, 200, { success: true, ...result })
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

        if (url.pathname === '/api/sleipnir/plan-node' && req.method === 'POST') {
          try {
            const { planId, label, description, parentId } = await readJsonBody(req)
            const result = backend.createPlanNode(
              String(planId ?? ''),
              String(label ?? ''),
              description ? String(description) : undefined,
              parentId ? String(parentId) : undefined,
            )
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/node-status' && req.method === 'POST') {
          try {
            const { id, status } = await readJsonBody(req)
            const result = backend.setNodeStatus(String(id ?? ''), String(status ?? ''))
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/open-file-node' && req.method === 'POST') {
          try {
            const { path: relPath, label } = await readJsonBody(req)
            const result = backend.openFileNode(String(relPath ?? ''), label ? String(label) : undefined)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/plans' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...backend.getPlans() })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/plans' && req.method === 'POST') {
          try {
            const { label, nodeIds } = await readJsonBody(req)
            const result = backend.createPlan(String(label ?? ''), Array.isArray(nodeIds) ? nodeIds.map(String) : [])
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/delete-plan' && req.method === 'POST') {
          try {
            const { id } = await readJsonBody(req)
            backend.deletePlan(String(id ?? ''))
            sendJson(res, 200, { success: true })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/refactor/preview' && req.method === 'POST') {
          try {
            const { architecture, libraryId } = await readJsonBody(req)
            const result = backend.previewRefactor(String(architecture ?? ''), libraryId ? String(libraryId) : undefined)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/refactor/apply' && req.method === 'POST') {
          try {
            const { architecture, libraryId } = await readJsonBody(req)
            const result = await backend.applyRefactor(String(architecture ?? ''), libraryId ? String(libraryId) : undefined)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/refactor/current' && req.method === 'GET') {
          try {
            const libraryId = url.searchParams.get('libraryId') || undefined
            sendJson(res, 200, { success: true, ...backend.getCurrentArchitecture(libraryId) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/status' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...(await backend.getGitStatus()) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/diff' && req.method === 'GET') {
          try {
            const filePath = url.searchParams.get('path') || ''
            const staged = url.searchParams.get('staged') === '1'
            sendJson(res, 200, { success: true, ...(await backend.getGitDiff(filePath, staged)) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/stage' && req.method === 'POST') {
          try {
            const { paths } = await readJsonBody(req)
            sendJson(res, 200, { success: true, ...(await backend.stageFiles(paths as string[])) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/unstage' && req.method === 'POST') {
          try {
            const { paths } = await readJsonBody(req)
            sendJson(res, 200, { success: true, ...(await backend.unstageFiles(paths as string[])) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/commit' && req.method === 'POST') {
          try {
            const { message } = await readJsonBody(req)
            sendJson(res, 200, { success: true, ...(await backend.commitChanges(String(message ?? ''))) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/branches' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, branches: await backend.getBranches() })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/branch-tree' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...(await backend.getBranchTree()) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/checkout' && req.method === 'POST') {
          try {
            const { name } = await readJsonBody(req)
            sendJson(res, 200, { success: true, ...(await backend.checkoutBranch(String(name ?? ''))) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/create-branch' && req.method === 'POST') {
          try {
            const { name } = await readJsonBody(req)
            sendJson(res, 200, { success: true, ...(await backend.createBranch(String(name ?? ''))) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/push' && req.method === 'POST') {
          try {
            sendJson(res, 200, { success: true, ...(await backend.gitPush()) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/pull' && req.method === 'POST') {
          try {
            sendJson(res, 200, { success: true, ...(await backend.gitPull()) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/fetch' && req.method === 'POST') {
          try {
            sendJson(res, 200, { success: true, ...(await backend.gitFetch()) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/identity' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...(await backend.getGitIdentity()) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/identity' && req.method === 'POST') {
          try {
            const { name, email } = await readJsonBody(req)
            sendJson(res, 200, { success: true, ...(await backend.setGitIdentity(String(name ?? ''), String(email ?? ''))) })
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
    // Dedicated to this "Copy" checkout so it never collides with a sibling
    // Sleipnir folder's dev server (fixed ports, both default to 5173/7071).
    port: 5183,
    strictPort: true,
    watch: {
      // preview-config.json is never statically imported by any frontend
      // module (the renderer only ever reads it live via getPreviewConfig/
      // detectPreviewConfig) — but Vite's watcher still notices writes to it
      // and, finding no HMR-acceptable module to update, falls back to a
      // full page reload. That's catastrophic specifically for this file:
      // launching a preview writes it, so every successful Play would
      // reload the whole app and wipe the just-shown preview UI (the
      // spawned process itself survives in electron/preview.cjs's own
      // process-level state — only the renderer's view of it gets lost).
      ignored: ['**/.nx/**', '**/src/00_planning/graph/preview-config.json'],
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
