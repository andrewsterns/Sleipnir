// Architecture tools — what /optimize starts from. Both run
// tools/architecture-health.mjs (the vendored analyze.mjs over graphCore.mjs,
// in a worker thread), so the agent reads the same numbers the Planning
// graph's Health view draws, and a terminal agent running
// `.sleipnir/analyze.mjs` gets them too. A report is a few thousand tokens
// whatever the project's size: the agent reads it instead of the source tree,
// then opens only the files a finding points at.
const path = require('node:path')
const { pathToFileURL } = require('node:url')

let healthLib = null
function lib() {
  if (!healthLib) {
    const file = path.join(__dirname, '..', '..', '..', 'tools', 'architecture-health.mjs')
    healthLib = import(pathToFileURL(file).href)
  }
  return healthLib
}

const analyzeArchitecture = {
  name: 'analyze_architecture',
  kind: 'read',
  description:
    "Map the open project's imports and report its architecture health: file and import counts, import loops (runtime only), imports pointing up the layers (a util importing a component), pages imported as libraries, heavy packages on the first load, hubs (most imported), files doing too much, barrels, misplaced and unused files, and hotspots (changed often, and big or widely imported). " +
    'Works for TypeScript/JavaScript, Python, Go and Rust. Each finding names files with their fan-in/fan-out. Start every /optimize here, then read only the files the findings point at. ' +
    'Set feature to scope the report to one feature ("right click menu", "checkout"): it lists the files that make it up, so you read those instead of searching. Set scope to a folder to list only its files (counts still include importers from anywhere).',
  inputSchema: {
    type: 'object',
    properties: {
      feature: { type: 'string', description: 'Optional: the feature to find, in the human’s words (e.g. "my right click menu").' },
      scope: { type: 'string', description: 'Optional: a folder (e.g. src/checkout) — list only files inside it.' },
      goal: { type: 'string', description: 'Optional: what the human wants improved (speed, load time, readability, fewer bugs) — echoed at the top of the report.' },
    },
    required: [],
  },
  summarize: (input) => input?.feature || input?.scope || 'whole project',
  async execute(input, ctx) {
    const { analyzeArchitecture: analyze } = await lib()
    const h = await analyze(ctx.workspaceRoot, { feature: input?.feature ?? '', scope: input?.scope ?? '', goal: input?.goal ?? '' })
    return { report: h.report }
  },
}

const describeFileArchitecture = {
  name: 'describe_file_architecture',
  kind: 'read',
  description:
    "One source file's place in the project: its role, fan-in and fan-out, what it imports (and whether statically, dynamically or type-only), who imports it, the packages it loads, and its blast radius — every file that depends on it, nearest first. Use before moving, splitting or deleting a file, to know what the change touches.",
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Project-relative path of a source file.' } },
    required: ['path'],
  },
  summarize: (input) => input?.path ?? '',
  async execute(input, ctx) {
    const { describeArchitectureFile } = await lib()
    return describeArchitectureFile(ctx.workspaceRoot, String(input.path ?? ''))
  },
}

module.exports = [analyzeArchitecture, describeFileArchitecture]
