import type { GraphData } from './types'

// Hand-authored: things that are planned but don't exist in the codebase yet.
// `edges[].target` should point at an existing node id (see generated/*.json)
// or another proposed id declared here. Partial/optional since a newly
// registered library has no hand-authored entry yet — combine.ts already
// falls back to an empty graph when a map has none.
export const PROPOSED: Partial<Record<string, GraphData>> = {
  research: {
    nodes: [
      {
        id: 'proposed/research/competitive-audit',
        label: 'Competitive Audit',
        kind: 'proposed',
        map: 'research',
        type: 'doc',
        description: 'Planned research doc surveying comparable tools. Not yet written.',
      },
    ],
    edges: [],
  },
  validation: {
    nodes: [
      {
        id: 'proposed/validation/e2e-suite',
        label: 'E2E Test Suite',
        kind: 'proposed',
        map: 'validation',
        type: 'doc',
        description: 'Planned Playwright end-to-end suite. Not yet implemented.',
      },
    ],
    edges: [],
  },
  // Cross-cutting project notes/tasks that aren't scoped to one map. No
  // edges here — a `todo` node describing e.g. dsm MVVM debt can't link to
  // the real dsm node id, since combine() only merges a map's generated
  // graph with that same map's PROPOSED entry, not across maps.
  todo: {
    nodes: [
      {
        id: 'todo/controls/Slider',
        label: 'Slider',
        kind: 'proposed',
        map: 'todo',
        type: 'molecule',
        description: 'Missing control. No Slider exists yet in 02_molecules.',
      },
      {
        id: 'todo/controls/Checkbox',
        label: 'Checkbox',
        kind: 'proposed',
        map: 'todo',
        type: 'molecule',
        description: 'Missing control. No Checkbox exists yet in 02_molecules.',
      },
      {
        id: 'todo/controls/Radio',
        label: 'Radio',
        kind: 'proposed',
        map: 'todo',
        type: 'molecule',
        description: 'Missing control. No Radio exists yet in 02_molecules.',
      },
      {
        id: 'todo/controls/Switch',
        label: 'Switch / Toggle',
        kind: 'proposed',
        map: 'todo',
        type: 'molecule',
        description: 'Missing control. No Switch/Toggle exists yet in 02_molecules.',
      },
      {
        id: 'todo/controls/TextInput',
        label: 'TextInput / TextField',
        kind: 'proposed',
        map: 'todo',
        type: 'molecule',
        description: 'Missing control. Raw <input> elements appear inline (CommandOverlay, Select) but there is no reusable TextInput/TextField molecule.',
      },
      {
        id: 'todo/controls/Avatar',
        label: 'Avatar',
        kind: 'proposed',
        map: 'todo',
        type: 'molecule',
        description: 'Missing control. No Avatar exists yet.',
      },
      {
        id: 'todo/mvvm/organisms',
        label: 'MVVM debt — organisms (14)',
        kind: 'proposed',
        map: 'todo',
        type: 'debt',
        description: 'Missing a ViewModel split: AlertEntry, ConfidenceBar, Footer, GlobeMap, GroupCard, Header, List, MenuCard, NavRail, StatusPanel, TarsPanel, ThreatAssessmentPanel, ThreatRow, UnitDetailPanel.',
      },
      {
        id: 'todo/mvvm/molecules',
        label: 'MVVM debt — molecules (9)',
        kind: 'proposed',
        map: 'todo',
        type: 'debt',
        description: 'Missing a ViewModel split: Button, Card, Chip, DataReadout, DataTag, NotificationFeed, ProgressBar, SignalBar, StatusBadge.',
      },
      {
        id: 'todo/mvvm/atoms',
        label: 'MVVM debt — atoms (3)',
        kind: 'proposed',
        map: 'todo',
        type: 'debt',
        description: 'Missing a ViewModel split: Icon, Logo, Text.',
      },
      {
        id: 'todo/scaffold/new-atom-stub',
        label: 'NewAtom scaffold stub',
        kind: 'proposed',
        map: 'todo',
        type: 'debt',
        description: '01_atoms/NewAtom is an empty leftover test scaffold (empty props, empty ViewModel, empty div) — finish it into a real component or delete it.',
      },
      {
        id: 'todo/planning/kanban-view',
        label: 'Kanban view for Planning',
        kind: 'proposed',
        map: 'todo',
        type: 'feature',
        description: 'Todo / in-progress / done column layout as an alternate view of graph nodes.',
      },
      {
        id: 'todo/planning/task-assignment',
        label: 'Assign nodes to people',
        kind: 'proposed',
        map: 'todo',
        type: 'feature',
        description: 'Attach an owner/assignee to a node so tasks can be delegated and filtered by person.',
      },
      {
        id: 'todo/library/left-rail-minimize',
        label: 'Minimize the left railing/lists',
        kind: 'proposed',
        map: 'todo',
        type: 'feature',
        description: 'Add a collapse/minimize affordance to the left rail/list panes — no such control exists today in LeftRailingView.tsx.',
      },
      {
        id: 'todo/node-view/everywhere',
        label: 'Decision: node view on every rail page?',
        kind: 'proposed',
        map: 'todo',
        type: 'decision',
        description: "Open question: should the node-graph view (plus new Kanban/checklist views) become a view-mode switcher available on every NavRail page's top-right, replacing Planning's map tabs with Planning becoming just the isolated TODO tab — or should the current Planning-only graph stay as-is? Depends on Kanban and task assignment landing first. Not resolved yet — revisit once those exist.",
      },
      {
        id: 'todo/planning/unify-graph',
        label: 'Unify Planning into one searchable graph',
        kind: 'proposed',
        map: 'todo',
        type: 'feature',
        description: "Accepted direction (confirmed with the user, not yet built): Planning drops its hard map-tabs (DSM/Prototypes/Research/Validation/TODO as mutually-exclusive views) in favor of one holistic, searchable graph of the whole project — built and proposed nodes together, narrowed by filter chips (area/tier/built-vs-proposed) and free-text search instead of exclusive tabs. GraphNode.map already exists as a per-node facet and generate-graph.mjs already pulls cross-map nodes in (prototypes importing dsm components), so the data model mostly supports this already — the work is a 'merge all maps' mode in combine.ts plus filter/search UI in PlanningView and GraphCanvas.",
      },
      {
        id: 'todo/future/node-color-customization',
        label: 'Node color customization',
        kind: 'proposed',
        map: 'todo',
        type: 'idea',
        description: 'Per-node color customization in the graph view.',
      },
      {
        id: 'todo/future/node-typography-size',
        label: 'Resizable node typography',
        kind: 'proposed',
        map: 'todo',
        type: 'idea',
        description: 'Resizable node label typography in the graph view.',
      },
      {
        id: 'todo/future/node-size',
        label: 'Adjustable node size',
        kind: 'proposed',
        map: 'todo',
        type: 'idea',
        description: 'Adjustable node circle size in the graph view.',
      },
      {
        id: 'todo/future/hash-linking',
        label: '# linking between nodes',
        kind: 'proposed',
        map: 'todo',
        type: 'idea',
        description: 'Use "#" syntax in node notes/descriptions to link to other nodes.',
      },
      {
        id: 'todo/future/at-linking',
        label: '@ linking to people',
        kind: 'proposed',
        map: 'todo',
        type: 'idea',
        description: 'Use "@" syntax in node notes/descriptions to link to specific people (pairs with task-assignment).',
      },
      {
        id: 'todo/future/app-theme-customization',
        label: 'App-wide theme customization (light/dark)',
        kind: 'proposed',
        map: 'todo',
        type: 'idea',
        description: 'User-facing light/dark (and other) theme switcher. The CSS/ThemeProvider mechanism already exists (00_themes/: default, dark, houseplant, tactical + ThemeProvider.tsx) — the switcher UI does not.',
      },
      {
        id: 'todo/future/ide-code-customization',
        label: 'IDE code customization',
        kind: 'proposed',
        map: 'todo',
        type: 'idea',
        description: 'Customization of IDE code appearance/behavior. Scope to be defined later.',
      },
      {
        id: 'todo/future/multi-language-dsm',
        label: 'Multi-language DSM/prototype support',
        kind: 'proposed',
        map: 'todo',
        type: 'idea',
        description: 'DSM, component library, and prototype library should be able to represent components in any language, not just the <Frame>-based TSX system.',
      },
    ],
    edges: [],
  },
  // Always empty — `claude` nodes only ever come from the AI chat's
  // create_plan_node tool call, persisted at runtime into notes.json (same
  // mechanism as `todo`'s notes, see tools/sleipnir-backend.mjs).
  claude: { nodes: [], edges: [] },
  // The default landing tab (see graph/types.ts's getGraphMaps) — a real,
  // working example component plus a few plain guide nodes explaining what
  // the other tabs are for. Hand-authored here rather than in notes.json
  // since it's shipped, permanent seed content, not something a user (or
  // the AI) creates at runtime.
  welcome: {
    nodes: [
      {
        id: 'welcome/guide/workspace',
        label: 'What is Workspace?',
        kind: 'proposed',
        map: 'welcome',
        type: 'guide',
        description: 'Open any folder on disk as your Workspace (the folder icon in the rail) — that becomes your project. Create, edit, and organize files there like any other IDE.',
      },
      {
        id: 'welcome/guide/planning',
        label: 'What is Planning?',
        kind: 'proposed',
        map: 'welcome',
        type: 'guide',
        description: 'This graph view maps your whole project — plan steps, research docs, and TODOs — as one connected picture instead of scattered files. Each tab above is a different "map" of the same project.',
      },
      {
        id: 'welcome/guide/ai',
        label: 'What is the AI tab?',
        kind: 'proposed',
        map: 'welcome',
        type: 'guide',
        description: 'Ask the AI Chat panel (bottom-right) to plan something, and it drafts step nodes here for you to review and approve individually. Approved steps generate code straight into your open Workspace — nothing gets written until you say so.',
      },
      {
        id: 'welcome/guide/research',
        label: 'What is Research?',
        kind: 'proposed',
        map: 'welcome',
        type: 'guide',
        description: 'Drop .md files under src/01_research/ and they show up here automatically — user research, personas, proposals, anything that informs a decision but isn\'t code.',
      },
    ],
    // Hub-and-spoke: every guide node connects to the Workspace guide node,
    // so the tab reads as one connected picture on first open instead of
    // isolated dots — same "borrows" edge kind used everywhere else (see
    // graph/types.ts's GraphEdge), even though these are guide notes rather
    // than real import relationships.
    edges: [
      { source: 'welcome/guide/planning', target: 'welcome/guide/workspace', kind: 'borrows' },
      { source: 'welcome/guide/ai', target: 'welcome/guide/workspace', kind: 'borrows' },
      { source: 'welcome/guide/research', target: 'welcome/guide/workspace', kind: 'borrows' },
    ],
  },
}
