// The one list of tools the agent can call. Built-in tools live beside this
// file; other sources (MCP servers, later) register a provider function that
// returns their current tools for a given context.
//
// A tool is:
//   {
//     name, description, inputSchema,            JSON Schema for the input
//     kind: 'read' | 'edit' | 'exec' | 'external',   see ../permissions.cjs
//     alwaysAsk?, allowInPlan?,
//     summarize?(input)          one short line for the chat row
//     ruleKey?(input)            narrows an "Always allow" rule
//     prepare?(input, ctx)       runs before the permission prompt; its
//                                `card` is shown on the approval card
//     execute(input, ctx, { prepared, decision })
//     onDenied?(input, ctx, { prepared })
//   }
const { isOffered } = require('../permissions.cjs')

const BUILTIN = [
  ...require('./planning.cjs'),
  ...require('./files.cjs'),
  ...require('./command.cjs'),
]

// name -> (ctx) => tool[]
const sources = new Map()

function registerSource(name, listFn) {
  sources.set(name, listFn)
}

function unregisterSource(name) {
  sources.delete(name)
}

async function allTools(ctx) {
  const extra = []
  for (const listFn of sources.values()) {
    try {
      extra.push(...((await listFn(ctx)) ?? []))
    } catch {
      // One misbehaving source must not take the built-in tools down with it.
    }
  }
  // Built-ins win a name clash — an MCP server can't shadow read_file.
  const seen = new Set()
  const out = []
  for (const tool of [...BUILTIN, ...extra]) {
    if (seen.has(tool.name)) continue
    seen.add(tool.name)
    out.push(tool)
  }
  return out
}

// Tools offered to the model in this mode, plus a by-name lookup for dispatch.
async function toolsFor(ctx) {
  const tools = (await allTools(ctx)).filter((t) => isOffered(ctx.mode, t) && (!ctx.exclude || !ctx.exclude.has(t.name)))
  return { tools, byName: new Map(tools.map((t) => [t.name, t])) }
}

// The provider-neutral shape each chatProviders/*.cjs translates.
function toDefs(tools) {
  return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
}

module.exports = { registerSource, unregisterSource, toolsFor, toDefs, BUILTIN }
