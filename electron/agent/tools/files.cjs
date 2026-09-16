// Workspace file tools — reading/listing/searching (read), and generate_code,
// which proposes whole-file writes as a change set (see ../changeSets.cjs).
const { withRoot } = require('../backend.cjs')
const changeSets = require('../changeSets.cjs')

const MAX_READ_CHARS = 120_000
const MAX_LIST_ENTRIES = 2_000
const MAX_SEARCH_MATCHES = 200

function flatten(tree, out = []) {
  for (const node of tree) {
    if (node.type === 'dir') flatten(node.children ?? [], out)
    else out.push(node.path)
  }
  return out
}

const readFile = {
  name: 'read_file',
  kind: 'read',
  description:
    'Read a file in the currently open Workspace project. Use this to inspect existing code before changing it with generate_code, or to answer questions about the project.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative path, no leading slash, e.g. "src/components/Button.tsx".' },
    },
    required: ['path'],
  },
  summarize: (input) => input?.path ?? '',
  async execute(input, ctx) {
    const p = changeSets.normalizePath(input.path)
    const { content } = await withRoot(ctx.workspaceRoot, (b) => b.readWorkspaceFile(p))
    return content.length > MAX_READ_CHARS
      ? { content: content.slice(0, MAX_READ_CHARS), truncated: true, totalChars: content.length }
      : { content }
  },
}

const listFiles = {
  name: 'list_files',
  kind: 'read',
  description:
    'List files in the open Workspace project (recursively, skipping node_modules, .git, build output). Pass a folder to narrow it down.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Optional workspace-relative folder, e.g. "src/components". Omit for the whole project.' },
    },
    required: [],
  },
  summarize: (input) => input?.path || '.',
  async execute(input, ctx) {
    const p = changeSets.normalizePath(input?.path)
    const { tree } = await withRoot(ctx.workspaceRoot, (b) => b.listWorkspaceDir(p))
    const files = flatten(tree)
    return files.length > MAX_LIST_ENTRIES
      ? { files: files.slice(0, MAX_LIST_ENTRIES), truncated: true, total: files.length }
      : { files }
  },
}

const searchWorkspace = {
  name: 'search_workspace',
  kind: 'read',
  description: 'Case-insensitive text search across the open Workspace project. Returns matching lines with their paths and line numbers.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Literal text to find (not a regex).' },
    },
    required: ['query'],
  },
  summarize: (input) => input?.query ?? '',
  execute: (input, ctx) =>
    withRoot(ctx.workspaceRoot, (b) => b.searchWorkspace(String(input.query ?? ''), { limit: MAX_SEARCH_MATCHES })),
}

const generateCode = {
  name: 'generate_code',
  kind: 'edit',
  description:
    'Write source files in the currently open Workspace project. Provide the FULL file content for every file in `files`, using paths relative to the Workspace root (e.g. "src/components/Button.tsx"). ' +
    'Works identically for editing an existing file or creating a brand-new one; missing folders are created. ' +
    'Depending on the permission mode the human reviews a diff and applies it, or it is applied immediately with an Undo. ' +
    'The result tells you which files were actually written.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative path (no leading slash), e.g. "src/components/Button.tsx".' },
            content: { type: 'string', description: 'The complete file content after the change.' },
          },
          required: ['path', 'content'],
        },
        description: 'One entry per file to write.',
      },
    },
    required: ['files'],
  },
  summarize: (input) => {
    const paths = (Array.isArray(input?.files) ? input.files : []).map((f) => f?.path).filter(Boolean)
    return paths.length <= 2 ? paths.join(', ') : `${paths.slice(0, 2).join(', ')} +${paths.length - 2} more`
  },

  // Headless sessions (Planning's builds) keep the original contract: hand the
  // files to the renderer via chat:codeGenerated and let it decide what to do
  // with them. Nothing is diffed or written here.
  async prepare(input, ctx) {
    if (ctx.mode === 'headless') return { headless: true }
    const changeSet = await changeSets.create({
      root: ctx.workspaceRoot,
      wcId: ctx.wcId,
      sessionId: ctx.sessionId,
      files: input.files,
    })
    return { changeSet, card: { changeSet } }
  },

  async execute(input, ctx, { prepared, decision }) {
    if (prepared?.headless) {
      const files = Array.isArray(input.files) ? input.files : []
      ctx.emit('chat:codeGenerated', { files })
      return { staged: true, fileCount: files.length }
    }
    const { applied, failed, changeSet } = await changeSets.apply(prepared.changeSet.id, decision?.paths)
    ctx.update({ changeSet })
    const skipped = changeSet.files.filter((f) => !f.applied).map((f) => f.path)
    return {
      written: applied,
      ...(skipped.length ? { not_written: skipped } : {}),
      ...(failed.length ? { failed } : {}),
    }
  },

  // Called instead of execute() when the human declines the change set.
  onDenied(_input, ctx, { prepared }) {
    if (prepared?.changeSet) ctx.update({ changeSet: changeSets.discard(prepared.changeSet.id) })
  },
}

module.exports = [readFile, listFiles, searchWorkspace, generateCode]
