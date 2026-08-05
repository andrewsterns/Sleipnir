# Sleipnir Agent Entry Point

This project is optimized for AI agent collaboration through a research-driven
pipeline, and ships its own AI agent (see [ARCHITECTURE.md §8](ARCHITECTURE.md#8-the-ai-agent))
that operates under these same rules.

## System configuration
- **Operating mandates:** [`.agent/RULES.md`](./.agent/RULES.md)
- **Directory map:** [`.agent/Architecture.md`](./.agent/Architecture.md)
- **Full technical architecture:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) (root)
- **Setup and commands:** [`README.md`](./README.md) (root)

## Numbered execution pipeline (00–05)
1. **00_planning** — Roadmaps, the planning graph, and the library/widget registries (live)
2. **01_research** — Docs-only research graph (personas, proposals, analytics)
3. **02_components** — The default component library
4. **03_prototypes** — The default prototype library
5. **04_validation** — Test/validation logic
6. **05_analytics** — Results, feeding back into `01_research`

## Outside the 00–05 pipeline
- **06_source_control** — Local git status/diff/commit and push/pull/fetch,
  host-agnostic (works against whatever remote the repo actually has). A
  standalone utility with its own nav-rail entry, not a pipeline stage.
- **src/app/** — Sleipnir's own application shell (nav rail, docks, editor,
  AI chat, terminal, refactor UI). Not part of the pipeline; see
  `ARCHITECTURE.md` §4.
- **tools/** — The shared Node backend both the Electron and web transports
  call into. See `ARCHITECTURE.md` §1.

Refer to `.agent/RULES.md` for the complete foundational mandates before
making changes.
