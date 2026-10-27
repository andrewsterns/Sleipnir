<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# LSP typing latency
<!-- /plan-meta -->

<!-- steps -->

## 1. Instrument LSP round-trips
<!-- step:plan/lsp-typing-latency-1793049413729/instrument-lsp-round-trips-1793049428561 -->
Wrap the WebSocket transport so every request is timed by method, with response size, and slow ones (over 50ms, or over 64KB) are logged in dev. Gives a before/after number for every later step instead of guessing. Measured outside the app already: identifier completions in this repo are ~1,000 items / 74 KB / 14-68 ms and complete (cached by the editor), import-path completions 15 items / 3 ms — so payload size is not the bottleneck and is not a step.

**Files**
- `src/app/DesignSystem/lspMetrics.ts` — node (typescript)

**Edits**
- `src/app/DesignSystem/lspClient.ts`
<!-- /step-meta:plan/lsp-typing-latency-1793049413729/instrument-lsp-round-trips-1793049428561 -->

<!-- /step:plan/lsp-typing-latency-1793049413729/instrument-lsp-round-trips-1793049428561 -->

## 2. Drop the duplicate hover source
<!-- step:plan/lsp-typing-latency-1793049413729/drop-the-duplicate-hover-source-1793049428640 -->
Every LSP editor gets hoverTooltips() twice: once inside the client's languageServerExtensions() (LSPClient.plugin includes client extensions per editor) and again via lspHoverTooltips in CodeEditorView.ViewModel's lspExtension. Each hover sends two textDocument/hover requests and builds two tooltips. Keep the client's one, remove the extra.

**Edits**
- `src/app/DesignSystem/lspClient.ts`
- `src/app/DesignSystem/CodeEditorView.ViewModel.tsx`
<!-- /step-meta:plan/lsp-typing-latency-1793049413729/drop-the-duplicate-hover-source-1793049428640 -->

<!-- /step:plan/lsp-typing-latency-1793049413729/drop-the-duplicate-hover-source-1793049428640 -->

## 3. Dedupe Ctrl-hover definition lookups
<!-- step:plan/lsp-typing-latency-1793049413729/dedupe-ctrl-hover-definition-lookups-1793049428763 -->
modHoverDefinitionLink sends sync() + textDocument/definition on every mousemove while Ctrl is held, even over the same word. Cache the last word range per view and only ask again when the word under the pointer changes; keep the existing token guard for out-of-order responses.

**Edits**
- `src/app/DesignSystem/lspClient.ts`
<!-- /step-meta:plan/lsp-typing-latency-1793049413729/dedupe-ctrl-hover-definition-lookups-1793049428763 -->

<!-- /step:plan/lsp-typing-latency-1793049413729/dedupe-ctrl-hover-definition-lookups-1793049428763 -->

## 4. Trim per-keystroke editor work
<!-- step:plan/lsp-typing-latency-1793049413729/trim-per-keystroke-editor-work-1793049428904 -->
The editor's updateListener runs diagnosticCount() and a setProblemCount on every update, including cursor moves and focus changes. Recount only when the doc changed or a diagnostics transaction landed, so typing and arrowing don't touch React state they don't change.

**Edits**
- `src/app/DesignSystem/CodeEditorView.ViewModel.tsx`
<!-- /step-meta:plan/lsp-typing-latency-1793049413729/trim-per-keystroke-editor-work-1793049428904 -->

<!-- /step:plan/lsp-typing-latency-1793049413729/trim-per-keystroke-editor-work-1793049428904 -->

## 5. Route tsserver responses per connection
<!-- step:plan/lsp-typing-latency-1793049413729/route-tsserver-responses-per-connection-1793049429036 -->
The proxy binds every WebSocket connection's reader to the same tsserver stdout, so each connection receives every message: two windows' request ids collide, responses land in the wrong window, and the external server is killed when any one of its windows closes. Extract a router that rewrites request ids to be unique per server and maps responses back to their connection, broadcasts notifications, and ref-counts the external server. Also replace the per-chunk Buffer.concat deframer with a chunk list (minor at measured sizes, but quadratic on large messages).

**Files**
- `tools/lspRouter.mjs` — node (react)
- `tools/lspRouter.test.ts` — node (typescript)

**Edits**
- `tools/lsp-proxy.mjs`
<!-- /step-meta:plan/lsp-typing-latency-1793049413729/route-tsserver-responses-per-connection-1793049429036 -->

<!-- /step:plan/lsp-typing-latency-1793049413729/route-tsserver-responses-per-connection-1793049429036 -->

## 6. Verify typing latency before/after
<!-- step:plan/lsp-typing-latency-1793049413729/verify-typing-latency-before-after-1793049435760 -->
With the lspMetrics logging from step 1 on, type an import and an identifier in a Workspace TSX file and hover/Ctrl-hover a few symbols, before and after the steps above: compare hover requests per hover, definition requests per Ctrl-hover, and slow-request counts. Open two windows on the same project and confirm each only receives its own responses, and closing one keeps the other's code intelligence alive.
<!-- /step-meta:plan/lsp-typing-latency-1793049413729/verify-typing-latency-before-after-1793049435760 -->

<!-- /step:plan/lsp-typing-latency-1793049413729/verify-typing-latency-before-after-1793049435760 -->
