# Changelog

All notable changes to Sleipnir are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
`MAJOR.MINOR.PATCH` — bump PATCH for fixes, MINOR for new features, MAJOR for
breaking changes. Pre-`1.0.0` signals "early, expect change."

## [Unreleased]

## [0.2.0] - 2026-11-09

### Added
- Canvas documents come in two kinds: Sketches (2D frames and components) and
  Environments (3D scenes). One picker lists both, and the document decides the
  view, replacing the 2D/3D toggle.
- Place a Sketch in an Environment on a plane or a part's face, linked, so edits
  to the Sketch show in 3D. Unlink makes the copy local.
- 3D parts built from sketches: extrude, revolve and sweep, starter shapes, a
  parts list with each part's features, and a settings dialog per feature with
  live preview, OK and Cancel. Drag features to reorder them.
- Edit parts directly: pick points, edges or faces (Tab, 1 / 2 / 3, A, B for a
  box). G, R and S move them, with X / Y / Z locks, typed amounts and Ctrl to
  snap; Enter keeps a move and Esc puts it back. Points and edges move freely in
  3D, one face pushes or pulls along itself, and E grows new material out of a
  face.
- Parts move, turn and scale as a whole while their sketches stay on their planes.
- Display modes (shaded, edges, wireframe, X-ray) and a smoothness setting for
  curved parts. Click the axis gizmo to look straight down an axis.
- Sketch mode draws over the live 3D scene, facing the sketch's plane.
- Agents can build 3D scenes from the command line with `.sleipnir/model.mjs`,
  including whole builds in one batch, and read a scene back in a few hundred
  tokens with `describe`. New `/sculpt` and `/sketch` commands teach them how.
- Terminals survive a page reload, keeping their output and whatever was running.
  They now scroll back 10,000 lines.
- After a reload the app comes back to the same space, dock, split and open files.
- When developing Sleipnir itself: a Restart to apply button that restarts the
  app and resumes each terminal's Claude conversation.

### Changed
- Deleting a sketch or face that something depends on no longer deletes that
  thing: it stays, marked broken with the reason, to re-pick or remove.
- Each 3D control has one home: shaping tools and select modes in the toolbox,
  feature settings and appearance in the right panel, views on the axis gizmo.
- New documents are named "Untitled sketch" and "Untitled environment", numbered
  when taken, and documents added from outside appear in the picker at once.
- Number fields show rounded values instead of long decimals.
- `canvas.mjs` only writes to Sketch documents.

### Fixed
- Small curved parts are as round as large ones.
- Reversed and both-sides extrudes are drawn the way they are set.
- Sketches stood on a turned part's face land on the face.
- An extruded frame with the default fill no longer renders black.

## [0.1.0] - 2026-10-28

### Added
- Run — pick what to run from the status bar (dev servers, desktop apps,
  static sites, any package script, or a typed command) and press ▶. The Run
  panel shows its output and a live, embedded preview of a web target, with
  reload, open-in-browser and an expanded view. Installs dependencies first
  when needed, and Stop ends the whole process tree.
- Status bar along the bottom of the window — the Run control on the left;
  Problems, AI, Terminal and Run as tabs on the right, lit while their panel is
  open. Replaces the floating round toggles that covered the bottom-right of
  every view.
- Canvas properties: every paint (fill, stroke, shadow color, gradient stop) is
  one compact row; its swatch opens a Figma-style picker beside the panel with
  fill-type tabs, a saturation/value square, hue and alpha strips, an
  eyedropper and a gradient stop bar.
- Canvas properties: drag any number field (or its label) sideways to change
  it — Shift for 10×, Alt for 0.1×, Esc to put it back. The pointer locks and
  wraps around the window edges so a drag never runs out of room. One drag is
  one undo step.
- Canvas rotation, path patterns, and `/frame` / `/component` design commands
  for AI agents.
- Architecture health view in Planning and the `/optimize` command.
- Git: a ⋯ menu on the STAGED / CHANGES / UNTRACKED headers — stage or
  unstage all, discard all (with a confirm listing the files), copy paths.
- AI chat: the galloping loader shows whenever the model is working with
  nothing on screen yet (after a tool runs, or when a reply goes quiet), and a
  turn silent for 30s says so.
- Sleipnir Pro licensing — Settings ▸ License activates a Lemon Squeezy
  license key (Founder lifetime license). Pro unlocks unlimited projects (the
  free version opens up to 3), multiple windows, MCP servers for the agent, and
  commercial use. A title bar badge shows the tier; a gated action opens an
  upgrade prompt. License checks never fail closed when offline. Until a build
  names its license store, every Pro feature is unlocked for everyone.
- Website (`website/`, deployed to GitHub Pages) — downloads that link straight
  to the latest release's installers, pricing, terms, refund and privacy pages.
- AI agent: `read_file` and `run_command` tools — the agent can now inspect
  existing files and propose shell commands (tests, installs, build scripts),
  each gated behind an explicit confirmation dialog before anything executes,
  with live streamed output. Previously the agent could only create plan nodes
  and stage generated code.
- Validation view (Workspace nav rail) — runs the open project's own Vitest
  suite via `vitest run --reporter=json` and shows structured pass/fail
  results in-app, instead of only via the CLI.
- Git: stash (push/apply/pop/drop), an optional side-by-side diff mode, and a
  merge-conflict banner (open the file, then mark it resolved) surfacing data
  the backend already computed but the UI previously discarded.
- Settings → Keybindings — remap Quick Open's hotkey (Ctrl/Cmd+P).
- Multi-window support: File > New Window opens a brand-new window with its own
  independent project.
- Auto-update via GitHub Releases (electron-updater) — downloads in the
  background, installs on next quit. (macOS requires a signed build to apply.)
- Source-available licensing under PolyForm Noncommercial 1.0.0.
- CI (typecheck, lint, test, build) and first smoke tests (import adapters,
  workspace path-containment, diff-hunk parsing).

### Fixed
- AI chat no longer spins forever when sending a message fails outright — the
  error shows and the chat resets.
- AI agent tool calls (`read_file`, `generate_code`, `run_command`) now resolve
  against the calling window's own project root — previously they raced
  against whichever window's root a renderer call had most recently set,
  which only mattered once multi-window support existed.
- Closing a non-last window no longer leaks that window's terminal/chat/preview/
  command-runner child processes; they're killed when the window closes,
  instead of only at app quit.
- Closing a window (or the app) while it has unsaved AI-generated content now
  prompts (Cancel / Discard / Save & Close) instead of silently discarding it.
- Packaged builds now bundle all backend `tools/` modules and unpack `node-pty`
  from the asar archive, so git/preview/file-tree/LSP/terminal work when
  installed (previously crashed).
- Main-process crashes are logged to `userData/logs/main.log` instead of
  surfacing Electron's raw error dialog.

## [0.0.0]

- Initial pre-release baseline.
