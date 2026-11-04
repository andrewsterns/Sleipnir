# Sleipnir Agent Entry Point

Sleipnir is a canvas and 3D modeling workbench for building software, tied
directly to AI and git. It ships its own AI agent (see
[ARCHITECTURE.md §8](ARCHITECTURE.md#8-the-ai-agent)) that operates under these
same rules.

## System configuration
- **Operating mandates:** [`.agent/RULES.md`](./.agent/RULES.md)
- **Directory map:** [`.agent/Architecture.md`](./.agent/Architecture.md)
- **Full technical architecture:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) (root)
- **Setup and commands:** [`README.md`](./README.md) (root)

## Feature folders
- **planning** — The Planning graph: plans, the architecture and Health views.
- **document** — The scene document the canvas and the 3D modeler both edit.
- **canvas** — 2D boards, panels, code emit, and the editor's hooks.
- **modeling** — 3D: sketch planes, solids, the three.js viewport.
- **source-control** — Local git status/diff/commit and push/pull/fetch,
  host-agnostic (works against whatever remote the repo actually has).
- **validation** — The Validation view and Vitest setup.
- **platform** — The API every feature calls, on either transport.
- **src/app/** — Sleipnir's own application shell (nav rail, docks, editor,
  AI chat, terminal) and its UIKit; see `ARCHITECTURE.md` §4.
- **tools/** — The shared Node backend both the Electron and web transports
  call into. See `ARCHITECTURE.md` §1.

Refer to `.agent/RULES.md` for the complete foundational mandates before
making changes.
