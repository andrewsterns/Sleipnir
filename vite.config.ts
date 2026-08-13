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

        // Permanent delete — no OS Recycle Bin reachable from a browser dev
        // server. The Electron transport moves to the Recycle Bin instead
        // (electron/main.cjs's own sleipnir:deleteWorkspacePath handler),
        // bypassing this route entirely.
        if (url.pathname === '/api/sleipnir/workspace/delete-path' && req.method === 'POST') {
          try {
            const { path: relPath } = await readJsonBody(req)
            backend.deleteWorkspacePath(String(relPath ?? ''))
            sendJson(res, 200, { success: true })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/workspace/rename-path' && req.method === 'POST') {
          try {
            const { fromPath, toPath } = await readJsonBody(req)
            backend.renameWorkspacePath(String(fromPath ?? ''), String(toPath ?? ''))
            sendJson(res, 200, { success: true })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/workspace/copy-path' && req.method === 'POST') {
          try {
            const { fromPath, toPath } = await readJsonBody(req)
            backend.copyWorkspacePath(String(fromPath ?? ''), String(toPath ?? ''))
            sendJson(res, 200, { success: true })
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

        if (url.pathname === '/api/sleipnir/node-borrows' && req.method === 'POST') {
          try {
            const { nodeId, targetIds } = await readJsonBody(req)
            const result = backend.setNodeBorrows(String(nodeId ?? ''), Array.isArray(targetIds) ? targetIds.map(String) : [])
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/update-note' && req.method === 'POST') {
          try {
            const { id, patch } = await readJsonBody(req)
            sendJson(res, 200, { success: true, ...backend.updateNote(String(id ?? ''), patch ?? {}) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/delete-note' && req.method === 'POST') {
          try {
            const { id } = await readJsonBody(req)
            backend.deleteNote(String(id ?? ''))
            sendJson(res, 200, { success: true })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/node-stages' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...backend.getNodeStages() })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/node-stage' && req.method === 'POST') {
          try {
            const { id, stage } = await readJsonBody(req)
            const result = backend.setNodeStage(String(id ?? ''), stage ? String(stage) : null)
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/scaffold-nodes' && req.method === 'POST') {
          try {
            const { map, entries, links } = await readJsonBody(req)
            const result = backend.scaffoldNodes(
              String(map ?? ''),
              Array.isArray(entries) ? entries : [],
              Array.isArray(links) ? links : undefined,
            )
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
            const { label, nodeIds, assetPaths, assetEdges } = await readJsonBody(req)
            const result = backend.createPlan(
              String(label ?? ''),
              Array.isArray(nodeIds) ? nodeIds.map(String) : [],
              Array.isArray(assetPaths) ? assetPaths.map(String) : undefined,
              Array.isArray(assetEdges) ? assetEdges : undefined,
            )
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/plans/generated-files' && req.method === 'POST') {
          try {
            const { id, paths } = await readJsonBody(req)
            const result = backend.appendPlanGeneratedFiles(String(id ?? ''), Array.isArray(paths) ? paths.map(String) : [])
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/plans/nodes' && req.method === 'POST') {
          try {
            const { id, nodeIds } = await readJsonBody(req)
            const result = backend.addPlanNodes(String(id ?? ''), Array.isArray(nodeIds) ? nodeIds.map(String) : [])
            sendJson(res, 200, { success: true, ...result })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/delete-plan' && req.method === 'POST') {
          try {
            const { id, deleteFiles } = await readJsonBody(req)
            backend.deletePlan(String(id ?? ''), { deleteFiles: !!deleteFiles })
            sendJson(res, 200, { success: true })
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

        if (url.pathname === '/api/sleipnir/git/discard' && req.method === 'POST') {
          try {
            const { paths } = await readJsonBody(req)
            sendJson(res, 200, { success: true, ...(await backend.discardFiles(paths as string[])) })
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

        if (url.pathname === '/api/sleipnir/git/commit-graph' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...(await backend.getCommitGraph()) })
          } catch (e) {
            sendJson(res, 400, { success: false, error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        if (url.pathname === '/api/sleipnir/git/commit-files' && req.method === 'GET') {
          try {
            sendJson(res, 200, { success: true, ...(await backend.getCommitFileMap()) })
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

        if (url.pathname === '/api/sleipnir/git/rename-branch' && req.method === 'POST') {
          try {
            const { oldName, newName } = await readJsonBody(req)
            sendJson(res, 200, { success: true, ...(await backend.renameBranch(String(oldName ?? ''), String(newName ?? ''))) })
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
