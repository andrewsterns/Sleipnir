// Canvas tools — what the in-app agent's /frame and /component do. Both build
// through tools/agentSkills/vendor/canvas.mjs, the same file projects get as
// `.sleipnir/canvas.mjs`, so a design made here and one made by a terminal
// agent are the same board content. The board reloads live (the planning
// watcher); a component request is finished by the open Canvas, which owns the
// emitters and writes the code into .components/.
const path = require('node:path')
const { pathToFileURL } = require('node:url')

let canvasLib = null
function lib() {
  if (!canvasLib) {
    const file = path.join(__dirname, '..', '..', '..', 'tools', 'agentSkills', 'vendor', 'canvas.mjs')
    canvasLib = import(pathToFileURL(file).href)
  }
  return canvasLib
}

const SPEC_DESCRIPTION =
  'The design as ONE JSON object — the root frame. Nodes: type ("frame" default | "text" | "rect" | "ellipse" | "triangle" | "polygon" | "image"), name, w/h (px, "fill" or "hug"). ' +
  'Frames: layout ("vertical" | "horizontal" | "grid" | "free"), gap, padding (px, [v,h] or [t,r,b,l]), align ("start"|"center"|"end"|"stretch"), justify ("start"|"center"|"end"|"between"|"around"), wrap, cols, children. x/y only inside "free" layouts. ' +
  'Paint: fill ("#hex" or theme token bg-1 bg-2 bg-3 text-1 text-2 text-3 border-1 border-2), gradient {angle, stops:["#a","#b"]}, stroke ("#hex" or {color,width}), radius, opacity, shadow (true or {x,y,blur,color,opacity}), rotate, margin, clip. ' +
  'Text: text, size, weight, color, align, mono, lineHeight. Image: src (workspace path like .components/assets/x.png, or https: URL), fit ("cover"|"contain"). ' +
  'Prefer stacks (layout vertical/horizontal) with gap and padding over free positioning — they become real flex layouts in the code.'

const buildFrame = {
  name: 'canvas_build',
  kind: 'edit',
  description:
    "Design onto the open project's Canvas board — what /frame and /component mean. Builds one root frame (with nested frames, text, shapes and images) from a JSON spec and adds it beside what's on the board, where the human sees it live. " +
    'Set component (a PascalCase name) for /component: Sleipnir then turns the frame into a component and writes its React code into .components/<name>/. Set svg with component for an SVG component (vector shapes only — rect, ellipse, triangle, polygon). ' +
    'Without component it stays a design on the board (/frame) that the human can refine and turn into code later.',
  inputSchema: {
    type: 'object',
    properties: {
      spec: { type: 'object', description: SPEC_DESCRIPTION },
      component: { type: 'string', description: 'Optional: make the result a component with this PascalCase name (for /component).' },
      svg: { type: 'boolean', description: 'Optional, with component: an SVG component instead of a div one.' },
      board: { type: 'string', description: 'Optional: board name or id. Default: the board edited most recently (the open one).' },
    },
    required: ['spec'],
  },
  summarize: (input) => input?.component ?? input?.spec?.name ?? 'frame',
  async execute(input, ctx) {
    const { buildOnBoard } = await lib()
    return buildOnBoard(ctx.workspaceRoot, {
      spec: input.spec,
      board: input.board,
      component: input.component || undefined,
      svg: !!input.svg,
    })
  },
}

const listBoards = {
  name: 'canvas_list_boards',
  kind: 'read',
  description: "List the project's Canvas boards (id, name, layer count), most recently edited first.",
  inputSchema: { type: 'object', properties: {}, required: [] },
  summarize: () => '',
  async execute(_input, ctx) {
    const { listBoards: list } = await lib()
    return list(ctx.workspaceRoot)
  },
}

module.exports = [buildFrame, listBoards]
