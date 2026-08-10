# Changelog

All notable changes to Sleipnir are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
`MAJOR.MINOR.PATCH` — bump PATCH for fixes, MINOR for new features, MAJOR for
breaking changes. Pre-`1.0.0` signals "early, expect change."

## [Unreleased]

### Added
- Multi-window support: File > New Window opens a brand-new window with its own
  independent project.
- Auto-update via GitHub Releases (electron-updater) — downloads in the
  background, installs on next quit. (macOS requires a signed build to apply.)
- Source-available licensing under PolyForm Noncommercial 1.0.0.
- CI (typecheck, lint, test, build) and first smoke tests (import adapters,
  workspace path-containment).

### Fixed
- Packaged builds now bundle all backend `tools/` modules and unpack `node-pty`
  from the asar archive, so git/preview/file-tree/LSP/terminal work when
  installed (previously crashed).
- Main-process crashes are logged to `userData/logs/main.log` instead of
  surfacing Electron's raw error dialog.

## [0.0.0]

- Initial pre-release baseline.
