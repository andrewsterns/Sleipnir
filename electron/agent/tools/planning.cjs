// Planning-graph tools — create_plan_node and detect_project. Both only ever
// write plan METADATA (.planning/*.json), never source files; that's why
// create_plan_node stays usable in Plan mode (allowInPlan).
const { withRoot } = require('../backend.cjs')

const createPlanNode = {
  name: 'create_plan_node',
  kind: 'edit',
  allowInPlan: true,
  description:
    "Create one step of a plan the user asked for. Call this once per step — each call shows up as a node in Sleipnir's Planning > AI tab for the user to review and approve individually. Use the SAME plan_id for every step of one plan so they group together in the graph.",
  inputSchema: {
    type: 'object',
    properties: {
      plan_id: { type: 'string', description: 'Same value for every step in this plan — a short slug, e.g. "hamburger-menu".' },
      label: { type: 'string', description: 'Short step title, e.g. "HamburgerMenu component".' },
      description: { type: 'string', description: 'One or two sentences of detail for this step.' },
      parent_id: {
        type: 'string',
        description: 'Optional: the node id returned by a previous create_plan_node call in this same plan, to link this step under it.',
      },
      after: {
        type: 'string',
        description: 'Optional: steps are ordered in creation order by default. Pass a previous step id to insert this step after it, or "none" for work that runs in parallel.',
      },
      files: {
        type: 'array',
        description:
          "Optional: NEW files this step will create, at their real project paths (never under .planning/, never an existing file). Placeholders only — Sleipnir writes them when the user approves the step. Name sibling role files <name><Role> (cartView.tsx, cartViewModel.tsx) so they are linked. Call detect_project first to match the project's language.",
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative path, e.g. "src/features/cart/cartView.tsx".' },
            role: { type: 'string', enum: ['node', 'view', 'view-model', 'interface', 'controller', 'presenter'] },
            language: { type: 'string', enum: ['react', 'typescript', 'javascript', 'jquery', 'python', 'rust', 'go', 'html', 'css'] },
          },
          required: ['path'],
        },
      },
      edits: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: EXISTING workspace-relative files this step will change.',
      },
    },
    required: ['plan_id', 'label'],
  },
  summarize: (input) => input?.label ?? '',
  async execute(input, ctx) {
    const files = Array.isArray(input.files) ? input.files : []
    const { node, planned } = await withRoot(ctx.workspaceRoot, (b) =>
      b.createPlanNode(input.plan_id, input.label, input.description, input.parent_id, {
        after: input.after,
        files,
        edits: Array.isArray(input.edits) ? input.edits : [],
        defaultLanguage: files.length ? b.detectProject().primary ?? undefined : undefined,
      }),
    )
    ctx.emit('chat:planNodeCreated', node)
    ctx.notePlanNode?.(node)
    return { created: true, node_id: node.id, planned_file_ids: (planned ?? []).map((p) => p.id) }
  },
}

const detectProject = {
  name: 'detect_project',
  kind: 'read',
  description:
    "Report the open project's languages and layout (primary language, detected manifests, unsupported languages, src folder). Call before planning so planned files match the codebase.",
  inputSchema: { type: 'object', properties: {}, required: [] },
  summarize: () => '',
  execute: (_input, ctx) => withRoot(ctx.workspaceRoot, (b) => b.detectProject()),
}

module.exports = [createPlanNode, detectProject]
