# Releasing Sleipnir

Sleipnir ships as signed-or-unsigned desktop installers published to
[GitHub Releases](https://github.com/andrewsterns/Sleipnir/releases), which is
also the feed the in-app auto-updater checks (`electron-updater`, wired in
`electron/main.cjs`).

## The normal flow (recommended): tag → CI builds & publishes

The release workflow (`.github/workflows/release.yml`) builds on **Windows and
macOS runners** and publishes to a GitHub Release automatically, so you don't
need to own both machines.

1. Update `CHANGELOG.md` — move `[Unreleased]` items under the new version.
2. Bump the version:
   ```bash
   npm version patch   # 0.0.0 -> 0.0.1  (use `minor` / `major` as appropriate)
   ```
   This edits `package.json`, commits, and creates a `v0.0.1` git tag.
3. Push the commit and the tag:
   ```bash
   git push && git push --tags
   ```
4. The tag push triggers the release workflow. When it finishes, a GitHub
   Release with the Windows (`.exe`) and macOS (`.dmg` / `.zip`) installers plus
   the `latest.yml` / `latest-mac.yml` update manifests will exist. Installed
   apps pick up the update on their next launch.

The workflow uses the built-in `GITHUB_TOKEN` (via `permissions: contents:
write`) — no personal token or secret to configure.

## Building/publishing locally (optional)

You can only build installers for the OS you're on (a macOS `.dmg` must be built
on a Mac). To publish from your machine you need a GitHub Personal Access Token
with `repo` scope exported as `GH_TOKEN`:

```bash
# Windows (PowerShell):  $env:GH_TOKEN="ghp_..."
# macOS/Linux:           export GH_TOKEN=ghp_...
npm run electron:publish     # build + upload to the GitHub Release for this version
```

To build installers without publishing (local smoke test):
```bash
npm run electron:build       # outputs to release/
```

## Versioning

Semantic Versioning: `MAJOR.MINOR.PATCH`. Every release must have a **higher**
version than the last, or the auto-updater won't detect it. Starting at `0.0.0`
is intentional — pre-`1.0.0` means "early, expect change." Cut `1.0.0` when the
public API/UX is stable enough to promise compatibility.

## ⚠️ Code signing (not yet configured)

Builds are currently **unsigned**. Consequences for the people installing them:

- **Windows:** SmartScreen shows an "unknown publisher" warning users can bypass
  ("More info → Run anyway"). Auto-update still works.
- **macOS:** Gatekeeper **blocks** the app ("developer cannot be verified") — a
  user must right-click → Open the first time — **and the auto-updater will not
  apply updates on macOS until the build is signed + notarized.**

To fix (≈ $99/yr Apple Developer + a Windows cert), add signing config under
`build.mac`/`build.win` and the signing secrets to the release workflow. Until
then, document the macOS "right-click → Open" step for early users.
