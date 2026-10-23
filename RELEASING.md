# Releasing Sleipnir

Sleipnir ships as signed-or-unsigned desktop installers published to
[GitHub Releases](https://github.com/andrewsterns/Sleipnir/releases) — that
page is the download link to share, and also the feed the in-app auto-updater
checks (`electron-updater`, wired in `electron/updater.cjs`). The repo must
stay **public**: a private repo's releases can't be downloaded by users or read
by the updater.

The workflow uses the built-in `GITHUB_TOKEN` (via `permissions: contents:
write`) — no personal token or secret to configure.

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
4. The tag push triggers the release workflow. Each platform uploads its
   installers — Windows (`.exe`), macOS (`.dmg` / `.zip`) — plus the
   `latest.yml` / `latest-mac.yml` update manifests into one draft release,
   and once every platform has succeeded the workflow
   publishes it. Installed apps pick it up on their next check.

If a platform fails, the release stays a draft (invisible to users): fix,
then delete the draft and re-push the tag, or publish it by hand.

## What installed apps do

Only a published GitHub Release is an update — ordinary pushes and commits are
never seen by installed apps. An installed Sleipnir (`electron/updater.cjs`):

- checks the release feed on launch and every 4 hours, plus on demand via
  **Help ▸ Check for Updates…**;
- downloads a newer version in the background (title bar shows the progress);
- shows **Restart to update** in the title bar once it's downloaded. Clicking it
  runs the usual save-on-close prompts, then installs and relaunches. If the
  user ignores it, the update installs the next time they quit.

## Building/publishing locally (optional)

You can only build installers for the OS you're on (a macOS `.dmg` must be built
on a Mac). To publish from your machine you need a GitHub Personal Access Token
with `repo` scope exported as `GH_TOKEN`. electron-builder uploads a **draft** —
publish it from the releases page:

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
