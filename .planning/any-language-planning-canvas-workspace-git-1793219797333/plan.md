<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Any language: planning, canvas, workspace, git
<!-- /plan-meta -->

<!-- steps -->

## 1. One language registry
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/one-language-registry-1793219797380 -->
A language is defined in eight places today (architectures.ts LANGUAGES, planDoc EXT_LANGUAGE, the importAdapters and codeEditorLanguages ext maps, analyze.mjs SOURCE_EXT, runTargets, lsp-proxy, templates), so adding C means touching all of them and they drift. One pure-data registry with no imports (like graphCore.mjs), usable by the renderer, Electron and the vendored CLIs. Per language: id, label, extensions, comment syntax (line, block, hash, html), header/source split (C, C++), the manifests that detect it, file-naming convention (camel, snake, Pascal), editor grammar, language server (command, args, install hint), build/run/test commands, .gitignore entries, and the UI frameworks a canvas component can target in it. Seeds: TypeScript, React, JavaScript, Python, Rust, Go, C, C++, Java, Kotlin, Swift, C#, HTML, CSS; frameworks React, Vue, Svelte, HTML, Leptos, Dioxus, templ, LVGL, SwiftUI. Consumers wired in this step: architectures.ts derives LANGUAGES from it; syncPlanDoc inlines it into the vendored plan.mjs (which stays import-free); analyze.mjs reads its extensions; the scaffolder vendors it as .sleipnir/languages.mjs. Test: every consumer agrees with the registry.

**Files**
- `tools/agentSkills/vendor/languages.mjs` — node (javascript)
- `tools/agentSkills/vendor/languages.d.mts` — interface (typescript)

**Edits**
- `src/00_planning/graph/architectures.ts`
- `src/00_planning/graph/naming.ts`
- `tools/planDoc.mjs`
- `tools/syncPlanDoc.mjs`
- `tools/agentSkills/vendor/plan.mjs`
- `tools/agentSkills/vendor/analyze.mjs`
- `tools/agentSkills/scaffold.mjs`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/one-language-registry-1793219797380 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/one-language-registry-1793219797380 -->

## 2. Detect C, C++, Java, Swift and C# projects
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/detect-c-c-java-swift-and-c-projects-1793219797448 -->
detect-project reads manifests from the registry instead of its own list: CMakeLists.txt, Makefile or meson.build become c or cpp (by the sources present) and are supported rather than reported as unsupported; pom.xml and build.gradle(.kts) become java or kotlin; Package.swift becomes swift; .csproj/.sln become csharp. conventions reports each language source and include folders (src + include for C, src/main/java for Java), so agents running /plan put files where the project expects them. Mixed repos (a Rust core with a React UI) keep a language per folder. AGENTS.md lists every language extension for planned files.

**Edits**
- `tools/planDoc.mjs`
- `tools/agentSkills/vendor/plan.mjs`
- `tools/agentSkills/registry.mjs`
- `src/00_planning/api/vendoredPlanCli.test.ts`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/detect-c-c-java-swift-and-c-projects-1793219797448 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/detect-c-c-java-swift-and-c-projects-1793219797448 -->

## 3. Scaffold any language in Planning
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/scaffold-any-language-in-planning-1793219797519 -->
Role templates for C, C++, Java, Kotlin, Swift and C# beside the existing TypeScript, Python, Rust and Go ones, chosen from the registry. C and C++ split by role: the Interface role is the header (.h/.hpp) and every other role is a source file that includes its own header, so a C view includes view_model.h the way a TSX view imports its ViewModel. File names follow each language convention (cart_view.c, CartView.java, cart_view.rs). The Add Node language picker lists every registered language; non-architectural ones (CSS) still scaffold single files. Test: every language x role renders with balanced braces and include guards, and siblings link.

**Files**
- `src/00_planning/graph/templates/nativeTemplates.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/templates/index.ts`
- `src/00_planning/graph/scaffoldPlan.ts`
- `src/00_planning/AddNodeModal.ViewModel.tsx`
- `src/00_planning/graph/naming.ts`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/scaffold-any-language-in-planning-1793219797519 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/scaffold-any-language-in-planning-1793219797519 -->

## 4. Imports and Health for C, C++, Java, Kotlin, Swift, C#
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/imports-and-health-for-c-c-java-kotlin-swift-c-1793219797611 -->
Real import resolution so the architecture graph and the Health view work for these languages instead of the basename-guessing fallback. C/C++: #include "x.h" relative to the file, then include dirs from compile_commands.json or CMake include_directories, with header and source paired as one unit. Java/Kotlin: package + import to a path under src/main/java or kotlin. Swift and C#: module and namespace, same-module types by folder. analyze.mjs gets the same parsers (vendored, pure), and graphCore roles learn them: headers are the interface layer, main.c, Main.java and Program.cs are entries, *_test.c and *Test.java are tests. Lab: add a CMake fixture with an include cycle and a Gradle fixture with a misplaced class to tools/optimizeLab.

**Files**
- `src/00_planning/graph/importAdapters/cAdapter.ts` — node (typescript)
- `src/00_planning/graph/importAdapters/jvmAdapter.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/importAdapters/index.ts`
- `src/00_planning/graph/importAdapters/detectEdges.ts`
- `tools/agentSkills/vendor/analyze.mjs`
- `tools/agentSkills/vendor/graphCore.mjs`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/imports-and-health-for-c-c-java-kotlin-swift-c-1793219797611 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/imports-and-health-for-c-c-java-kotlin-swift-c-1793219797611 -->

## 5. Workspace: highlighting for every language
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/workspace-highlighting-for-every-language-1793219797697 -->
codeEditorLanguages reads the registry. Adds @codemirror/lang-cpp (C, C++), @codemirror/lang-java, and @codemirror/legacy-modes StreamLanguage modes for Swift, Kotlin, C#, TOML, YAML, shell and CMake. Grammars load on demand with a dynamic import so none of them reaches the first load. The duplicate extension maps in codeEditorLanguages and importAdapters collapse into the registry. Unknown extensions still open as plain editable text.

**Edits**
- `src/app/DesignSystem/codeEditorLanguages.ts`
- `src/00_planning/graph/importAdapters/index.ts`
- `package.json`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/workspace-highlighting-for-every-language-1793219797697 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/workspace-highlighting-for-every-language-1793219797697 -->

## 6. Workspace: a language server per language
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/workspace-a-language-server-per-language-1793219797795 -->
lsp-proxy only spawns typescript-language-server. Generalize it to the registry server per language: clangd (C, C++), rust-analyzer, gopls, pyright-langserver or pylsp, jdtls, kotlin-language-server, sourcekit-lsp, csharp-ls. Each is found on PATH (or a configured path), started lazily the first time a file of that language opens, one per project root and language, and stopped when the project closes. The editor client connects per language. A missing server is a quiet status line with the install command from the registry, never an error dialog. The self-host tsserver special case stays.

**Files**
- `tools/languageServers.mjs` — node (javascript)

**Edits**
- `tools/lsp-proxy.mjs`
- `src/app/DesignSystem/lspClient.ts`
- `src/app/DesignSystem/CodeEditorView.ViewModel.tsx`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/workspace-a-language-server-per-language-1793219797795 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/workspace-a-language-server-per-language-1793219797795 -->

## 7. Workspace: build, run and test any project
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/workspace-build-run-and-test-any-project-1793219797903 -->
Play finds CMake (configure, build, run the target), Make, Meson, Gradle/Maven, SwiftPM and dotnet projects next to npm, cargo, go and python. Validation, Vitest-only today, runs each language test runner from the registry (cargo test, go test -json, pytest with junit output, ctest, gradle test, swift test, dotnet test) and parses all of them into one result shape: suite, test, status, duration, failure message with file:line. The Validation view, and later the Health view failure overlay, then read any language the same way.

**Files**
- `electron/testRunners.cjs` — node (javascript)

**Edits**
- `electron/runTargets.cjs`
- `electron/validation.cjs`
- `electron/runTargets.test.ts`
- `src/04_validation/ValidationView.ViewModel.tsx`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/workspace-build-run-and-test-any-project-1793219797903 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/workspace-build-run-and-test-any-project-1793219797903 -->

## 8. Git: language-aware diffs and ignores
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/git-language-aware-diffs-and-ignores-1793219797975 -->
Diffs are plain text today. Highlight hunks with the file grammar from the registry (static Lezer highlighting, no editor instance per hunk). Lockfiles and generated output (Cargo.lock, go.sum, package-lock.json, build folders) collapse by default. initRepo writes a .gitignore built from the detected languages (target/, build/, __pycache__/, .venv/, *.o, out/, bin/ and obj/), and Source Control offers to add a missing ignore when build output shows up as untracked. Note: src/06_source_control is being edited in parallel; start from that work.

**Files**
- `src/06_source_control/diffHighlight.ts` — node (typescript)

**Edits**
- `src/06_source_control/DiffView.tsx`
- `tools/git-control.mjs`
- `src/06_source_control/SourceControlView.ViewModel.tsx`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/git-language-aware-diffs-and-ignores-1793219797975 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/git-language-aware-diffs-and-ignores-1793219797975 -->

## 9. Canvas: pick the language on the element
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/canvas-pick-the-language-on-the-element-1793219798050 -->
LANGUAGES.md stages 1 and 2. A component TARGET is dead data today: everything emits React. Stage 1: region sentinels take a closed comment-style id (line-slash, block-slash, html, plus hash for Python and TOML shaped targets), defaulting to today // so every file on disk keeps working; region.test.ts must pass unmodified. Stage 2: a CanvasEmitter interface (extension, comment style, indent, fileName, symbol, emitRegionBody, collectImports, emitComponentFile, and the property support table used next), an emitter registry with no fallback (React into a file meant to be HTML is worse than nothing), targets derived from the emitter registry crossed with the language registry, and the inspector TARGET dropdown wired on the element itself, locked once the component has a file. React moves behind the interface with byte-identical output.

**Files**
- `src/01_canvas/emit/CanvasEmitter.ts` — interface (typescript)
- `src/01_canvas/emit/registry.ts` — node (typescript)
- `src/01_canvas/emit/naming.ts` — node (typescript)

**Edits**
- `src/01_canvas/emit/region.ts`
- `src/01_canvas/emit/targets.ts`
- `src/01_canvas/emit/react.ts`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/panels/CreateComponentModal.tsx`
- `src/01_canvas/panels/CanvasInspector.tsx`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/canvas-pick-the-language-on-the-element-1793219798050 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/canvas-pick-the-language-on-the-element-1793219798050 -->

## 10. The Frame spec: canvas properties as the cross-language contract
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/the-frame-spec-canvas-properties-as-the-cross-language-contract-1793219798133 -->
Decision: the base Frame is a spec, not a runtime. CanvasStyle already is the one box model (layout, sizing, paint, effects, rotation, along-path). frameSpec lists every property once with its meaning, units and default, and each emitter declares per property: exact, approximate (with the reason) or unsupported. The inspector reads it for the selected element target, so an unsupported property is greyed with its reason (per-corner radius: approximate in SwiftUI) and the design never promises what the code cannot do. Every lowering stays a pure function of the same IR, so adding a language never touches the others. Record the decisions (spec over runtime, the CSS policy, the motion and 3D direction) in LANGUAGES.md.

**Files**
- `src/01_canvas/model/frameSpec.ts` — node (typescript)

**Edits**
- `src/01_canvas/model/types.ts`
- `src/01_canvas/panels/CanvasInspector.tsx`
- `src/01_canvas/panels/LayoutSection.tsx`
- `src/01_canvas/panels/PaintSections.tsx`
- `src/01_canvas/LANGUAGES.md`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/the-frame-spec-canvas-properties-as-the-cross-language-contract-1793219798133 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/the-frame-spec-canvas-properties-as-the-cross-language-contract-1793219798133 -->

## 11. React Frame mode: canvas properties as code props (opt-in)
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/react-frame-mode-canvas-properties-as-code-props-opt-in-1793219798210 -->
For code that reads like the inspector: emit <Frame flow="vertical" gap={8} fill={...}> instead of divs with style objects. The Frame is copied into the project (src/components/Frame/, owned by the user like shadcn components, no Sleipnir dependency) from UIKit Frame on first use and kept current by a version stamp. toFrameProps (CanvasStyle to FrameProps; removed as unused, restore from 9f835de^) is the mapping, and reading code back onto the canvas becomes reading props. Off by default: plain divs stay the zero-dependency default, and other languages always use static lowering, because the Frame runs toCss at runtime and porting that derivation into every language would recreate the drift the spec avoids.

**Files**
- `src/01_canvas/emit/reactFrame.ts` — node (typescript)
- `src/01_canvas/model/toFrameProps.ts` — node (typescript)

**Edits**
- `src/01_canvas/emit/react.ts`
- `src/01_canvas/panels/CreateComponentModal.tsx`
- `src/app/UIKit/Frame/Frame.tsx`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/react-frame-mode-canvas-properties-as-code-props-opt-in-1793219798210 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/react-frame-mode-canvas-properties-as-code-props-opt-in-1793219798210 -->

## 12. Stylesheets: multi-file components and the CSS policy
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/stylesheets-multi-file-components-and-the-css-policy-1793219798289 -->
Policy: inline until inline cannot. React keeps inline style objects (exact, one file) unless a component needs what inline cannot express (hover, press and focus states, breakpoints, keyframe animation); then it gets a co-located Card.module.css with one class per node. Markup-first targets (HTML, Vue, Svelte, templ, Leptos) always use a stylesheet. Theme tokens become CSS variables, so components follow the app theme. Needs LANGUAGES.md phase 2: CanvasComponent.outputs[] (target, files, sync, per-file hashes), schema v2 with an idempotent migration, and cssDeclarations() in toCss (kebab-case, px on unitless numbers except opacity, flex, fontWeight, lineHeight, zIndex). One derivation still feeds the board and the code.

**Files**
- `src/01_canvas/emit/stylesheet.ts` — node (typescript)

**Edits**
- `src/01_canvas/model/types.ts`
- `src/01_canvas/model/store.ts`
- `src/01_canvas/model/toCss.ts`
- `src/01_canvas/model/componentTree.ts`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/emit/react.ts`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/stylesheets-multi-file-components-and-the-css-policy-1793219798289 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/stylesheets-multi-file-components-and-the-css-policy-1793219798289 -->

## 13. Web targets: HTML, Vue, Svelte
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/web-targets-html-vue-svelte-1793219798365 -->
LANGUAGES.md stages 3 and 4, plus Svelte. HTML: one document, region inside <body>, variants as hidden siblings, nested instances inlined with a cycle guard. Vue SFC: html-style sentinel inside <template> (never //), v-if variants, real component imports that keep their extension. Svelte: {#if} variants and a scoped <style>. All three use the step 12 stylesheet, so the board preview stays exact. Acceptance: one board with React, HTML and Vue components side by side, each pushed with its own sentinel style and tracked dirty independently.

**Files**
- `src/01_canvas/emit/html.ts` — node (typescript)
- `src/01_canvas/emit/vue.ts` — node (typescript)
- `src/01_canvas/emit/svelte.ts` — node (typescript)

**Edits**
- `src/01_canvas/emit/targets.ts`
- `src/00_planning/graph/architectures.ts`
- `src/app/DesignSystem/codeEditorLanguages.ts`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/web-targets-html-vue-svelte-1793219798365 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/web-targets-html-vue-svelte-1793219798365 -->

## 14. Rust and Go components: Leptos and templ
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/rust-and-go-components-leptos-and-templ-1793219798439 -->
Rust and Go reach the canvas through web UI frameworks that keep the CSS box model, so the preview stays exact. Rust: a Leptos component (a #[component] fn returning view! markup, classes from the component stylesheet, props as a struct), with Dioxus rsx! as a second Rust emitter on the same lowering. Go: a templ component with a props struct. Variants become a Rust enum with match and a Go switch. File naming and comment sentinels come from the registry (snake_case .rs, // regions); a Rust component lands in the crate components module and is registered in mod.rs.

**Files**
- `src/01_canvas/emit/leptos.ts` — node (typescript)
- `src/01_canvas/emit/templ.ts` — node (typescript)

**Edits**
- `src/01_canvas/emit/targets.ts`
- `src/00_planning/graph/templates/index.ts`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/rust-and-go-components-leptos-and-templ-1793219798439 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/rust-and-go-components-leptos-and-templ-1793219798439 -->

## 15. Native targets: C (LVGL) and SwiftUI
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/native-targets-c-lvgl-and-swiftui-1793219798530 -->
Toolkits without CSS need a second lowering. toNative maps the IR to a layout tree (flex flow, gap, padding, alignment, fixed, hug and fill sizes, absolute children) and records every divergence. LVGL, the C UI toolkit with real flex layout for embedded and desktop, emits card.h (a props struct and a create function) and card.c (lv_obj calls, one lv_style_t per node, flex flow and align, radius, border, shadow). SwiftUI emits stacks and modifiers per LANGUAGES.md stage 5 (.offset, never .position). The board cannot render these natively, so a native-target component wears an approximate-preview badge and the inspector shows its frameSpec divergences. C without a UI toolkit still gets no frame, but can get its props struct.

**Files**
- `src/01_canvas/model/toNative.ts` — node (typescript)
- `src/01_canvas/emit/lvgl.ts` — node (typescript)
- `src/01_canvas/emit/swiftui.ts` — node (typescript)

**Edits**
- `src/01_canvas/board/CanvasNodeView.tsx`
- `src/01_canvas/emit/targets.ts`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/native-targets-c-lvgl-and-swiftui-1793219798530 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/native-targets-c-lvgl-and-swiftui-1793219798530 -->

## 16. AI commands in any language
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/ai-commands-in-any-language-1793219798628 -->
For "/component a pricing card in Vue" or "/plan a sensor driver in C": canvas.mjs build and the canvas_build tool take a target, validated against the available emitters and answered with the unavailable reason instead of quietly falling back to React. The /plan and /optimize skills tell agents to read detect-project languages and plan each folder in its own language. The chat slash hints show the language argument.

**Edits**
- `tools/agentSkills/vendor/canvas.mjs`
- `electron/agent/tools/canvas.cjs`
- `tools/agentSkills/registry.mjs`
- `electron/agent/systemPrompt.cjs`
- `src/app/AgentChat/AgentChat.tsx`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/ai-commands-in-any-language-1793219798628 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/ai-commands-in-any-language-1793219798628 -->

## 17. Motion: states, transitions and keyframes
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/motion-states-transitions-and-keyframes-1793219798723 -->
The IR gets a time axis. Interaction states (hover, press, focus) are style overrides like variants; transitions say how each property moves between them (duration, easing, delay); keyframe timelines animate opacity, rotate, position, scale and fills, plus motion along a path that reuses pathFlow. The board previews with the Web Animations API on the same toCss values, and a timeline panel scrubs and plays. Lowering: web targets get CSS transitions and @keyframes in the component stylesheet (why stylesheets come first), React Frame mode a motion prop, SwiftUI .animation and withAnimation, LVGL lv_anim_t; each declared in frameSpec, unsupported shown with its reason. Emitted CSS honors prefers-reduced-motion.

**Files**
- `src/01_canvas/model/motion.ts` — node (typescript)
- `src/01_canvas/panels/TimelinePanel.tsx` — view (react)
- `src/01_canvas/panels/TimelinePanel.ViewModel.tsx` — view-model (react)
- `src/01_canvas/emit/motionCss.ts` — node (typescript)

**Edits**
- `src/01_canvas/model/types.ts`
- `src/01_canvas/board/CanvasNodeView.tsx`
- `src/01_canvas/panels/CanvasInspector.tsx`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/motion-states-transitions-and-keyframes-1793219798723 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/motion-states-transitions-and-keyframes-1793219798723 -->

## 18. 3D: scene nodes
<!-- step:plan/any-language-planning-canvas-workspace-git-1793219797333/3d-scene-nodes-1793219798826 -->
A new layer kind: a frame that holds a 3D scene with primitives (box, sphere, plane, torus), glTF models from .components/assets, a camera, lights, and materials taken from canvas fills. It is positioned and laid out like any frame, so a 3D hero sits inside a 2D page. The board renders it with three.js through @react-three/fiber, loaded on demand with a dynamic import so three.js never reaches the first load. Motion keyframes drive object transforms and the camera. Emit: React gets an R3F component, web markup targets a small vanilla three.js module, native targets unsupported with the reason (SceneKit or RealityKit later for Swift).

**Files**
- `src/01_canvas/model/scene.ts` — node (typescript)
- `src/01_canvas/board/SceneNodeView.tsx` — view (react)
- `src/01_canvas/panels/ScenePanel.tsx` — view (react)
- `src/01_canvas/emit/scene3d.ts` — node (typescript)

**Edits**
- `src/01_canvas/model/types.ts`
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/board/CanvasToolbar.tsx`
- `package.json`
<!-- /step-meta:plan/any-language-planning-canvas-workspace-git-1793219797333/3d-scene-nodes-1793219798826 -->

<!-- /step:plan/any-language-planning-canvas-workspace-git-1793219797333/3d-scene-nodes-1793219798826 -->
