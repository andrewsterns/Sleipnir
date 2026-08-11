# Privacy

_Last updated: 2026-08-10_

Sleipnir is a **local desktop application**. There is no Sleipnir account, no
Sleipnir server, and no Sleipnir-operated backend that your data passes
through. Your files, projects, and editing stay on your computer. This note
explains the few cases where data can leave your machine, and to whom.

> This is a plain-language summary of how the current version behaves, not
> legal advice. It may change as the app evolves; the "Last updated" date above
> tracks the version this describes.

## TL;DR

- **Your code and files never leave your device** — except the specific
  prompts/context you choose to send to the AI agent, and only if you've set it
  to use a cloud model.
- **The AI agent can run 100% locally** (via Ollama). It only uses the cloud if
  you provide your own Anthropic API key.
- **No telemetry, no analytics, no tracking, no ads.** We don't collect usage
  data.
- **Auto-update** checks GitHub for new versions — a normal web request to
  GitHub, nothing more.

## What stays on your device

Everything, by default:

- All file browsing, reading, writing, and editing — your project files never
  get uploaded anywhere.
- The code intelligence (hover, autocomplete, diagnostics) runs in a **local**
  TypeScript language server — no network.
- The integrated **terminal** runs a local shell on your machine.
- **Live previews** run local processes/dev servers on your machine.
- **Crash/error logs** are written only to a local file
  (`<userData>/logs/main.log`) and are **never transmitted** anywhere.
- Your **API key** (if you set one) is stored encrypted at rest using your
  operating system's own credential protection (Keychain on macOS, DPAPI on
  Windows, libsecret on Linux). It is never written to plain storage, never
  shown to the app's web layer, and never sent anywhere except directly to your
  AI provider to authenticate your own requests.

## What can leave your device (and when)

**1. The AI agent — only what you send it, and only in cloud mode.**

Sleipnir's AI features can use either of two backends:

- **Local (Ollama):** if you run a local [Ollama](https://ollama.com) server,
  the agent talks to it at `localhost` — **nothing leaves your machine.** This
  is the default when no cloud key is configured.
- **Cloud (Anthropic):** if you provide your own **Anthropic API key**, the
  agent sends your prompts and the code/context included in a request to
  **Anthropic's API** so the model can respond. This is a "bring your own key"
  arrangement between you and Anthropic; that data is handled under
  [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy) and
  [terms](https://www.anthropic.com/legal/consumer-terms). Sleipnir does not
  receive, store, or proxy any of it.

You control this: if you don't configure a cloud key (or you use Ollama),
**no code or prompts are sent off your machine.**

**2. Automatic update checks — to GitHub.**

To offer updates, the app periodically checks its
[GitHub Releases](https://github.com/andrewsterns/Sleipnir/releases) feed for a
newer version and downloads it if there is one. As with any web request, GitHub
receives standard request metadata (such as your IP address and the app version
being checked), handled under
[GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
No personal data of yours is attached to these checks by Sleipnir.

## What we do **not** do

- No analytics, usage tracking, telemetry, fingerprinting, or advertising.
- No Sleipnir account, login, or user database.
- No Sleipnir-operated servers that your files or activity pass through.
- No selling or sharing of data (there is none to sell).

## Third-party services

Depending on how you use the app, these third parties may receive data, under
their own policies:

| Service | When | What they receive |
|---|---|---|
| **Anthropic** | Only if you configure an Anthropic API key and use the AI agent | Your prompts + the code/context in each request |
| **GitHub** | Automatic update checks & downloads | Standard web-request metadata (IP, app version) |
| **Ollama** (local) | If you use the local AI backend | Nothing leaves your device |

## Changes

If a future version changes what data leaves your device, this note and the
"Last updated" date will change with it, and it's shipped in the app's public
source so you can always see exactly what it says.

## Contact

Questions about privacy? Open an issue at
<https://github.com/andrewsterns/Sleipnir/issues>.
