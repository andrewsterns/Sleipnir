# Project Architecture: Directory Map

The short directory map for agents; see the root [`ARCHITECTURE.md`](../ARCHITECTURE.md)
for the full technical architecture (transport parity, feature folders and
load rules, the planning graph, the AI agent's tool-use loop). Note:
`ARCHITECTURE.md` §5–6 documents a library/widget registry that was designed
but never implemented — don't assume it exists.

## Directory structure
- `.agent/` — Conventions, rules, and system mandates (this directory).
- `src/planning/` — The Planning graph: plan tabs, architecture and Health views, agent trail, skills.
- `src/document/` — The scene document (2D + 3D) both editors share. Pure, imports no feature.
- `src/canvas/` — The Canvas editor: boards, panels, code emit, board files (`io/`) and the editor's hooks.
- `src/modeling/` — 3D: `scene3d/`, `geometry/`, `viewport/`. Imports only `document/` and `utils/`.
- `src/source-control/` — Git status/diff/commit/branches and push/pull/fetch, host-agnostic.
- `src/validation/` — The Validation view and Vitest's `setup.ts`.
- `src/platform/` — The transport-neutral API every feature calls (`PlatformAPI`, `sleipnirApi`).
- `src/app/` — The application shell (nav rail, title bar, docks, AI chat, terminal, editor) and `UIKit/` primitives.
- `src/themes/`, `src/keybindings/`, `src/utils/` — App-wide support.
- `tools/` — Shared Node backend (filesystem, planning store, git, skills) that both the Electron and web dev-server transports call into identically.
- `electron/` — Electron main process, IPC handlers, and the Electron-only features (real terminal, AI chat orchestration, encrypted API key storage, native dialogs).

## Key boundaries
1. **Features don't reach into each other's internals:** they share `platform/`, `app/UIKit/` and `utils/`.
2. **Heavy packages stay lazy:** three.js, CodeMirror and xterm never load on the first paint (`src/app/firstLoadBudget.test.ts`).
3. **`generate_code` never writes to disk; `run_command` never runs unconfirmed:** The AI agent's code-generation tool always stages content in an editor tab for human review/save, and its command-execution tool blocks on an explicit human confirmation before anything runs — see `.agent/RULES.md`.

## Getting started
- `npm install`
- `npm run electron:dev` (desktop app) or `npm run dev` (browser only, `:5183`)
- `npm test`
