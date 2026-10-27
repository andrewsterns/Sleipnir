# Changelog

All notable changes to Sleipnir are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
`MAJOR.MINOR.PATCH` — bump PATCH for fixes, MINOR for new features, MAJOR for
breaking changes. Pre-`1.0.0` signals "early, expect change."

## [Unreleased]

### Added
- Sleipnir Pro licensing — Settings ▸ License activates a Lemon Squeezy
  license key (Founder lifetime license). Pro unlocks unlimited projects (the
  free version opens up to 3), multiple windows, MCP servers for the agent, and
  commercial use. A title bar badge shows the tier; a gated action opens an
  upgrade prompt. License checks never fail closed when offline.
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
