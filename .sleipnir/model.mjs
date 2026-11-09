// Sleipnir model commands — standalone, generated. Do not edit:
// built from src/modeling/commands/ by tools/agentSkills/buildModelCli.mjs and
// copied into each project as `.sleipnir/model.mjs`. Node only, no install.
//   node .sleipnir/model.mjs help

// src/modeling/commands/modelCli.ts
import fs from "node:fs";
import path from "node:path";

// tools/agentSkills/vendor/languages.mjs
var LANGUAGES = [
  {
    id: "react",
    label: "React (TSX)",
    extensions: ["tsx", "jsx"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "camel",
    manifests: [],
    planning: { architectural: true },
    imports: "js",
    editor: "tsx",
    server: { command: "typescript-language-server", args: ["--stdio"], install: "npm install -g typescript typescript-language-server" },
    commands: {},
    gitignore: ["node_modules/", "dist/"]
  },
  {
    id: "typescript",
    label: "TypeScript",
    extensions: ["ts", "mts", "cts"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "camel",
    manifests: ["tsconfig.json"],
    planning: { architectural: true },
    imports: "js",
    editor: "typescript",
    server: { command: "typescript-language-server", args: ["--stdio"], install: "npm install -g typescript typescript-language-server" },
    commands: {},
    gitignore: ["node_modules/", "dist/", "*.tsbuildinfo"]
  },
  {
    id: "javascript",
    label: "JavaScript",
    extensions: ["js", "mjs", "cjs"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "camel",
    manifests: ["package.json"],
    planning: { architectural: true },
    imports: "js",
    editor: "javascript",
    server: { command: "typescript-language-server", args: ["--stdio"], install: "npm install -g typescript typescript-language-server" },
    commands: {},
    gitignore: ["node_modules/", "dist/"]
  },
  {
    // A flavor of JavaScript (scaffold content differs), not its own syntax.
    id: "jquery",
    label: "jQuery",
    extensions: ["js"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "camel",
    manifests: [],
    planning: { architectural: true },
    imports: "js",
    editor: "javascript",
    server: null,
    commands: {},
    gitignore: ["node_modules/"]
  },
  {
    id: "python",
    label: "Python",
    extensions: ["py", "pyi"],
    comment: { line: "#" },
    naming: "snake",
    manifests: ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "Pipfile"],
    planning: { architectural: true },
    imports: "python",
    editor: "python",
    server: { command: "pyright-langserver", args: ["--stdio"], install: "npm install -g pyright" },
    commands: { test: ["pytest"] },
    gitignore: ["__pycache__/", "*.pyc", ".venv/", "venv/", ".pytest_cache/"]
  },
  {
    id: "rust",
    label: "Rust",
    extensions: ["rs"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "snake",
    manifests: ["Cargo.toml"],
    planning: { architectural: true },
    imports: "rust",
    editor: "rust",
    server: { command: "rust-analyzer", args: [], install: "rustup component add rust-analyzer" },
    commands: { build: ["cargo", "build"], run: ["cargo", "run"], test: ["cargo", "test"] },
    gitignore: ["target/"]
  },
  {
    id: "go",
    label: "Go",
    extensions: ["go"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "snake",
    manifests: ["go.mod"],
    planning: { architectural: true },
    imports: "go",
    editor: "go",
    server: { command: "gopls", args: [], install: "go install golang.org/x/tools/gopls@latest" },
    commands: { build: ["go", "build", "./..."], run: ["go", "run", "."], test: ["go", "test", "./..."] },
    gitignore: ["bin/"]
  },
  {
    id: "html",
    label: "HTML",
    extensions: ["html", "htm"],
    comment: { block: ["<!--", "-->"] },
    naming: "camel",
    manifests: [],
    planning: { architectural: false },
    imports: "html",
    editor: "html",
    server: null,
    commands: {},
    gitignore: []
  },
  {
    id: "css",
    label: "CSS",
    extensions: ["css"],
    comment: { block: ["/*", "*/"] },
    naming: "camel",
    manifests: [],
    planning: { architectural: false },
    imports: "css",
    editor: "css",
    server: null,
    commands: {},
    gitignore: []
  },
  {
    id: "c",
    label: "C",
    extensions: ["c", "h"],
    headerExtensions: ["h"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "snake",
    manifests: ["CMakeLists.txt", "Makefile", "meson.build"],
    planning: { architectural: true },
    imports: "c",
    editor: "cpp",
    server: { command: "clangd", args: [], install: "Install clangd from LLVM: https://clangd.llvm.org/installation" },
    commands: { build: ["cmake", "--build", "build"], test: ["ctest", "--test-dir", "build"] },
    gitignore: ["build/", "*.o", "*.a", "*.so", "*.dylib", "*.exe"]
  },
  {
    id: "cpp",
    label: "C++",
    extensions: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
    headerExtensions: ["hpp", "hh", "hxx", "h"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "snake",
    manifests: ["CMakeLists.txt", "Makefile", "meson.build"],
    planning: { architectural: true },
    imports: "c",
    editor: "cpp",
    server: { command: "clangd", args: [], install: "Install clangd from LLVM: https://clangd.llvm.org/installation" },
    commands: { build: ["cmake", "--build", "build"], test: ["ctest", "--test-dir", "build"] },
    gitignore: ["build/", "*.o", "*.a", "*.so", "*.dylib", "*.exe"]
  },
  {
    id: "java",
    label: "Java",
    extensions: ["java"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "pascal",
    manifests: ["pom.xml", "build.gradle", "build.gradle.kts"],
    planning: { architectural: true },
    imports: "jvm",
    editor: "java",
    server: { command: "jdtls", args: [], install: "Install Eclipse JDT Language Server: https://github.com/eclipse-jdtls/eclipse.jdt.ls" },
    commands: { test: ["gradle", "test"] },
    gitignore: ["target/", "build/", "*.class", ".gradle/"]
  },
  {
    id: "kotlin",
    label: "Kotlin",
    extensions: ["kt", "kts"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "pascal",
    manifests: ["build.gradle.kts", "build.gradle", "pom.xml"],
    planning: { architectural: true },
    imports: "jvm",
    editor: "kotlin",
    server: { command: "kotlin-language-server", args: [], install: "Install kotlin-language-server: https://github.com/fwcd/kotlin-language-server" },
    commands: { test: ["gradle", "test"] },
    gitignore: ["build/", "*.class", ".gradle/"]
  },
  {
    id: "swift",
    label: "Swift",
    extensions: ["swift"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "pascal",
    manifests: ["Package.swift"],
    planning: { architectural: true },
    imports: "swift",
    editor: "swift",
    server: { command: "sourcekit-lsp", args: [], install: "sourcekit-lsp ships with the Swift toolchain: https://www.swift.org/install" },
    commands: { build: ["swift", "build"], run: ["swift", "run"], test: ["swift", "test"] },
    gitignore: [".build/", ".swiftpm/"]
  },
  {
    id: "csharp",
    label: "C#",
    extensions: ["cs"],
    comment: { line: "//", block: ["/*", "*/"] },
    naming: "pascal",
    manifests: ["*.csproj", "*.sln"],
    planning: { architectural: true },
    imports: "csharp",
    editor: "csharp",
    server: { command: "csharp-ls", args: [], install: "dotnet tool install --global csharp-ls" },
    commands: { build: ["dotnet", "build"], run: ["dotnet", "run"], test: ["dotnet", "test"] },
    gitignore: ["bin/", "obj/"]
  },
  {
    // Not scaffolded by Planning (planning: null) — known to everything else.
    // Single-file components: script imports in JS syntax, markup in HTML.
    id: "vue",
    label: "Vue",
    extensions: ["vue"],
    comment: { block: ["<!--", "-->"] },
    naming: "pascal",
    manifests: [],
    planning: null,
    imports: "js",
    editor: "html",
    server: null,
    commands: {},
    gitignore: ["node_modules/", "dist/"]
  },
  {
    id: "svelte",
    label: "Svelte",
    extensions: ["svelte"],
    comment: { block: ["<!--", "-->"] },
    naming: "pascal",
    manifests: [],
    planning: null,
    imports: "js",
    editor: "html",
    server: null,
    commands: {},
    gitignore: ["node_modules/", ".svelte-kit/"]
  }
];
function extensionMap(languages = LANGUAGES) {
  const map = {};
  for (const l of languages) for (const ext of l.extensions) if (!(ext in map)) map[ext] = l.id;
  return map;
}

// src/planning/graph/architectures.ts
var LANGUAGES2 = LANGUAGES.flatMap(
  (l) => l.planning ? [{ id: l.id, label: l.label, ext: l.extensions[0], architectural: l.planning.architectural }] : []
);
var ADD_NODE_LANGUAGES = LANGUAGES2.map((l) => l.id).filter((id) => id !== "jquery");

// src/planning/graph/naming.ts
var PLANNING_EXTENSIONS = extensionMap(LANGUAGES.filter((l) => l.planning));

// src/document/paths.ts
var DEFAULT_COMPONENT_ROOT = ".components";
var LEGACY_COMPONENT_ROOT = ".canvas";

// src/document/types.ts
var CANVAS_SCHEMA_VERSION = 1;
function isFrameNode(node) {
  return node.kind === "frame";
}
function isVectorNode(node) {
  return node.kind === "vector";
}
function childrenOf(node) {
  return isFrameNode(node) ? node.children : [];
}

// src/document/rotation.ts
var IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function multiply(n, m2) {
  return {
    a: n.a * m2.a + n.c * m2.b,
    b: n.b * m2.a + n.d * m2.b,
    c: n.a * m2.c + n.c * m2.d,
    d: n.b * m2.c + n.d * m2.d,
    e: n.a * m2.e + n.c * m2.f + n.e,
    f: n.b * m2.e + n.d * m2.f + n.f
  };
}
function apply(m2, p) {
  return { x: m2.a * p.x + m2.c * p.y + m2.e, y: m2.b * p.x + m2.d * p.y + m2.f };
}
function invert(m2) {
  const det = m2.a * m2.d - m2.b * m2.c || 1;
  return {
    a: m2.d / det,
    b: -m2.b / det,
    c: -m2.c / det,
    d: m2.a / det,
    e: (m2.c * m2.f - m2.d * m2.e) / det,
    f: (m2.b * m2.e - m2.a * m2.f) / det
  };
}
function nodeMatrix(rect, deg = 0) {
  if (!deg) return { ...IDENTITY, e: rect.x, f: rect.y };
  const r = deg * Math.PI / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: cx - cos * (rect.w / 2) + sin * (rect.h / 2),
    f: cy - sin * (rect.w / 2) - cos * (rect.h / 2)
  };
}
function quadOf(m2, w, h) {
  return [apply(m2, { x: 0, y: 0 }), apply(m2, { x: w, y: 0 }), apply(m2, { x: w, y: h }), apply(m2, { x: 0, y: h })];
}
function boundsOf(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// src/document/vector.ts
function num(n) {
  return Math.round(n * 100) / 100;
}
function polygonPoints(sides, box) {
  const n = Math.max(3, Math.round(sides));
  const raw = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
  const minX = Math.min(...raw.map((p) => p.x));
  const maxX = Math.max(...raw.map((p) => p.x));
  const minY = Math.min(...raw.map((p) => p.y));
  const maxY = Math.max(...raw.map((p) => p.y));
  return raw.map((p) => ({
    x: num(box.x + (p.x - minX) / (maxX - minX || 1) * box.w),
    y: num(box.y + (p.y - minY) / (maxY - minY || 1) * box.h)
  }));
}
function cornerRadii(style) {
  const r = style.radius;
  if (r === void 0) return [0, 0, 0, 0];
  if (typeof r === "number") return [r, r, r, r];
  return [r.tl ?? 0, r.tr ?? 0, r.br ?? 0, r.bl ?? 0];
}
function rectanglePoints(style, w, h) {
  const [tl, tr, br, bl] = cornerRadii(style);
  const corner = (x, y, radius) => radius > 0 ? { x, y, radius } : { x, y };
  return [corner(0, 0, tl), corner(w, 0, tr), corner(w, h, br), corner(0, h, bl)];
}

// src/document/vectorEdit.ts
var KAPPA = 0.5523;
function cubicAt(c, t) {
  const u = 1 - t;
  return {
    x: u * u * u * c[0].x + 3 * u * u * t * c[1].x + 3 * u * t * t * c[2].x + t * t * t * c[3].x,
    y: u * u * u * c[0].y + 3 * u * u * t * c[1].y + 3 * u * t * t * c[2].y + t * t * t * c[3].y
  };
}
function segments(points, closed) {
  const out = [];
  const n = points.length;
  const count = closed && n > 2 ? n : n - 1;
  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    out.push({ from: i, c: [a, a.out ?? a, b.in ?? b, b] });
  }
  return out;
}
var isStraight = (c) => c[0] === c[1] && c[2] === c[3];
function flattenPath(points, closed, steps = 16) {
  if (points.length === 0) return [];
  const out = [{ x: points[0].x, y: points[0].y }];
  for (const seg of segments(points, closed)) {
    if (isStraight(seg.c)) {
      out.push({ x: seg.c[3].x, y: seg.c[3].y });
      continue;
    }
    for (let s = 1; s <= steps; s += 1) out.push(cubicAt(seg.c, s / steps));
  }
  return out;
}
function mapPoint(p, f) {
  return {
    ...f(p),
    ...p.in ? { in: f(p.in) } : {},
    ...p.out ? { out: f(p.out) } : {},
    ...p.radius ? { radius: p.radius } : {}
  };
}
function localPoints(node) {
  const vb = node.viewBox ?? { w: node.rect.w, h: node.rect.h };
  const sx = node.rect.w / (vb.w || 1);
  const sy = node.rect.h / (vb.h || 1);
  return (node.points ?? []).map((p) => mapPoint(p, (q) => ({ x: q.x * sx, y: q.y * sy })));
}
function roundPoint(p) {
  const rounded = mapPoint(p, (q) => ({ x: num(q.x), y: num(q.y) }));
  return p.radius ? { ...rounded, radius: p.radius } : rounded;
}
function toEditablePath(node) {
  const { w, h } = node.rect;
  let points;
  let closed = true;
  if (node.shape === "path") {
    points = localPoints(node);
    closed = !!node.closed;
  } else if (node.shape === "ellipse") {
    const rx = w / 2;
    const ry = h / 2;
    const kx = rx * KAPPA;
    const ky = ry * KAPPA;
    points = [
      { x: rx, y: 0, in: { x: rx - kx, y: 0 }, out: { x: rx + kx, y: 0 } },
      { x: w, y: ry, in: { x: w, y: ry - ky }, out: { x: w, y: ry + ky } },
      { x: rx, y: h, in: { x: rx + kx, y: h }, out: { x: rx - kx, y: h } },
      { x: 0, y: ry, in: { x: 0, y: ry + ky }, out: { x: 0, y: ry - ky } }
    ];
  } else if (node.shape === "polygon") {
    points = polygonPoints(node.sides ?? 3, { x: 0, y: 0, w, h });
  } else {
    points = rectanglePoints(node.style, w, h);
  }
  const { sides: _sides, ...rest } = node;
  const style = node.shape === "rectangle" ? { ...node.style, radius: void 0 } : node.style;
  return { ...rest, style, shape: "path", points: points.map(roundPoint), closed, viewBox: { w, h } };
}
function refit(node) {
  const points = node.points ?? [];
  const line = flattenPath(points, !!node.closed);
  if (line.length === 0) return node;
  const minX = Math.min(...line.map((p) => p.x));
  const minY = Math.min(...line.map((p) => p.y));
  const w = Math.max(Math.max(...line.map((p) => p.x)) - minX, 1);
  const h = Math.max(Math.max(...line.map((p) => p.y)) - minY, 1);
  return {
    ...node,
    rect: { x: num(node.rect.x + minX), y: num(node.rect.y + minY), w: num(w), h: num(h) },
    viewBox: { w: num(w), h: num(h) },
    points: points.map((p) => mapPoint(p, (q) => ({ x: num(q.x - minX), y: num(q.y - minY) })))
  };
}
function moveAnchors(node, indices, from, dx, dy) {
  const points = [...node.points ?? []];
  for (const i of indices) {
    const start = from[i];
    if (!start || !points[i]) continue;
    points[i] = mapPoint(start, (q) => ({ x: num(q.x + dx), y: num(q.y + dy) }));
  }
  return { ...node, points };
}

// src/document/sceneTypes.ts
var PX_PER_METER = 100;

// src/document/placement.ts
var PLANE_ROTATION = {
  front: [0, 0, 0],
  top: [-90, 0, 0],
  side: [0, 90, 0]
};
function defaultPlacement(rect) {
  return { position: [rect.x / PX_PER_METER, -rect.y / PX_PER_METER, 0], rotation: [0, 0, 0] };
}
function placementOf(node) {
  return node.space ?? defaultPlacement(node.rect);
}
var RAD = Math.PI / 180;
function rotX([x, y, z], deg) {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [x, y * c - z * s, y * s + z * c];
}
function rotY([x, y, z], deg) {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [x * c + z * s, y, -x * s + z * c];
}
function rotZ([x, y, z], deg) {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [x * c - y * s, x * s + y * c, z];
}
function rotate(v, [rx, ry, rz]) {
  return rotX(rotY(rotZ(v, rz), ry), rx);
}
function unrotate(v, [rx, ry, rz]) {
  return rotZ(rotY(rotX(v, -rx), -ry), -rz);
}
function planeToWorld(placement, u, v, out = 0) {
  const [sx, sy, sz] = placement.scale ?? [1, 1, 1];
  const local = [u / PX_PER_METER * sx, -v / PX_PER_METER * sy, out / PX_PER_METER * sz];
  const [x, y, z] = rotate(local, placement.rotation);
  const [px, py, pz] = placement.position;
  return [x + px, y + py, z + pz];
}
function worldToPlane(placement, world) {
  const [px, py, pz] = placement.position;
  const [x, y, z] = unrotate([world[0] - px, world[1] - py, world[2] - pz], placement.rotation);
  const [sx, sy, sz] = placement.scale ?? [1, 1, 1];
  return { u: x / (sx || 1) * PX_PER_METER, v: -y / (sy || 1) * PX_PER_METER, out: z / (sz || 1) * PX_PER_METER };
}
var SAME_PX = 0.01;
var round4 = (n) => Math.round(n * 1e4) / 1e4;
function syncPlacements(prev, next) {
  let changed = false;
  const nodes = next.nodes.map((node) => {
    const space = node.space;
    if (!space) return node;
    const fromSpace = { x: Math.round(space.position[0] * PX_PER_METER * 1e3) / 1e3, y: Math.round(-space.position[1] * PX_PER_METER * 1e3) / 1e3 };
    if (Math.abs(fromSpace.x - node.rect.x) < SAME_PX && Math.abs(fromSpace.y - node.rect.y) < SAME_PX) return node;
    const before = prev?.nodes.find((n) => n.id === node.id);
    const movedIn2d = !!before?.space && before.space.position.every((m2, i) => m2 === space.position[i]) && (before.rect.x !== node.rect.x || before.rect.y !== node.rect.y);
    changed = true;
    const plane = node.sketch?.plane;
    if (movedIn2d && plane && plane.kind !== "custom") {
      const { u, v } = onPlane(before.space, node.rect.x - before.rect.x, node.rect.y - before.rect.y);
      const at = node.sketch.at ?? { u: 0, v: 0 };
      return { ...node, sketch: { ...node.sketch, at: { u: round3(at.u + u), v: round3(at.v + v) } } };
    }
    if (movedIn2d) {
      const position = [round4(node.rect.x / PX_PER_METER), round4(-node.rect.y / PX_PER_METER), space.position[2]];
      return { ...node, space: { ...space, position } };
    }
    return { ...node, rect: { ...node.rect, x: fromSpace.x, y: fromSpace.y } };
  });
  return changed ? { ...next, nodes } : next;
}
var round3 = (n) => Math.round(n * 1e3) / 1e3;
function onPlane(placement, dx, dy) {
  const [sx, sy] = placement.scale ?? [1, 1, 1];
  const right = rotate([sx, 0, 0], placement.rotation);
  const down = rotate([0, -sy, 0], placement.rotation);
  const [a, b, c, d] = [right[0], -right[1], down[0], -down[1]];
  const det = a * d - b * c;
  const size = a * a + b * b + c * c + d * d;
  if (!size) return { u: 0, v: 0 };
  if (Math.abs(det) > 1e-6 * size) return { u: (d * dx - c * dy) / det, v: (a * dy - b * dx) / det };
  return { u: (a * dx + b * dy) / size, v: (c * dx + d * dy) / size };
}
function rotateAbout(v, axis2, deg) {
  const len = Math.hypot(...axis2) || 1;
  const [kx, ky, kz] = [axis2[0] / len, axis2[1] / len, axis2[2] / len];
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  const along = (kx * v[0] + ky * v[1] + kz * v[2]) * (1 - c);
  return [
    v[0] * c + (ky * v[2] - kz * v[1]) * s + kx * along,
    v[1] * c + (kz * v[0] - kx * v[2]) * s + ky * along,
    v[2] * c + (kx * v[1] - ky * v[0]) * s + kz * along
  ];
}
function eulerOf(right, up, normal) {
  const m13 = Math.max(-1, Math.min(1, normal[0]));
  const y = Math.asin(m13);
  if (Math.abs(m13) < 0.9999999) return [Math.atan2(-normal[1], normal[2]) / RAD, y / RAD, Math.atan2(-up[0], right[0]) / RAD];
  return [Math.atan2(up[2], up[1]) / RAD, y / RAD, 0];
}
function placeInScene(placement, p) {
  const [sx, sy, sz] = placement.scale ?? [1, 1, 1];
  const [x, y, z] = rotate([p[0] * sx, p[1] * sy, p[2] * sz], placement.rotation);
  return [x + placement.position[0], y + placement.position[1], z + placement.position[2]];
}
function unplaceFromScene(placement, p) {
  const [x, y, z] = unrotate([p[0] - placement.position[0], p[1] - placement.position[1], p[2] - placement.position[2]], placement.rotation);
  const [sx, sy, sz] = placement.scale ?? [1, 1, 1];
  return [x / (sx || 1), y / (sy || 1), z / (sz || 1)];
}
function placeNormal(placement, n) {
  const [sx, sy, sz] = placement.scale ?? [1, 1, 1];
  const r = rotate([n[0] / (sx || 1), n[1] / (sy || 1), n[2] / (sz || 1)], placement.rotation);
  const len = Math.hypot(...r) || 1;
  return [r[0] / len, r[1] / len, r[2] / len];
}

// src/document/frontView.ts
function frontMatrix(placement) {
  const [sx, sy] = placement.scale ?? [1, 1, 1];
  const u = rotate([sx, 0, 0], placement.rotation);
  const v = rotate([0, -sy, 0], placement.rotation);
  return {
    a: u[0],
    b: -u[1],
    c: v[0],
    d: -v[1],
    e: placement.position[0] * PX_PER_METER,
    f: -placement.position[1] * PX_PER_METER
  };
}
function frontPoint([x, y]) {
  return { x: x * PX_PER_METER, y: -y * PX_PER_METER };
}

// src/document/doc.ts
var idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}
function createDoc(name, kind = "sketch") {
  const now = Date.now();
  return {
    version: CANVAS_SCHEMA_VERSION,
    id: nextId("canvas"),
    name,
    kind,
    nodes: [],
    components: [],
    createdAt: now,
    updatedAt: now
  };
}
var DEFAULT_FRAME_FILL = "bg-2";
var DEFAULT_FRAME_STYLE = {
  flow: "freeform",
  fills: [{ color: DEFAULT_FRAME_FILL }],
  stroke: { color: "border-1", width: 1 },
  radius: 4
};
function createFrameNode(rect, name = "Frame") {
  return {
    id: nextId("frame"),
    name,
    kind: "frame",
    rect,
    style: { ...DEFAULT_FRAME_STYLE },
    children: []
  };
}
var DEFAULT_VECTOR_COLOR = "#d9d9d9";
var VECTOR_NAMES = { rectangle: "Rectangle", ellipse: "Ellipse", polygon: "Polygon", path: "Vector" };
function createVectorNode(rect, shape, extra = {}) {
  const name = shape === "polygon" && (extra.sides ?? 3) === 3 ? "Triangle" : VECTOR_NAMES[shape];
  return {
    id: nextId("vector"),
    name,
    kind: "vector",
    rect,
    style: shape === "path" ? { stroke: { color: DEFAULT_VECTOR_COLOR, width: 2 } } : { fills: [{ type: "solid", color: DEFAULT_VECTOR_COLOR }] },
    shape,
    ...shape === "polygon" ? { sides: extra.sides ?? 3 } : {},
    ...shape === "path" ? { points: extra.points ?? [], closed: !!extra.closed, viewBox: extra.viewBox ?? { w: rect.w, h: rect.h } } : {}
  };
}
function walk(doc, visit) {
  const step = (nodes, parent) => {
    for (const node of nodes) {
      visit(node, parent);
      if (isFrameNode(node)) step(node.children, node);
    }
  };
  step(doc.nodes, null);
}
var indexes = /* @__PURE__ */ new WeakMap();
function indexOf(doc) {
  let index = indexes.get(doc);
  if (!index) {
    const built = { nodes: /* @__PURE__ */ new Map(), parents: /* @__PURE__ */ new Map() };
    walk(doc, (node, parent) => {
      built.nodes.set(node.id, node);
      built.parents.set(node.id, parent);
    });
    index = built;
    indexes.set(doc, index);
  }
  return index;
}
function findNode(doc, id) {
  return indexOf(doc).nodes.get(id) ?? null;
}
function ancestorsOf(doc, id) {
  const { parents } = indexOf(doc);
  const path2 = [];
  for (let parent = parents.get(id) ?? null; parent; parent = parents.get(parent.id) ?? null) path2.unshift(parent);
  return path2;
}
function boardRectOf(doc, id, measured) {
  const node = findNode(doc, id);
  if (!node) return null;
  const top = ancestorsOf(doc, id)[0] ?? node;
  if (top.space && doc.nodes.includes(top)) {
    const m2 = boardMatrixOf(doc, id, measured);
    const size = measured?.get(id) ?? node.rect;
    return m2 ? boundsOf(quadOf(m2, size.w, size.h)) : null;
  }
  const direct = measured?.get(id);
  if (direct) return direct;
  let x = node.rect.x;
  let y = node.rect.y;
  const ancestors = ancestorsOf(doc, id);
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const ancestor = ancestors[i];
    const box = measured?.get(ancestor.id);
    if (box) return { x: x + box.x, y: y + box.y, w: node.rect.w, h: node.rect.h };
    x += ancestor.rect.x;
    y += ancestor.rect.y;
  }
  return { x, y, w: node.rect.w, h: node.rect.h };
}
function planeRectOf(doc, id, measured) {
  const node = findNode(doc, id);
  if (!node) return null;
  const top = ancestorsOf(doc, id)[0] ?? node;
  if (!top.space || !doc.nodes.includes(top)) return boardRectOf(doc, id, measured);
  if (top === node) return { x: 0, y: 0, w: node.rect.w, h: node.rect.h };
  const box = measured?.get(id);
  if (box) return box;
  let x = node.rect.x;
  let y = node.rect.y;
  for (const ancestor of ancestorsOf(doc, id).slice(1)) {
    x += ancestor.rect.x;
    y += ancestor.rect.y;
  }
  return { x, y, w: node.rect.w, h: node.rect.h };
}
function boardMatrixOf(doc, id, measured) {
  const node = findNode(doc, id);
  if (!node) return null;
  let m2 = IDENTITY;
  let plane = IDENTITY;
  const chain2 = [...ancestorsOf(doc, id), node];
  chain2.forEach((n, i) => {
    const topLevel = i === 0 && doc.nodes.includes(n);
    m2 = stepMatrix(n, m2, topLevel, plane, measured);
    plane = planeBelow(n, topLevel, plane);
  });
  return m2;
}
function planeBelow(node, topLevel, inherited) {
  return topLevel && node.space ? frontMatrix(node.space) : inherited;
}
function stepMatrix(node, parent, topLevel, plane, measured) {
  if (topLevel && node.space) return multiply(frontMatrix(node.space), nodeMatrix({ ...node.rect, x: 0, y: 0 }, node.style.rotate));
  const box = measured?.get(node.id);
  return box ? multiply(plane, nodeMatrix(box, node.style.rotate)) : multiply(parent, nodeMatrix(node.rect, node.style.rotate));
}
function rewrite(nodes, id, fn) {
  let changed = false;
  const out = [];
  for (const node of nodes) {
    if (node.id === id) {
      changed = true;
      const next = fn(node);
      if (next) out.push(next);
      continue;
    }
    if (isFrameNode(node)) {
      const children = rewrite(node.children, id, fn);
      if (children !== node.children) {
        changed = true;
        out.push({ ...node, children });
        continue;
      }
    }
    out.push(node);
  }
  return changed ? out : nodes;
}
function touch(doc, nodes) {
  return { ...doc, nodes, updatedAt: Date.now() };
}
function deleteNode(doc, id) {
  if (!findNode(doc, id)) return doc;
  return touch(doc, rewrite(doc.nodes, id, () => null));
}
function updateNode(doc, id, patch) {
  if (!findNode(doc, id)) return doc;
  const { children: _ignored, ...safe } = patch;
  return touch(doc, rewrite(doc.nodes, id, (node) => ({ ...node, ...safe })));
}

// src/document/objects.ts
var SMOOTHNESS = {
  low: { tolerance: 2, steps: 16, label: "Low" },
  medium: { tolerance: 0.25, steps: 48, label: "Medium" },
  high: { tolerance: 0.04, steps: 128, label: "High" }
};
function toleranceOf(feature, size) {
  const base = SMOOTHNESS[feature?.smoothness ?? "medium"].tolerance;
  return size && size > 0 ? base * Math.min(1, Math.max(0.02, size / PX_PER_METER)) : base;
}
function objectsOf(doc) {
  return doc.objects ?? [];
}
function profilesOf(feature) {
  if (feature.kind === "loft") return feature.sketchIds;
  return feature.regions?.length ? feature.regions : [feature.sketchId];
}
function inputsOf(feature) {
  const sketches = feature.kind === "loft" ? feature.sketchIds : [feature.sketchId, ...feature.regions ?? []];
  return feature.kind === "sweep" ? [...sketches, feature.pathId] : sketches;
}
function featureOf(doc, layerId) {
  for (const object of objectsOf(doc)) {
    for (const feature of object.features) {
      if (feature.kind !== "loft" && feature.sketchId === layerId && !feature.regions?.length) return { object, feature };
    }
  }
  return null;
}
function solidOf(doc, layerId) {
  const feature = featureOf(doc, layerId)?.feature;
  if (!feature || feature.hidden) return void 0;
  if (feature.kind === "extrude") return { kind: "extrude", depth: feature.depth };
  if (feature.kind === "revolve") return { kind: "revolve", axis: feature.axis, angle: feature.angle, steps: feature.steps };
  if (feature.kind === "sweep") return { kind: "sweep", pathId: feature.pathId, ...feature.samples ? { samples: feature.samples } : {} };
  return void 0;
}
var KIND_NAMES = { extrude: "Extrude", revolve: "Revolve", sweep: "Sweep", loft: "Loft" };
function nextFeatureName(doc, kind) {
  const used = new Set(objectsOf(doc).flatMap((o) => o.features.map((f) => f.name)));
  let n = 1;
  while (used.has(`${KIND_NAMES[kind]} ${n}`)) n += 1;
  return `${KIND_NAMES[kind]} ${n}`;
}
function featureFrom(doc, layerId, spec, keep) {
  const base = {
    id: keep?.id ?? nextId("feature"),
    name: keep && keep.kind === spec.kind ? keep.name : nextFeatureName(doc, spec.kind),
    op: keep?.op ?? "new",
    sketchId: layerId,
    // Kept across an edit of its numbers: whether it's on, and how smooth.
    ...keep?.hidden ? { hidden: true } : {},
    ...keep?.smoothness ? { smoothness: keep.smoothness } : {}
  };
  if (spec.kind === "extrude") return { ...base, kind: "extrude", depth: spec.depth, ...keep?.kind === "extrude" && keep.direction ? { direction: keep.direction } : {}, ...keep?.kind === "extrude" && keep.tweaks ? { tweaks: keep.tweaks } : {} };
  if (spec.kind === "revolve") return { ...base, kind: "revolve", axis: spec.axis, angle: spec.angle, steps: spec.steps };
  return { ...base, kind: "sweep", pathId: spec.pathId, ...spec.samples ? { samples: spec.samples } : {} };
}
function setSolidOf(doc, layerId, spec, layerName = "Object") {
  const found = featureOf(doc, layerId);
  const objects = objectsOf(doc);
  if (!found) {
    if (!spec) return doc;
    const object = { id: nextId("object"), name: layerName, features: [featureFrom(doc, layerId, spec)] };
    return { ...doc, objects: [...objects, object] };
  }
  const next = objects.flatMap((object) => {
    if (object !== found.object) return [object];
    const features = spec ? object.features.map((f) => f === found.feature ? featureFrom(doc, layerId, spec, f) : f) : object.features.filter((f) => f !== found.feature);
    return features.length ? [{ ...object, features }] : [];
  });
  return { ...doc, objects: next };
}
function aliveLayers(doc) {
  const alive = /* @__PURE__ */ new Set();
  const visit = (nodes) => {
    for (const n of nodes) {
      alive.add(n.id);
      visit(childrenOf(n));
    }
  };
  visit(doc.nodes);
  for (const c of doc.components) visit((c.variants ?? []).flatMap((v) => v?.root ? [v.root] : []));
  return alive;
}
function featureProblem(feature, alive) {
  if (feature.kind === "loft") return feature.sketchIds.every((id) => alive.has(id)) ? null : "A sketch it lofts through was deleted";
  if (!alive.has(feature.sketchId) || feature.regions?.some((id) => !alive.has(id))) return "Its sketch was deleted";
  if (feature.kind === "sweep" && !alive.has(feature.pathId)) return "The path it follows was deleted";
  return null;
}
function brokenFeatures(doc) {
  const out = /* @__PURE__ */ new Map();
  if (!doc.objects?.length) return out;
  const alive = aliveLayers(doc);
  for (const object of doc.objects) {
    for (const feature of object.features) {
      const problem = featureProblem(feature, alive);
      if (problem) out.set(feature.id, problem);
    }
  }
  return out;
}
function renameObject(doc, objectId, name) {
  return { ...doc, objects: objectsOf(doc).map((o) => o.id === objectId ? { ...o, name } : o) };
}
function partReading(doc, layerId) {
  for (const object of objectsOf(doc)) {
    for (const feature of object.features) if (inputsOf(feature).includes(layerId)) return { object, feature };
  }
  return null;
}
function onFaceOf(ref, objectId) {
  if (!ref) return false;
  if (ref.kind === "face") return ref.objectId === objectId;
  return ref.kind === "offset" ? onFaceOf(ref.from, objectId) : false;
}
function partPlacementFor(doc, object, layerId) {
  if (!object.placement) return null;
  const top = ancestorsOf(doc, layerId)[0] ?? findNode(doc, layerId);
  return onFaceOf(top?.sketch?.plane, object.id) ? null : object.placement;
}
function partPlacementOf(doc, layerId) {
  const reading = partReading(doc, layerId);
  return reading ? partPlacementFor(doc, reading.object, layerId) : null;
}
function setPartPlacement(doc, objectId, placement) {
  return { ...doc, objects: objectsOf(doc).map((o) => o.id === objectId ? { ...o, placement } : o) };
}
function removeFeature(doc, featureId) {
  if (!objectsOf(doc).some((o) => o.features.some((f) => f.id === featureId))) return doc;
  const objects = objectsOf(doc).flatMap((object) => {
    const features = object.features.filter((f) => f.id !== featureId);
    return features.length === object.features.length ? [object] : features.length ? [{ ...object, features }] : [];
  });
  return { ...doc, objects };
}
function addFeature(doc, objectId, layerId, spec) {
  const feature = { ...featureFrom(doc, layerId, spec), op: "add" };
  return { doc: { ...doc, objects: objectsOf(doc).map((o) => o.id === objectId ? { ...o, features: [...o.features, feature] } : o) }, featureId: feature.id };
}
function removeObject(doc, objectId) {
  if (!objectsOf(doc).some((o) => o.id === objectId)) return doc;
  return { ...doc, objects: objectsOf(doc).filter((o) => o.id !== objectId) };
}
function migrateLayerSolids(doc) {
  const found = [];
  const strip = (nodes2) => nodes2.map((node) => {
    const legacy = node.solid;
    const children = "children" in node && Array.isArray(node.children) ? strip(node.children) : null;
    if (!legacy && (!children || children.every((c, i) => c === node.children[i]))) return node;
    const { solid: _solid, ...rest } = node;
    if (legacy) found.push({ id: node.id, name: node.name, solid: legacy });
    return children ? { ...rest, children } : rest;
  });
  const nodes = strip(doc.nodes);
  const components = doc.components.map((c) => {
    if (!Array.isArray(c.variants)) return c;
    const variants = c.variants.map((v) => {
      if (!v?.root) return v;
      const [root] = strip([v.root]);
      return root === v.root ? v : { ...v, root };
    });
    return variants.every((v, i) => v === c.variants[i]) ? c : { ...c, variants };
  });
  if (!found.length && components.every((c, i) => c === doc.components[i])) return doc;
  let next = { ...doc, nodes, components };
  for (const { id, name, solid: solid2 } of found) next = setSolidOf(next, id, solid2, name);
  return next;
}
function updateFeature(doc, featureId, patch) {
  let changed = false;
  const objects = objectsOf(doc).map((object) => {
    if (!object.features.some((f) => f.id === featureId)) return object;
    changed = true;
    return { ...object, features: object.features.map((f) => f.id === featureId ? { ...f, ...patch } : f) };
  });
  return changed ? { ...doc, objects } : doc;
}
function usedLayers(doc) {
  return new Set(objectsOf(doc).flatMap((o) => o.features.flatMap(inputsOf)));
}

// src/document/documentKind.ts
function documentKindOf(doc) {
  if (doc.kind) return doc.kind;
  const in3d = (doc.objects?.length ?? 0) > 0 || doc.nodes.some((n) => n.space || n.sketch);
  return in3d ? "environment" : "sketch";
}
function withKind(doc) {
  return doc.kind ? doc : { ...doc, kind: documentKindOf(doc) };
}
var KIND_NAMES2 = { sketch: "Sketch", environment: "Environment" };

// src/canvas/io/docFormat.ts
var CANVAS_DIR = `${DEFAULT_COMPONENT_ROOT}/.boards`;
function canvasDocPath(id) {
  return `${CANVAS_DIR}/${id}.json`;
}
function serializeDoc(doc) {
  return JSON.stringify(doc, null, 2);
}
function parseDoc(content) {
  let raw;
  try {
    raw = JSON.parse(renameLegacyPaths(content));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const doc = raw;
  if (!doc.id || !Array.isArray(doc.nodes)) return null;
  return withKind(migrateLayerSolids({
    version: doc.version ?? CANVAS_SCHEMA_VERSION,
    id: doc.id,
    name: doc.name ?? "Untitled",
    ...doc.kind === "sketch" || doc.kind === "environment" ? { kind: doc.kind } : {},
    nodes: doc.nodes,
    components: doc.components ?? [],
    // Dropping this silently undid "New folder" on every reload — the one
    // thing componentFolders exists to survive (see types.ts).
    ...Array.isArray(doc.componentFolders) ? { componentFolders: doc.componentFolders } : {},
    ...Array.isArray(doc.objects) && doc.objects.length ? { objects: doc.objects } : {},
    camera: doc.camera,
    createdAt: doc.createdAt ?? Date.now(),
    updatedAt: doc.updatedAt ?? Date.now()
  }));
}
function renameLegacyPaths(content) {
  if (!content.includes(`"${LEGACY_COMPONENT_ROOT}`)) return content;
  return content.split(`"${LEGACY_COMPONENT_ROOT}/`).join(`"${DEFAULT_COMPONENT_ROOT}/`).split(`"${LEGACY_COMPONENT_ROOT}"`).join(`"${DEFAULT_COMPONENT_ROOT}"`);
}

// src/document/placements.ts
function linkedLayerId(placementId, sourceId) {
  return `${placementId}~${sourceId}`;
}
function copyTree(node, placementId) {
  const copy = { ...node, id: linkedLayerId(placementId, node.id) };
  if (node.repeatOf) copy.repeatOf = linkedLayerId(placementId, node.repeatOf);
  delete copy.space;
  delete copy.sketch;
  delete copy.request;
  if (isFrameNode(node) && isFrameNode(copy)) copy.children = node.children.map((child) => copyTree(child, placementId));
  return copy;
}
function linkedContent(source, link, placementId) {
  if (link.frame) {
    const frame = source.nodes.find((n) => n.id === link.frame);
    if (!frame) return null;
    return { ...copyTree(frame, placementId), id: placementId, rect: { ...frame.rect, x: 0, y: 0 } };
  }
  const layers = source.nodes.filter((n) => !n.hidden);
  if (layers.length === 0) return null;
  if (layers.length === 1 && isFrameNode(layers[0])) {
    return { ...copyTree(layers[0], placementId), id: placementId, name: source.name, rect: { ...layers[0].rect, x: 0, y: 0 } };
  }
  const left = Math.min(...layers.map((n) => n.rect.x));
  const top = Math.min(...layers.map((n) => n.rect.y));
  const right = Math.max(...layers.map((n) => n.rect.x + n.rect.w));
  const bottom = Math.max(...layers.map((n) => n.rect.y + n.rect.h));
  return {
    id: placementId,
    name: source.name,
    kind: "frame",
    rect: { x: 0, y: 0, w: right - left, h: bottom - top },
    style: {},
    children: layers.map((n) => {
      const copy = copyTree(n, placementId);
      return { ...copy, rect: { ...copy.rect, x: n.rect.x - left, y: n.rect.y - top } };
    })
  };
}
function placedSketch(source, link, placementId) {
  const content = linkedContent(source, link, placementId);
  return content && { ...content, sketch: { plane: { kind: "default", plane: "front" }, link } };
}
function linksOf(doc) {
  return doc.nodes.flatMap((node) => node.sketch?.link ? [{ node, link: node.sketch.link }] : []);
}
function refreshLinks(doc, load) {
  const missing = [];
  let changed = false;
  const nodes = doc.nodes.map((node) => {
    const link = node.sketch?.link;
    if (!link) return node;
    const source = load(link.doc);
    const content = source ? linkedContent(source, link, node.id) : null;
    if (!content) {
      missing.push(node.id);
      return node;
    }
    const next = {
      ...content,
      rect: { ...content.rect, x: node.rect.x, y: node.rect.y },
      sketch: node.sketch,
      space: node.space,
      hidden: node.hidden,
      locked: node.locked
    };
    if (next.hidden === void 0) delete next.hidden;
    if (next.locked === void 0) delete next.locked;
    if (next.space === void 0) delete next.space;
    if (JSON.stringify(next) === JSON.stringify(node)) return node;
    changed = true;
    return next;
  });
  return { doc: changed ? { ...doc, nodes } : doc, missing };
}
function unlinkSketch(doc, id) {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      if (node.id !== id || !node.sketch?.link) return node;
      const { link: _link, ...sketch } = node.sketch;
      return { ...node, sketch };
    })
  };
}
function linkOfLayer(doc, id) {
  for (const node of doc.nodes) {
    if (!node.sketch?.link) continue;
    if (node.id === id || id.startsWith(`${node.id}~`)) return { node, link: node.sketch.link };
  }
  return null;
}

// src/document/pathGuide.ts
var CURVE_SAMPLES = 32;
var ELLIPSE_SAMPLES = 128;
function cubic(a, c1, c2, b, t) {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y
  };
}
function guidePolyline(guide) {
  const { x, y, w, h } = guide.rect;
  switch (guide.shape) {
    case "ellipse": {
      const points = Array.from({ length: ELLIPSE_SAMPLES }, (_, i) => {
        const a = -Math.PI / 2 + i / ELLIPSE_SAMPLES * 2 * Math.PI;
        return { x: x + w / 2 + w / 2 * Math.cos(a), y: y + h / 2 + h / 2 * Math.sin(a) };
      });
      return { points, closed: true };
    }
    case "polygon":
      return { points: polygonPoints(guide.sides ?? 3, { x, y, w, h }), closed: true };
    case "path": {
      const src = guide.points ?? [];
      const vb = guide.viewBox ?? { w, h };
      const sx = w / (vb.w || 1);
      const sy = h / (vb.h || 1);
      const map = (q) => ({ x: x + q.x * sx, y: y + q.y * sy });
      const pts = src.map((p) => ({ at: map(p), in: p.in && map(p.in), out: p.out && map(p.out) }));
      const closed = !!guide.closed && pts.length > 2;
      if (pts.length === 0) return { points: [], closed: false };
      const out = [pts[0].at];
      const segment = (from, to) => {
        if (!from.out && !to.in) {
          out.push(to.at);
          return;
        }
        const c1 = from.out ?? from.at;
        const c2 = to.in ?? to.at;
        for (let i = 1; i <= CURVE_SAMPLES; i += 1) out.push(cubic(from.at, c1, c2, to.at, i / CURVE_SAMPLES));
      };
      for (let i = 1; i < pts.length; i += 1) segment(pts[i - 1], pts[i]);
      if (closed) {
        segment(pts[pts.length - 1], pts[0]);
        out.pop();
      }
      return { points: out, closed };
    }
    default:
      return {
        points: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h }
        ],
        closed: true
      };
  }
}

// src/modeling/geometry/shape.ts
var DEFAULT_TOLERANCE = 0.25;
var MAX_SEGMENTS = 256;
function shapeOf(node, tolerance = DEFAULT_TOLERANCE) {
  const { w, h } = node.rect;
  if (!(w > 0 && h > 0)) return null;
  switch (node.kind) {
    case "frame":
      return { contours: [flattenPath2(rectanglePoints(node.style, w, h), true, tolerance)] };
    case "vector":
      return vectorShapeOf(node, tolerance);
    case "instance":
    case "external":
      return { contours: [roundedRect(w, h, cornerRadii(node.style), tolerance)] };
    case "text":
      return null;
  }
}
function vectorShapeOf(node, tolerance) {
  const { w, h } = node.rect;
  switch (node.shape) {
    case "rectangle":
      return { contours: [flattenPath2(rectanglePoints(node.style, w, h), true, tolerance)] };
    case "ellipse":
      return { contours: [ellipse(w / 2, h / 2, w / 2, h / 2, tolerance)] };
    case "polygon":
      return { contours: [polygonPoints(node.sides ?? 3, { x: 0, y: 0, w, h })] };
    case "path": {
      if (!node.closed || (node.points?.length ?? 0) < 3) return null;
      const vb = node.viewBox ?? { w, h };
      const sx = w / (vb.w || 1);
      const sy = h / (vb.h || 1);
      const scaled = (node.points ?? []).map((p) => ({
        x: p.x * sx,
        y: p.y * sy,
        ...p.in ? { in: { x: p.in.x * sx, y: p.in.y * sy } } : {},
        ...p.out ? { out: { x: p.out.x * sx, y: p.out.y * sy } } : {},
        ...p.radius ? { radius: p.radius } : {}
      }));
      return { contours: [flattenPath2(scaled, true, tolerance)] };
    }
  }
}
function flattenPath2(points, closed, tolerance = DEFAULT_TOLERANCE) {
  const n = points.length;
  if (n === 0) return [];
  const out = [];
  const push2 = (p) => {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) out.push({ x: p.x, y: p.y });
  };
  const curved = (from, to) => !!(from.out || to.in);
  const fillets = points.map((p, i) => {
    if (!p.radius || p.radius <= 0) return null;
    if (!closed && (i === 0 || i === n - 1)) return null;
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    if (curved(prev, p) || curved(p, next)) return null;
    return fillet(prev, p, next, p.radius);
  });
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const f = fillets[i];
    if (f) {
      push2(f.start);
      for (const q of arcPoints(f, tolerance)) push2(q);
    } else push2(p);
    const last = i === n - 1;
    if (last && !closed) break;
    const next = points[(i + 1) % n];
    if (curved(p, next)) {
      const from = f ? f.end : p;
      for (const q of cubicPoints(from, p.out ?? p, next.in ?? next, next, tolerance)) push2(q);
    }
  }
  if (closed && out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) out.pop();
  }
  return out;
}
function cubicPoints(p0, p1, p2, p3, tolerance = DEFAULT_TOLERANCE) {
  const dd = Math.max(
    Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y),
    Math.hypot(p1.x - 2 * p2.x + p3.x, p1.y - 2 * p2.y + p3.y)
  );
  const segments2 = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(Math.sqrt(0.75 * dd / tolerance))));
  const out = [];
  for (let i = 1; i <= segments2; i += 1) {
    const t = i / segments2;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    });
  }
  return out;
}
function fillet(a, p, b, radius) {
  const la = Math.hypot(a.x - p.x, a.y - p.y);
  const lb = Math.hypot(b.x - p.x, b.y - p.y);
  if (la === 0 || lb === 0) return null;
  const u = { x: (a.x - p.x) / la, y: (a.y - p.y) / la };
  const v = { x: (b.x - p.x) / lb, y: (b.y - p.y) / lb };
  const cos = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
  const half = Math.acos(cos) / 2;
  if (half < 1e-6 || Math.PI / 2 - half < 1e-6) return null;
  const setback = Math.min(radius / Math.tan(half), la / 2, lb / 2);
  const r = setback * Math.tan(half);
  const bis = { x: u.x + v.x, y: u.y + v.y };
  const bl = Math.hypot(bis.x, bis.y);
  const dist = r / Math.sin(half);
  const center = { x: p.x + bis.x / bl * dist, y: p.y + bis.y / bl * dist };
  const start = { x: p.x + u.x * setback, y: p.y + u.y * setback };
  const end = { x: p.x + v.x * setback, y: p.y + v.y * setback };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  let sweep2 = Math.atan2(end.y - center.y, end.x - center.x) - startAngle;
  while (sweep2 > Math.PI) sweep2 -= 2 * Math.PI;
  while (sweep2 < -Math.PI) sweep2 += 2 * Math.PI;
  return { start, end, center, radius: r, startAngle, sweep: sweep2 };
}
function arcPoints(f, tolerance) {
  const steps = arcSegments(f.radius, Math.abs(f.sweep), tolerance);
  const out = [];
  for (let i = 1; i < steps; i += 1) {
    const a = f.startAngle + f.sweep * i / steps;
    out.push({ x: f.center.x + f.radius * Math.cos(a), y: f.center.y + f.radius * Math.sin(a) });
  }
  out.push(f.end);
  return out;
}
function arcSegments(radius, angle, tolerance) {
  if (radius <= tolerance) return 1;
  const perChord = 2 * Math.acos(1 - tolerance / radius);
  return Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(angle / perChord)));
}
function ellipse(cx, cy, rx, ry, tolerance = DEFAULT_TOLERANCE) {
  const steps = Math.max(8, arcSegments(Math.max(rx, ry), 2 * Math.PI, tolerance));
  return Array.from({ length: steps }, (_, i) => {
    const a = -Math.PI / 2 + i / steps * 2 * Math.PI;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}
function roundedRect(w, h, radii, tolerance = DEFAULT_TOLERANCE) {
  const [tl, tr, br, bl] = radii;
  const corner = (x, y, radius) => radius > 0 ? { x, y, radius } : { x, y };
  return flattenPath2([corner(0, 0, tl), corner(w, 0, tr), corner(w, h, br), corner(0, h, bl)], true, tolerance);
}
function signedArea(contour) {
  let sum = 0;
  for (let i = 0, n = contour.length; i < n; i += 1) {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}
function containsPoint(contour, p) {
  let inside = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i, i += 1) {
    const a = contour[i];
    const b = contour[j];
    if (a.y > p.y !== b.y > p.y && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function normalizeWinding(shape) {
  const contours = shape.contours.filter((c) => c.length >= 3);
  return {
    contours: contours.map((c) => {
      const depth = contours.filter((other) => other !== c && containsPoint(other, c[0])).length;
      const wantSolid = depth % 2 === 0;
      return signedArea(c) > 0 === wantSolid ? c : [...c].reverse();
    })
  };
}

// node_modules/earcut/src/earcut.js
var steiners = /* @__PURE__ */ new Set();
var filteredOut = false;
function earcut(data, holeIndices, dim = 2) {
  const hasHoles = holeIndices && holeIndices.length;
  const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
  if (steiners.size) steiners.clear();
  let outerNode = linkedList(data, 0, outerLen, dim, true);
  const triangles = [];
  if (!outerNode || outerNode.next === outerNode.prev) return triangles;
  let minX = 0, minY = 0, invSize = 0;
  if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
  if (data.length > 80 * dim) {
    minX = data[0];
    minY = data[1];
    let maxX = minX;
    let maxY = minY;
    for (let i = dim; i < outerLen; i += dim) {
      const x = data[i];
      const y = data[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    invSize = Math.max(maxX - minX, maxY - minY);
    invSize = invSize !== 0 ? 32767 / invSize : 0;
  }
  earcutLinked(outerNode, triangles, minX, minY, invSize);
  return triangles;
}
function linkedList(data, start, end, dim, clockwise) {
  let last = null;
  if (clockwise === signedArea2(data, start, end, dim) > 0) {
    for (let i = start; i < end; i += dim) last = insertNode(i / dim | 0, data[i], data[i + 1], last);
  } else {
    for (let i = end - dim; i >= start; i -= dim) last = insertNode(i / dim | 0, data[i], data[i + 1], last);
  }
  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}
function filterPoints(start, end = start) {
  const full = end === start;
  let p = start, again;
  do {
    again = false;
    if (p !== p.next && (steiners.size === 0 || !steiners.has(p)) && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      if (full || p === end) end = p.prev;
      filteredOut = true;
      removeNode(p);
      p = p.prev;
      again = true;
    } else if (full || p !== end) {
      p = p.next;
      again = !full;
    }
  } while (again || p !== end);
  return end;
}
function earcutLinked(ear, triangles, minX, minY, invSize) {
  if (invSize) indexCurve(ear, minX, minY, invSize);
  let stop = ear, cured = false;
  while (ear.prev !== ear.next) {
    const prev = ear.prev;
    const next = ear.next;
    if (area(prev, ear, next) < 0 && (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear))) {
      triangles.push(prev.i, ear.i, next.i);
      removeNode(ear);
      ear = next;
      stop = next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      filteredOut = false;
      ear = filterPoints(ear);
      if (filteredOut) {
        stop = ear;
        continue;
      }
      if (!cured) {
        ear = cureLocalIntersections(ear, triangles);
        stop = ear;
        cured = true;
        continue;
      }
      splitEarcut(ear, triangles, minX, minY, invSize);
      break;
    }
  }
}
function isEar(ear) {
  const a = ear.prev, b = ear, c = ear.next, ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y, x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);
  let p = c.next;
  while (p !== a) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && !(ax === p.x && ay === p.y) && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}
function isEarHashed(ear, minX, minY, invSize) {
  const a = ear.prev, b = ear, c = ear.next, ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y, x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy), minZ = zOrder(x0, y0, minX, minY, invSize), maxZ = zOrder(x1, y1, minX, minY, invSize);
  let p = ear.prevZ;
  while (p && p.z >= minZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== c && !(ax === p.x && ay === p.y) && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.prevZ;
  }
  let n = ear.nextZ;
  while (n && n.z <= maxZ) {
    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== c && !(ax === n.x && ay === n.y) && pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
    n = n.nextZ;
  }
  return true;
}
function cureLocalIntersections(start, triangles) {
  let p = start;
  let cured = false;
  do {
    const a = p.prev, b = p.next.next;
    if (intersects(a, p, p.next, b, false) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i, p.i, b.i);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
      cured = true;
    }
    p = p.next;
  } while (p !== start);
  return cured ? filterPoints(p) : p;
}
function splitEarcut(start, triangles, minX, minY, invSize) {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c = splitPolygon(a, b);
        a = filterPoints(a, a.next);
        c = filterPoints(c, c.next);
        earcutLinked(a, triangles, minX, minY, invSize);
        earcutLinked(c, triangles, minX, minY, invSize);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}
var indexActive = false;
function eliminateHoles(data, holeIndices, outerNode, dim) {
  const queue = [];
  for (let i = 0, len = holeIndices.length; i < len; i++) {
    const start = holeIndices[i] * dim;
    const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
    const list = (
      /** @type {Node} */
      linkedList(data, start, end, dim, false)
    );
    if (list === list.next) steiners.add(list);
    queue.push(getLeftmost(list));
  }
  queue.sort(compareXYSlope);
  buildBlockIndex(data.length / dim, holeIndices.length);
  indexSegment(outerNode, outerNode);
  indexActive = true;
  for (let i = 0; i < queue.length; i++) {
    outerNode = eliminateHole(queue[i], outerNode);
  }
  indexActive = false;
  return filterPoints(outerNode);
}
function compareXYSlope(a, b) {
  return a.x - b.x || a.y - b.y || (a.next.y - a.y) / (a.next.x - a.x) - (b.next.y - b.y) / (b.next.x - b.x);
}
function eliminateHole(hole, outerNode) {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) {
    return outerNode;
  }
  const bridgeReverse = splitPolygon(bridge, hole);
  const bridge2 = bridgeReverse.next;
  indexSegment(bridge, bridge2.next);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next);
}
var K = 16;
var blockBBox = new Float64Array(0);
var numBlocks = 0;
var blockHead = [];
var blockStop = [];
function buildBlockIndex(maxNodes, numHoles) {
  const maxBlocks = Math.ceil((maxNodes + 2 * numHoles) / K) + numHoles + 2;
  if (blockBBox.length < maxBlocks * 4) blockBBox = new Float64Array(maxBlocks * 4);
  numBlocks = 0;
}
function indexSegment(head, stop) {
  let p = head;
  do {
    const b = numBlocks++;
    blockHead[b] = p;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let k = 0;
    do {
      const c = p.next;
      p.z = b;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
      p = c;
    } while (++k < K && p !== stop);
    blockStop[b] = p;
    const g = b * 4;
    blockBBox[g] = minX;
    blockBBox[g + 1] = minY;
    blockBBox[g + 2] = maxX;
    blockBBox[g + 3] = maxY;
  } while (p !== stop);
}
function growBlock(head, tail) {
  const g = head.z * 4;
  if (tail.x < blockBBox[g]) blockBBox[g] = tail.x;
  if (tail.y < blockBBox[g + 1]) blockBBox[g + 1] = tail.y;
  if (tail.x > blockBBox[g + 2]) blockBBox[g + 2] = tail.x;
  if (tail.y > blockBBox[g + 3]) blockBBox[g + 3] = tail.y;
}
function liveBlockStop(b) {
  let stop = blockStop[b];
  while (stop.prev.next !== stop) stop = stop.next;
  blockStop[b] = stop;
  return stop;
}
function liveBlockHead(b) {
  let head = blockHead[b];
  while (head.prev.next !== head) head = head.next;
  blockHead[b] = head;
  return head;
}
function findHoleBridge(hole, outerNode) {
  let p = outerNode;
  const hx = hole.x;
  const hy = hole.y;
  let qx = -Infinity;
  let m2;
  if (equals(hole, p)) return p;
  for (let b = 0, g = 0; b < numBlocks; b++, g += 4) {
    if (hy < blockBBox[g + 1] || hy > blockBBox[g + 3] || blockBBox[g] > hx || blockBBox[g + 2] <= qx) continue;
    const stop = liveBlockStop(b);
    p = liveBlockHead(b);
    do {
      if (p.prev.next === p) {
        if (equals(hole, p.next)) return p.next;
        else if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
          const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
          if (x <= hx && x > qx) {
            qx = x;
            m2 = p.x < p.next.x ? p : p.next;
            if (x === hx) return m2;
          }
        }
      }
      p = p.next;
    } while (p !== stop);
  }
  if (!m2) return null;
  const mx = m2.x;
  const my = m2.y;
  const tminY = Math.min(hy, my);
  const tmaxY = Math.max(hy, my);
  let tanMin = Infinity;
  for (let b = 0, g = 0; b < numBlocks; b++, g += 4) {
    if (blockBBox[g + 2] < mx || blockBBox[g] > hx || blockBBox[g + 3] < tminY || blockBBox[g + 1] > tmaxY) continue;
    const stop = liveBlockStop(b);
    p = liveBlockHead(b);
    do {
      if (p.prev.next === p && hx >= p.x && p.x >= mx && hx !== p.x && // skip dead nodes
      pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
        const tan = Math.abs(hy - p.y) / (hx - p.x);
        if ((locallyInside(p, hole) || p.y === hy && p.next.y === hy && p.next.x > hx) && (tan < tanMin || tan === tanMin && (p.x > m2.x || p.x === m2.x && sectorContainsSector(m2, p)))) {
          m2 = p;
          tanMin = tan;
        }
      }
      p = p.next;
    } while (p !== stop);
  }
  return m2;
}
function sectorContainsSector(m2, p) {
  return area(m2.prev, m2, p.prev) < 0 && area(p.next, m2, m2.next) < 0;
}
var sortArr = [];
var sortBuf = [];
var zArr = new Uint32Array(0);
var zBuf = new Uint32Array(0);
var counts = new Uint32Array(256);
function indexCurve(start, minX, minY, invSize) {
  let p = start;
  let n = 0;
  do {
    p.z = zOrder(p.x, p.y, minX, minY, invSize);
    sortArr[n++] = p;
    p = p.next;
  } while (p !== start);
  sortNodes(n);
  let prev = null;
  for (let i = 0; i < n; i++) {
    const node = sortArr[i];
    node.prevZ = prev;
    if (prev) prev.nextZ = node;
    prev = node;
  }
  prev.nextZ = null;
}
function sortNodes(n) {
  if (n <= 32) {
    for (let i = 1; i < n; i++) {
      const node = sortArr[i], z = node.z;
      let j = i - 1;
      while (j >= 0 && sortArr[j].z > z) {
        sortArr[j + 1] = sortArr[j];
        j--;
      }
      sortArr[j + 1] = node;
    }
    return;
  }
  if (zArr.length < n) {
    zArr = new Uint32Array(n);
    zBuf = new Uint32Array(n);
    sortBuf = new Array(n);
  }
  for (let i = 0; i < n; i++) zArr[i] = sortArr[i].z;
  radixPass(n, sortArr, zArr, sortBuf, zBuf, 0);
  radixPass(n, sortBuf, zBuf, sortArr, zArr, 8);
  radixPass(n, sortArr, zArr, sortBuf, zBuf, 16);
  radixPass(n, sortBuf, zBuf, sortArr, zArr, 24);
}
function radixPass(n, src, srcZ, dst, dstZ, shift) {
  counts.fill(0);
  for (let i = 0; i < n; i++) counts[srcZ[i] >>> shift & 255]++;
  let sum = 0;
  for (let b = 0; b < 256; b++) {
    const c = counts[b];
    counts[b] = sum;
    sum += c;
  }
  for (let i = 0; i < n; i++) {
    const z = srcZ[i];
    const pos = counts[z >>> shift & 255]++;
    dst[pos] = src[i];
    dstZ[pos] = z;
  }
}
function zOrder(x, y, minX, minY, invSize) {
  x = (x - minX) * invSize | 0;
  y = (y - minY) * invSize | 0;
  x = (x | x << 8) & 16711935;
  x = (x | x << 4) & 252645135;
  x = (x | x << 2) & 858993459;
  x = (x | x << 1) & 1431655765;
  y = (y | y << 8) & 16711935;
  y = (y | y << 4) & 252645135;
  y = (y | y << 2) & 858993459;
  y = (y | y << 1) & 1431655765;
  return x | y << 1;
}
function getLeftmost(start) {
  let p = start, leftmost = start;
  do {
    if (p.x < leftmost.x || p.x === leftmost.x && p.y < leftmost.y) leftmost = p;
    p = p.next;
  } while (p !== start);
  return leftmost;
}
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}
function isValidDiagonal(a, b) {
  const zeroLength = equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0;
  return a.next.i !== b.i && (zeroLength || locallyInside(a, b) && locallyInside(b, a) && // // locally visible
  (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0)) && // no opposite-facing sectors
  !intersectsPolygon(a, b) && (zeroLength || middleInside(a, b));
}
function area(p, q, r) {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}
function equals(p1, p2) {
  return p1.x === p2.x && p1.y === p2.y;
}
function intersects(p1, q1, p2, q2, includeBoundary = true) {
  const o1 = area(p1, q1, p2);
  const o2 = area(p1, q1, q2);
  const o3 = area(p2, q2, p1);
  const o4 = area(p2, q2, q1);
  if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) return true;
  if (!includeBoundary) return false;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}
function onSegment(p, q, r) {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}
function intersectsPolygon(a, b) {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  let p = a;
  do {
    const n = p.next;
    if (p.x > maxX && n.x > maxX || p.x < minX && n.x < minX || p.y > maxY && n.y > maxY || p.y < minY && n.y < minY) {
      p = n;
      continue;
    }
    if (p.i !== a.i && n.i !== a.i && p.i !== b.i && n.i !== b.i && intersects(p, n, a, b)) return true;
    p = n;
  } while (p !== a);
  return false;
}
function locallyInside(a, b) {
  return area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}
function middleInside(a, b) {
  let p = a;
  let inside = false;
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  do {
    const n = p.next;
    if (p.y > py !== n.y > py && px < (n.x - p.x) * (py - p.y) / (n.y - p.y) + p.x)
      inside = !inside;
    p = n;
  } while (p !== a);
  return inside;
}
function splitPolygon(a, b) {
  const a2 = createNode(a.i, a.x, a.y), b2 = createNode(b.i, b.x, b.y), an = a.next, bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}
function insertNode(i, x, y, last) {
  const p = createNode(i, x, y);
  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}
function removeNode(p) {
  p.next.prev = p.prev;
  p.prev.next = p.next;
  if (p.prevZ) p.prevZ.nextZ = p.nextZ;
  if (p.nextZ) p.nextZ.prevZ = p.prevZ;
  if (indexActive) growBlock(p.prev, p.next);
}
function createNode(i, x, y) {
  return (
    /** @type {Node} */
    /** @type {unknown} */
    {
      i,
      // vertex index in coordinates array
      x,
      y,
      // vertex coordinates
      prev: null,
      // previous and next vertex nodes in a polygon ring
      next: null,
      z: 0,
      // z-order curve value; doubles as owning block in the hole-bridge index during eliminateHoles
      prevZ: null,
      // previous and next nodes in z-order
      nextZ: null
    }
  );
}
function signedArea2(data, start, end, dim) {
  let sum = 0;
  for (let i = start, j = end - dim; i < end; i += dim) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
}

// src/modeling/geometry/mesh.ts
function triangulate(shape) {
  const contours = normalizeWinding(shape).contours;
  const depthOf = contours.map((c) => contours.filter((o) => o !== c && containsPoint(o, c[0])).length);
  const vertices = [];
  const triangles = [];
  contours.forEach((solid2, si) => {
    if (depthOf[si] % 2 === 1) return;
    const holes = contours.filter((hole, hi) => {
      if (depthOf[hi] !== depthOf[si] + 1 || !containsPoint(solid2, hole[0])) return false;
      const containers = contours.filter((o, oi) => depthOf[oi] === depthOf[si] && containsPoint(o, hole[0]));
      return containers.reduce((best, o) => Math.abs(signedArea(o)) < Math.abs(signedArea(best)) ? o : best) === solid2;
    });
    const rings = [solid2, ...holes];
    const flat = [];
    const holeIndices = [];
    for (const ring of rings) {
      if (ring !== solid2) holeIndices.push(flat.length / 2);
      for (const p of ring) flat.push(p.x, p.y);
    }
    const base = vertices.length;
    for (const ring of rings) vertices.push(...ring);
    for (const i of earcut(flat, holeIndices.length ? holeIndices : null, 2)) triangles.push(base + i);
  });
  return { vertices, triangles };
}
function flatMesh(shape, box, { z = 0 } = {}) {
  const { vertices, triangles } = triangulate(shape);
  const positions = [];
  const normals = [];
  const uvs = [];
  for (const p of vertices) {
    positions.push(p.x, -p.y, z);
    normals.push(0, 0, 1);
    uvs.push(box.w ? p.x / box.w : 0, box.h ? 1 - p.y / box.h : 0);
  }
  const indices = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const pa = vertices[a];
    const pb = vertices[b];
    const pc = vertices[c];
    const cross3 = (pb.x - pa.x) * -(pc.y - pa.y) - -(pb.y - pa.y) * (pc.x - pa.x);
    if (cross3 >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  }
  return { positions, normals, uvs, indices, faces: [{ role: "start" }], faceOf: indices.filter((_, i) => i % 3 === 0).map(() => 0) };
}

// src/modeling/geometry/modifiers.ts
var SMOOTH_COS = Math.cos(30 * Math.PI / 180);
function extrude(shape, box, depth) {
  const mesh = emptyMesh();
  const { vertices, triangles } = triangulate(shape);
  for (const [z, nz] of [[depth, 1], [0, -1]]) {
    const base = vertexCount(mesh);
    const face = openFace(mesh, { role: z === 0 ? "start" : "end" });
    for (const p of vertices) push(mesh, [p.x, -p.y, z], [0, 0, nz], [box.w ? p.x / box.w : 0, box.h ? 1 - p.y / box.h : 0]);
    for (let t = 0; t < triangles.length; t += 3) pushFacing(mesh, base + triangles[t], base + triangles[t + 1], base + triangles[t + 2], [0, 0, nz], face);
  }
  normalizeWinding(shape).contours.forEach((contour, c) => wall(mesh, contour, depth, c));
  return orientOutward(mesh);
}
function wall(mesh, contour, depth, contourIndex) {
  const n = contour.length;
  const pts = contour.map((p) => [p.x, -p.y]);
  const edgeNormal = (i) => {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    return [-(by - ay) / len, (bx - ax) / len];
  };
  const normals = pts.map((_, i) => edgeNormal(i));
  const cornerNormal = (edge, neighbour) => {
    const a = normals[edge];
    const b = normals[neighbour];
    if (a[0] * b[0] + a[1] * b[1] < SMOOTH_COS) return a;
    const x = a[0] + b[0];
    const y = a[1] + b[1];
    const len = Math.hypot(x, y) || 1;
    return [x / len, y / len];
  };
  const perimeter = pts.reduce((sum, p, i) => sum + Math.hypot(pts[(i + 1) % n][0] - p[0], pts[(i + 1) % n][1] - p[1]), 0) || 1;
  let along = 0;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const na = cornerNormal(i, (i - 1 + n) % n);
    const nb = cornerNormal(i, (i + 1) % n);
    const u0 = along / perimeter;
    const u1 = (along + len) / perimeter;
    along += len;
    const base = vertexCount(mesh);
    push(mesh, [a[0], a[1], 0], [na[0], na[1], 0], [u0, 0]);
    push(mesh, [b[0], b[1], 0], [nb[0], nb[1], 0], [u1, 0]);
    push(mesh, [b[0], b[1], depth], [nb[0], nb[1], 0], [u1, 1]);
    push(mesh, [a[0], a[1], depth], [na[0], na[1], 0], [u0, 1]);
    const out = [normals[i][0], normals[i][1], 0];
    const face = openFace(mesh, { role: "side", contour: contourIndex, segment: i });
    pushFacing(mesh, base, base + 1, base + 2, out, face);
    pushFacing(mesh, base, base + 2, base + 3, out, face);
  }
}
function revolve(shape, box, axis2, angle, steps) {
  const whole = normalizeWinding(shape).contours.find((c) => signedArea(c) > 0);
  if (!whole) return emptyMesh();
  const axisAt = axis2 === "center" ? box.w / 2 : 0;
  const outline = axis2 === "bottom" ? whole : clipRight(whole, axisAt);
  if (outline.length < 3) return emptyMesh();
  const full = Math.abs(angle) >= 360;
  const segments2 = Math.max(3, Math.round(steps));
  const sweep2 = Math.min(Math.abs(angle), 360) * Math.PI / 180;
  const rings = full ? segments2 : segments2 + 1;
  const upright = axis2 !== "bottom";
  const profile = outline.map((p) => upright ? { r: p.x - axisAt, along: -p.y } : { r: box.h - p.y, along: p.x });
  const mesh = emptyMesh();
  for (let k = 0; k < rings; k += 1) {
    const theta = k / segments2 * sweep2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    profile.forEach((p, j) => {
      const position = upright ? [axisAt + p.r * c, p.along, -p.r * s] : [p.along, -box.h + p.r * c, p.r * s];
      push(mesh, position, [0, 0, 0], [k / segments2, j / profile.length]);
    });
  }
  const m2 = profile.length;
  const sides = profile.map((_, j) => openFace(mesh, { role: "side", contour: 0, segment: j }));
  for (let k = 0; k < segments2; k += 1) {
    const ring = k * m2;
    const next = (k + 1) % rings * m2;
    for (let j = 0; j < m2; j += 1) {
      const j2 = (j + 1) % m2;
      mesh.indices.push(ring + j, next + j, next + j2, ring + j, next + j2, ring + j2);
      mesh.faceOf.push(sides[j], sides[j]);
    }
  }
  return smoothNormals(orientOutward(mesh));
}
function clipRight(ring, at) {
  const out = [];
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const aIn = a.x >= at;
    const bIn = b.x >= at;
    if (aIn) out.push(a);
    if (aIn !== bIn) out.push({ x: at, y: a.y + (b.y - a.y) * (at - a.x) / (b.x - a.x) });
  }
  return out;
}
function sweep(shape, box, path2, closed) {
  const outline = normalizeWinding(shape).contours.find((c) => signedArea(c) > 0);
  if (!outline || path2.length < 2) return emptyMesh();
  const profile = outline.map((p) => ({ x: p.x - box.w / 2, y: -(p.y - box.h / 2) }));
  const pts = path2.map((p) => ({ x: p.x, y: -p.y }));
  const n = pts.length;
  const mesh = emptyMesh();
  const frames = pts.map((p, i) => {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    return { p, across: [-ty / len, tx / len] };
  });
  const ringAt = ({ p, across }, profileOf = (q) => [p.x + across[0] * q.x, p.y + across[1] * q.x, q.y]) => profile.map(profileOf);
  frames.forEach((frame, i) => ringAt(frame).forEach((pos, j) => push(mesh, pos, [0, 0, 0], [i / (n - 1 || 1), j / profile.length])));
  const m2 = profile.length;
  const spans = closed ? n : n - 1;
  const sides = profile.map((_, j) => openFace(mesh, { role: "side", contour: 0, segment: j }));
  for (let i = 0; i < spans; i += 1) {
    const a = i * m2;
    const b = (i + 1) % n * m2;
    const { across } = frames[i];
    for (let j = 0; j < m2; j += 1) {
      const j2 = (j + 1) % m2;
      const q = { x: (profile[j].x + profile[j2].x) / 2, y: (profile[j].y + profile[j2].y) / 2 };
      const out = [across[0] * q.x, across[1] * q.x, q.y];
      pushFacing(mesh, a + j, b + j, b + j2, out, sides[j]);
      pushFacing(mesh, a + j, b + j2, a + j2, out, sides[j]);
    }
  }
  smoothNormals(mesh);
  if (!closed) {
    const { vertices, triangles } = triangulate({ contours: [profile.map((q) => ({ x: q.x, y: -q.y }))] });
    for (const [frame, flip] of [[frames[0], true], [frames[n - 1], false]]) {
      const base = vertexCount(mesh);
      const cap = openFace(mesh, { role: flip ? "start" : "end" });
      const t = frame === frames[0] ? [pts[1].x - pts[0].x, pts[1].y - pts[0].y] : [pts[n - 1].x - pts[n - 2].x, pts[n - 1].y - pts[n - 2].y];
      const len = Math.hypot(t[0], t[1]) || 1;
      const normal = flip ? [-t[0] / len, -t[1] / len, 0] : [t[0] / len, t[1] / len, 0];
      for (const v of vertices) push(mesh, [frame.p.x + frame.across[0] * v.x, frame.p.y + frame.across[1] * v.x, -v.y], normal, [0, 0]);
      for (let k = 0; k < triangles.length; k += 3) pushFacing(mesh, base + triangles[k], base + triangles[k + 1], base + triangles[k + 2], normal, cap);
    }
  }
  return orientOutward(mesh);
}
function emptyMesh() {
  return { positions: [], normals: [], uvs: [], indices: [], faces: [], faceOf: [] };
}
function openFace(mesh, face) {
  mesh.faces.push(face);
  return mesh.faces.length - 1;
}
function vertexCount(mesh) {
  return mesh.positions.length / 3;
}
function push(mesh, p, n, uv) {
  mesh.positions.push(p[0], p[1], p[2]);
  mesh.normals.push(n[0], n[1], n[2]);
  mesh.uvs.push(uv[0], uv[1]);
}
function pushFacing(mesh, a, b, c, toward, face) {
  const p = mesh.positions;
  const [ax, ay, az] = [p[a * 3], p[a * 3 + 1], p[a * 3 + 2]];
  const u = [p[b * 3] - ax, p[b * 3 + 1] - ay, p[b * 3 + 2] - az];
  const v = [p[c * 3] - ax, p[c * 3 + 1] - ay, p[c * 3 + 2] - az];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0) mesh.indices.push(a, b, c);
  else mesh.indices.push(a, c, b);
  mesh.faceOf.push(face);
}
function triangleCount(mesh) {
  return mesh.indices.length / 3;
}
function signedVolume(mesh) {
  const p = mesh.positions;
  let sum = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3];
    sum += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return sum / 6;
}
function orientOutward(mesh) {
  if (signedVolume(mesh) >= 0) return mesh;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const b = mesh.indices[t + 1];
    mesh.indices[t + 1] = mesh.indices[t + 2];
    mesh.indices[t + 2] = b;
  }
  return mesh;
}
function smoothNormals(mesh) {
  const p = mesh.positions;
  const acc = new Array(p.length).fill(0);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3];
    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      acc[i] += nx;
      acc[i + 1] += ny;
      acc[i + 2] += nz;
    }
  }
  for (let i = 0; i < acc.length; i += 3) {
    const len = Math.hypot(acc[i], acc[i + 1], acc[i + 2]) || 1;
    mesh.normals[i] = acc[i] / len;
    mesh.normals[i + 1] = acc[i + 1] / len;
    mesh.normals[i + 2] = acc[i + 2] / len;
  }
  return mesh;
}

// src/modeling/geometry/cornerTweaks.ts
var cornerKey = ({ anchor, cap }) => `${anchor}:${cap}`;
var SAME = 0.01;
function profileAnchors(profile) {
  if (isVectorNode(profile)) return toEditablePath(profile).points ?? [];
  const { w, h } = profile.rect;
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}
function extrudeShift(feature, depthPx) {
  return feature.direction === "reverse" ? -depthPx : feature.direction === "symmetric" ? -depthPx / 2 : 0;
}
function tweakMesh(mesh, profile, depthPx, tweaks) {
  if (!tweaks || Object.keys(tweaks).length === 0) return mesh;
  const anchors = profileAnchors(profile);
  const positions = [...mesh.positions];
  for (let i = 0; i < positions.length; i += 3) {
    const cap = Math.abs(positions[i + 2]) < SAME ? "start" : Math.abs(positions[i + 2] - depthPx) < SAME ? "end" : null;
    if (!cap) continue;
    const anchor = anchors.findIndex((a) => Math.abs(a.x - positions[i]) < SAME && Math.abs(a.y + positions[i + 1]) < SAME);
    const t = anchor < 0 ? void 0 : tweaks[cornerKey({ anchor, cap })];
    if (!t) continue;
    positions[i] += t[0];
    positions[i + 1] -= t[1];
    positions[i + 2] += t[2];
  }
  const normals = new Array(positions.length).fill(0);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3];
    const u = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const v = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of [a, b, c]) for (let k = 0; k < 3; k += 1) normals[i + k] += n[k];
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
  }
  return { ...mesh, positions, normals };
}

// src/modeling/geometry/body.ts
var SMOOTH_COS2 = Math.cos(30 * Math.PI / 180);
var WELD = 1e-4;
function bodiesOf(doc) {
  const out = /* @__PURE__ */ new Map();
  for (const object of doc.objects ?? []) if (!object.hidden) out.set(object.id, bodyOf(doc, object));
  return out;
}
var cache = /* @__PURE__ */ new WeakMap();
function bodyOf(doc, object) {
  const inputs = object.features.flatMap((f) => [...profilesOf(f), ...f.kind === "sweep" ? [f.pathId] : []].flatMap((id) => [findNode(doc, id), ...ancestorsOf(doc, id)]));
  const cached = cache.get(object);
  if (cached && cached.inputs.length === inputs.length && cached.inputs.every((n, i) => n === inputs[i])) return cached.body;
  const body = buildBody(doc, object);
  cache.set(object, { inputs, body });
  return body;
}
function buildBody(doc, object) {
  const mesh = { positions: [], normals: [], uvs: [], indices: [] };
  const faces = [];
  const faceOfTriangle = [];
  const notes = [];
  const parts = [];
  for (const feature of object.features) {
    if (feature.hidden) continue;
    if (feature.kind === "loft") {
      notes.push(`${feature.name}: lofts aren't built yet`);
      continue;
    }
    if (feature.op === "subtract" || feature.op === "intersect") notes.push(`${feature.name}: ${feature.op} is shown as an added body until booleans land`);
    for (const profileId of profilesOf(feature)) {
      const profile = findNode(doc, profileId);
      const built = profile ? featureMesh(doc, object, feature, profile) : null;
      if (!built) continue;
      parts.push({ feature: feature.id, profile: profileId, first: faceOfTriangle.length, count: built.mesh.indices.length / 3 });
      append(mesh, faces, faceOfTriangle, built.mesh, built.toScene, feature, profileId);
    }
  }
  const edges = edgesOf(mesh, faceOfTriangle);
  return { objectId: object.id, mesh, faces, faceOfTriangle, edges, vertices: verticesOf(edges), notes, parts };
}
function featureMesh(doc, object, feature, profile) {
  const shape = shapeOf(profile, toleranceOf(feature, Math.max(profile.rect.w, profile.rect.h)));
  if (!shape) return null;
  const box = { w: profile.rect.w, h: profile.rect.h };
  if (feature.kind === "extrude") {
    const depth = feature.depth * PX_PER_METER;
    const mesh = tweakMesh(extrude(shape, box, depth), profile, depth, feature.tweaks);
    const shift = extrudeShift(feature, depth);
    return { mesh, toScene: planeToScene(doc, profile, shift, partPlacementFor(doc, object, profile.id)) };
  }
  if (feature.kind === "revolve") return { mesh: revolve(shape, box, feature.axis, feature.angle, feature.steps), toScene: planeToScene(doc, profile, 0, partPlacementFor(doc, object, profile.id)) };
  const path2 = findNode(doc, feature.pathId);
  if (!path2 || !isVectorNode(path2)) return null;
  const { points, closed } = guidePolyline(path2);
  const local = points.map((p) => ({ x: p.x - path2.rect.x, y: p.y - path2.rect.y }));
  return { mesh: sweep(shape, box, local, closed), toScene: planeToScene(doc, path2, 0, partPlacementFor(doc, object, path2.id)) };
}
function planeToScene(doc, node, outShift, part) {
  const chain2 = [...ancestorsOf(doc, node.id), node];
  const top = chain2[0];
  const placement = placementOf(top);
  let m2 = IDENTITY;
  chain2.forEach((n, i) => {
    m2 = multiply(m2, nodeMatrix(i === 0 ? { ...n.rect, x: 0, y: 0 } : n.rect, n.style.rotate));
  });
  return {
    point: (x, yUp, z) => {
      const on = apply(m2, { x, y: -yUp });
      const w = planeToWorld(placement, on.x, on.y, z + outShift);
      return part ? placeInScene(part, w) : w;
    },
    normal: ([nx, ny, nz]) => {
      const u = nx * m2.a - ny * m2.c;
      const v = -(nx * m2.b - ny * m2.d);
      const len = Math.hypot(u, v, nz) || 1;
      const n = rotate([u / len, v / len, nz / len], placement.rotation);
      return part ? placeNormal(part, n) : n;
    }
  };
}
function sceneToLayer(doc, node) {
  return layerFromScene(doc, node, partPlacementOf(doc, node.id));
}
function layerFromScene(doc, node, part) {
  const chain2 = [...ancestorsOf(doc, node.id), node];
  const placement = placementOf(chain2[0]);
  let m2 = IDENTITY;
  chain2.forEach((n, i) => {
    m2 = multiply(m2, nodeMatrix(i === 0 ? { ...n.rect, x: 0, y: 0 } : n.rect, n.style.rotate));
  });
  const back = invert(m2);
  return (world) => {
    const { u, v, out } = worldToPlane(placement, part ? unplaceFromScene(part, world) : world);
    const p = apply(back, { x: u, y: v });
    return { x: p.x, y: p.y, out };
  };
}
function append(body, faces, faceOfTriangle, mesh, toScene, feature, profile) {
  const base = body.positions.length / 3;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    body.positions.push(...toScene.point(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]));
    body.normals.push(...toScene.normal([mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]]));
  }
  body.uvs.push(...mesh.uvs);
  for (const i of mesh.indices) body.indices.push(base + i);
  const own = mesh.faces ?? [{ role: "start" }];
  const group = groupSmoothSides(mesh);
  const firstFace = faces.length;
  const bodyFaceOf = /* @__PURE__ */ new Map();
  own.forEach((_, i) => {
    const lead = group[i];
    if (bodyFaceOf.has(lead)) {
      bodyFaceOf.set(i, bodyFaceOf.get(lead));
      return;
    }
    const leadFace = own[lead];
    const name = { feature: feature.id, role: leadFace.role, profile, ...leadFace.role === "side" ? { segment: leadFace.segment ?? 0 } : {} };
    faces.push({ name, triangles: [] });
    bodyFaceOf.set(lead, faces.length - 1);
    bodyFaceOf.set(i, faces.length - 1);
  });
  const triangles = mesh.indices.length / 3;
  const baseTriangle = faceOfTriangle.length;
  for (let t = 0; t < triangles; t += 1) {
    const face = bodyFaceOf.get(mesh.faceOf?.[t] ?? 0) ?? firstFace;
    faceOfTriangle.push(face);
    faces[face].triangles.push(baseTriangle + t);
  }
}
function groupSmoothSides(mesh) {
  const faces = mesh.faces ?? [];
  const lead = faces.map((_, i) => i);
  const normal = (face) => {
    const p = mesh.positions;
    for (let t = 0; t < (mesh.faceOf?.length ?? 0); t += 1) {
      if (mesh.faceOf[t] !== face) continue;
      const [a, b, c] = [mesh.indices[t * 3] * 3, mesh.indices[t * 3 + 1] * 3, mesh.indices[t * 3 + 2] * 3];
      const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
      const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const len = Math.hypot(...n);
      if (len > 1e-12) return [n[0] / len, n[1] / len, n[2] / len];
    }
    return null;
  };
  const byContour = /* @__PURE__ */ new Map();
  faces.forEach((f, i) => {
    if (f.role === "side") byContour.set(f.contour ?? 0, [...byContour.get(f.contour ?? 0) ?? [], i]);
  });
  for (const sides of byContour.values()) {
    sides.sort((a, b) => (faces[a].segment ?? 0) - (faces[b].segment ?? 0));
    const normals = sides.map(normal);
    const smooth = (i, j) => {
      const a = normals[i];
      const b = normals[j];
      return !!a && !!b && a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= SMOOTH_COS2;
    };
    const n = sides.length;
    const start = Math.max(0, [...Array(n).keys()].findIndex((i) => !smooth((i - 1 + n) % n, i)));
    let current = sides[start];
    for (let k = 0; k < n; k += 1) {
      const i = (start + k) % n;
      if (k > 0 && !smooth((i - 1 + n) % n, i)) current = sides[i];
      lead[sides[i]] = current;
    }
  }
  return lead;
}
var keyOf = (p) => p.map((c) => Math.round(c / WELD)).join(",");
function edgesOf(mesh, faceOfTriangle) {
  const at = (i) => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
  const sides = /* @__PURE__ */ new Map();
  for (let t = 0; t < faceOfTriangle.length; t += 1) {
    const corners = [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]].map(at);
    for (let k = 0; k < 3; k += 1) {
      const a = corners[k];
      const b = corners[(k + 1) % 3];
      const [ka, kb] = [keyOf(a), keyOf(b)];
      if (ka === kb) continue;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const side = sides.get(key) ?? { a, b, faces: /* @__PURE__ */ new Set() };
      side.faces.add(faceOfTriangle[t]);
      sides.set(key, side);
    }
  }
  const byPair = /* @__PURE__ */ new Map();
  for (const side of sides.values()) {
    const between = [...side.faces].sort((x, y) => x - y);
    const count = countUses(side, mesh, faceOfTriangle);
    if (between.length === 1 && count > 1) continue;
    const key = between.join("|");
    const entry = byPair.get(key) ?? { faces: between, segments: [] };
    entry.segments.push([side.a, side.b]);
    byPair.set(key, entry);
  }
  return [...byPair.values()].flatMap(({ faces: between, segments: segments2 }) => chain(segments2).map((points) => ({ faces: between, points })));
}
var useCounts = /* @__PURE__ */ new WeakMap();
function countUses(side, mesh, faceOfTriangle) {
  let counts2 = useCounts.get(mesh);
  if (!counts2) {
    counts2 = /* @__PURE__ */ new Map();
    for (let t = 0; t < faceOfTriangle.length; t += 1) {
      const corners = [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]].map((i) => keyOf([mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]));
      for (let k = 0; k < 3; k += 1) {
        const [ka2, kb2] = [corners[k], corners[(k + 1) % 3]];
        if (ka2 === kb2) continue;
        const key = ka2 < kb2 ? `${ka2}|${kb2}` : `${kb2}|${ka2}`;
        counts2.set(key, (counts2.get(key) ?? 0) + 1);
      }
    }
    useCounts.set(mesh, counts2);
  }
  const [ka, kb] = [keyOf(side.a), keyOf(side.b)];
  return counts2.get(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`) ?? 0;
}
function chain(segments2) {
  const unused = new Set(segments2.map((_, i) => i));
  const byPoint = /* @__PURE__ */ new Map();
  segments2.forEach(([a, b], i) => {
    for (const p of [a, b]) byPoint.set(keyOf(p), [...byPoint.get(keyOf(p)) ?? [], i]);
  });
  const lines = [];
  const order = [...unused].sort((i, j) => degree(segments2[j], byPoint) - degree(segments2[i], byPoint));
  for (const first of order) {
    if (!unused.has(first)) continue;
    unused.delete(first);
    let [a, b] = segments2[first];
    if ((byPoint.get(keyOf(b))?.length ?? 0) === 1) [a, b] = [b, a];
    const line = [a, b];
    for (; ; ) {
      const tail = line[line.length - 1];
      const next = (byPoint.get(keyOf(tail)) ?? []).find((i) => unused.has(i));
      if (next === void 0) break;
      unused.delete(next);
      const [p, q] = segments2[next];
      line.push(keyOf(p) === keyOf(tail) ? q : p);
    }
    lines.push(line);
  }
  return lines;
}
function degree([a, b], byPoint) {
  return Math.min(byPoint.get(keyOf(a))?.length ?? 0, byPoint.get(keyOf(b))?.length ?? 0) === 1 ? 1 : 0;
}
function verticesOf(edges) {
  const out = /* @__PURE__ */ new Map();
  edges.forEach((edge, i) => {
    const first = edge.points[0];
    const last = edge.points[edge.points.length - 1];
    if (keyOf(first) === keyOf(last)) return;
    for (const p of [first, last]) {
      const key = keyOf(p);
      const vertex = out.get(key) ?? { at: p, edges: [] };
      if (!vertex.edges.includes(i)) vertex.edges.push(i);
      out.set(key, vertex);
    }
  });
  return [...out.values()];
}
function outlineOfFace(body, face) {
  const edges = body.edges.filter((e) => e.faces.includes(face));
  const ids = new Set(edges.map((e) => body.edges.indexOf(e)));
  return { edges, vertices: body.vertices.filter((v) => v.edges.some((e) => ids.has(e))) };
}

// src/modeling/scene3d/planeRefs.ts
var DEFAULT_ROTATION = { front: PLANE_ROTATION.front, top: PLANE_ROTATION.top, side: PLANE_ROTATION.side };
var sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
var add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
var scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
var unit = (a) => scale(a, 1 / (Math.hypot(...a) || 1));
var normalOf = (frame) => rotate([0, 0, 1], frame.rotation);
function frameOf(doc, ref, bodies, self) {
  switch (ref.kind) {
    case "default":
      return { origin: [0, 0, 0], rotation: DEFAULT_ROTATION[ref.plane] };
    case "offset": {
      const base = frameOf(doc, ref.from, bodies, self);
      return base ? { origin: add(base.origin, scale(normalOf(base), ref.distance)), rotation: base.rotation } : null;
    }
    case "face": {
      const object = objectsOf(doc).find((o) => o.id === ref.objectId);
      if (!object || self && object.features.some((f) => inputsOf(f).includes(self))) return null;
      const body = bodies().get(object.id);
      const index = body?.faces.findIndex((f) => f.name.feature === ref.face.feature && f.name.role === ref.face.role && f.name.profile === ref.face.profile && (f.name.segment ?? -1) === (ref.face.segment ?? -1)) ?? -1;
      return body && index >= 0 ? faceFrame(doc, body, index) : null;
    }
    case "custom":
      return null;
  }
}
function faceFrame(doc, body, index) {
  const face = body.faces[index];
  const p = body.mesh.positions;
  let normal = [0, 0, 0];
  let centroid = [0, 0, 0];
  let area2 = 0;
  for (const t of face.triangles) {
    const [a, b, c] = [0, 1, 2].map((k) => body.mesh.indices[t * 3 + k] * 3).map((i) => [p[i], p[i + 1], p[i + 2]]);
    const n = cross(sub(b, a), sub(c, a));
    const twice = Math.hypot(...n);
    normal = add(normal, n);
    centroid = add(centroid, scale(add(add(a, b), c), twice / 3));
    area2 += twice;
  }
  normal = unit(normal);
  centroid = scale(centroid, 1 / (area2 || 1));
  const profile = face.name.profile;
  const top = topOf(doc, profile);
  const placement = top ? placementOf(top) : { position: [0, 0, 0], rotation: [0, 0, 0] };
  const at = planeRectOf(doc, profile) ?? { x: 0, y: 0 };
  const part = partPlacementOf(doc, profile);
  const inScene = (p2) => part ? placeInScene(part, p2) : p2;
  const turn = (v) => part ? rotate(v, part.rotation) : v;
  const profileOrigin = inScene(planeToWorld(placement, at.x, at.y));
  const origin = sub(profileOrigin, scale(normal, dot(sub(profileOrigin, centroid), normal)));
  const across = (axis2) => sub(axis2, scale(normal, dot(axis2, normal)));
  let right = across(turn(rotate([1, 0, 0], placement.rotation)));
  if (Math.hypot(...right) < 0.1) right = across(turn(rotate([0, 0, 1], placement.rotation)));
  right = unit(right);
  const up = cross(normal, right);
  return { origin, rotation: eulerOf(right, up, normal), center: centroid };
}
function topOf(doc, id) {
  const own = doc.nodes.find((n) => n.id === id);
  if (own) return own;
  const visit = (n) => n.id === id || "children" in n && Array.isArray(n.children) && n.children.some(visit);
  return doc.nodes.find(visit) ?? null;
}
var round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;
function placeOn(frame, at, scaleOf) {
  const position = planeToWorld({ position: frame.origin, rotation: frame.rotation }, at.u, at.v).map((n) => round(n, 4));
  const rotation = frame.rotation.map((n) => round(n, 3));
  return scaleOf ? { position, rotation, scale: scaleOf } : { position, rotation };
}
var samePlacement = (a, b) => !!a && a.position.every((n, i) => Math.abs(n - b.position[i]) < 1e-6) && a.rotation.every((n, i) => Math.abs(n - b.rotation[i]) < 1e-6);
function resolvePlanes(doc) {
  let current = doc;
  for (let pass = 0; pass < 4; pass += 1) {
    let bodies = null;
    const lazyBodies = () => bodies ??= bodiesOf(current);
    let changed = false;
    const nodes = current.nodes.map((node) => {
      const sketch = node.sketch;
      if (!sketch || sketch.plane.kind === "custom") return node;
      const frame = frameOf(current, sketch.plane, lazyBodies, node.id);
      if (!frame) return node;
      const placement = placeOn(frame, sketch.at ?? { u: 0, v: 0 }, node.space?.scale);
      const at = frontPoint(placement.position);
      const rect = { ...node.rect, x: round(at.x, 3), y: round(at.y, 3) };
      if (samePlacement(node.space, placement) && rect.x === node.rect.x && rect.y === node.rect.y) return node;
      changed = true;
      return { ...node, space: placement, rect };
    });
    if (!changed) break;
    current = { ...current, nodes };
  }
  return current;
}
function addSketch(doc, plane, node) {
  let bodies = null;
  const frame = frameOf(doc, plane, () => bodies ??= bodiesOf(doc));
  if (!frame) return null;
  const middle = worldToPlane({ position: frame.origin, rotation: frame.rotation }, frame.center ?? frame.origin);
  const sketch = { ...node.sketch, plane, at: { u: round(middle.u - node.rect.w / 2, 3), v: round(middle.v - node.rect.h / 2, 3) } };
  return resolvePlanes({ ...doc, nodes: [...doc.nodes, { ...node, sketch }] });
}
function sketchProblem(doc, node, bodies = () => bodiesOf(doc)) {
  let ref = node.sketch?.plane;
  while (ref?.kind === "offset") ref = ref.from;
  if (ref?.kind !== "face") return null;
  const face = ref;
  const object = objectsOf(doc).find((o) => o.id === face.objectId);
  if (!object) return "The part it stood on was deleted";
  const feature = object.features.find((f) => f.id === face.face.feature);
  if (!feature) return "The feature whose face it stood on was deleted";
  if (object.hidden || feature.hidden) return null;
  return frameOf(doc, face, bodies, node.id) ? null : "The face it stood on is gone";
}
function nextSketchName(doc) {
  const used = new Set(doc.nodes.map((n2) => n2.name));
  let n = 1;
  while (used.has(`Sketch ${n}`)) n += 1;
  return `Sketch ${n}`;
}

// src/modeling/viewport/cameraViews.ts
function sceneBounds(doc) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const reach = (p) => {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  };
  for (const object of objectsOf(doc)) {
    if (!object.placement || object.hidden) continue;
    const { positions } = bodyOf(doc, object).mesh;
    for (let i = 0; i < positions.length; i += 3) reach([positions[i], positions[i + 1], positions[i + 2]]);
  }
  for (const node of doc.nodes) {
    if (node.hidden || partPlacementOf(doc, node.id)) continue;
    const placement = placementOf(node);
    const { w, h } = node.rect;
    const solid2 = solidOf(doc, node.id);
    const depth = solid2?.kind === "extrude" ? solid2.depth * 100 : solid2 ? Math.max(w, h) : 0;
    for (const [u, v, out] of [[0, 0, 0], [w, 0, 0], [0, h, 0], [w, h, 0], [0, 0, depth], [w, h, depth], [0, h, -depth], [w, 0, -depth]]) {
      reach(planeToWorld(placement, u, v, out));
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

// src/modeling/scene3d/starterShapes.ts
var TOP = { kind: "default", plane: "top" };
var FRONT = { kind: "default", plane: "front" };
var SIZE = 100;
var ROUND = 48;
function circlePoints(cx, cy, r) {
  const k = 0.5523 * r;
  return [
    { x: cx, y: cy - r, in: { x: cx - k, y: cy - r }, out: { x: cx + k, y: cy - r } },
    { x: cx + r, y: cy, in: { x: cx + r, y: cy - k }, out: { x: cx + r, y: cy + k } },
    { x: cx, y: cy + r, in: { x: cx + k, y: cy + r }, out: { x: cx - k, y: cy + r } },
    { x: cx - r, y: cy, in: { x: cx - r, y: cy + k }, out: { x: cx - r, y: cy - k } }
  ];
}
var centered = (w, h) => ({ u: -w / 2, v: -h / 2 });
var grounded = (w, h) => ({ u: -w / 2, v: -h });
var RECIPES = {
  box: { name: "Box", plane: TOP, layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: SIZE }, "rectangle"), solid: { kind: "extrude", depth: 1 }, at: centered },
  cylinder: { name: "Cylinder", plane: TOP, layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: SIZE }, "ellipse"), solid: { kind: "extrude", depth: 1 }, at: centered },
  polygon: {
    name: "Polygon",
    plane: TOP,
    layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: SIZE }, "polygon", { sides: 6 }),
    solid: { kind: "extrude", depth: 1 },
    at: centered
  },
  // A circle spun about its own middle: only the half right of the axis is swept.
  sphere: { name: "Sphere", plane: FRONT, layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: SIZE }, "ellipse"), solid: { kind: "revolve", axis: "center", angle: 360, steps: ROUND }, at: grounded },
  cone: { name: "Cone", plane: FRONT, layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: SIZE }, "polygon", { sides: 3 }), solid: { kind: "revolve", axis: "center", angle: 360, steps: ROUND }, at: grounded },
  // A circle held off the axis, spun about the sketch's left edge — which stands on the origin, so the ring centers there, resting on the ground.
  torus: {
    name: "Torus",
    plane: FRONT,
    layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: 60 }, "path", { points: circlePoints(70, 30, 30), closed: true, viewBox: { w: SIZE, h: 60 } }),
    solid: { kind: "revolve", axis: "left", angle: 360, steps: ROUND },
    at: (_w, h) => ({ u: 0, v: -h })
  }
};
function nextName(doc, base) {
  const used = new Set(doc.nodes.map((n2) => n2.name));
  let n = 1;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}
var GAP = 0.5;
function addStarterShape(doc, kind) {
  const recipe = RECIPES[kind];
  const base = recipe.layer();
  const name = nextName(doc, recipe.name);
  const at = recipe.at(base.rect.w, base.rect.h);
  const bounds = sceneBounds(doc);
  const width = base.rect.w / PX_PER_METER * (kind === "torus" ? 2 : 1);
  const shift = bounds ? Math.max(0, bounds.max[0] + GAP + width / 2) * PX_PER_METER : 0;
  const layer = { ...base, name, sketch: { plane: recipe.plane, at: { u: at.u + shift, v: at.v } } };
  const placed = resolvePlanes({ ...doc, nodes: [...doc.nodes, layer] });
  return { doc: setSolidOf(placed, layer.id, recipe.solid, name), id: layer.id };
}

// src/modeling/geometry/editBody.ts
var MATCH_PX = 1.5;
var MIN_DEPTH = 1e-3;
var round2 = (n) => Math.round(n * 1e4) / 1e4;
function facesOf(body, pick) {
  const indices = pick.kind === "face" ? [pick.face] : pick.kind === "edge" ? body.edges[pick.edge]?.faces ?? [] : [...new Set((body.vertices[pick.vertex]?.edges ?? []).flatMap((e) => body.edges[e]?.faces ?? []))];
  return indices.map((i) => body.faces[i]?.name).filter((n) => !!n);
}
function pointsOf(body, pick) {
  if (pick.kind === "vertex") return body.vertices[pick.vertex] ? [body.vertices[pick.vertex].at] : [];
  if (pick.kind === "edge") return body.edges[pick.edge]?.points ?? [];
  const out = [];
  for (const t of body.faces[pick.face]?.triangles ?? []) {
    for (let k = 0; k < 3; k += 1) {
      const i = body.mesh.indices[t * 3 + k];
      out.push([body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2]]);
    }
  }
  return out;
}
function cornersOf(feature, profile, local) {
  const anchors = profileAnchors(profile);
  const depth = feature.depth * PX_PER_METER;
  const shift = extrudeShift(feature, depth);
  const found = /* @__PURE__ */ new Map();
  for (const p of local) {
    let best = null;
    let bestDist = Infinity;
    anchors.forEach((a, anchor) => {
      for (const cap of ["start", "end"]) {
        const [tx, ty, tz] = feature.tweaks?.[cornerKey({ anchor, cap })] ?? [0, 0, 0];
        const d = Math.hypot(a.x + tx - p.x, a.y + ty - p.y, (cap === "end" ? depth : 0) + shift + tz - p.out);
        if (d < bestDist) [best, bestDist] = [{ anchor, cap }, d];
      }
    });
    if (!best || bestDist > MATCH_PX) return null;
    found.set(cornerKey(best), best);
  }
  return [...found.values()];
}
function moveOutline(doc, profile, indices, dx, dy) {
  const path2 = toEditablePath(profile);
  const moved = refit(moveAnchors(path2, indices, path2.points ?? [], dx, dy));
  const shift = { x: moved.rect.x - profile.rect.x, y: moved.rect.y - profile.rect.y };
  const top = doc.nodes.find((n) => n.id === profile.id);
  if (!top) return updateNode(doc, profile.id, moved);
  if (top.sketch && top.sketch.plane.kind !== "custom") {
    const at = top.sketch.at ?? { u: 0, v: 0 };
    return updateNode(doc, profile.id, { ...moved, sketch: { ...top.sketch, at: { u: round2(at.u + shift.x), v: round2(at.v + shift.y) } } });
  }
  if (top.space) {
    const [sx, sy] = top.space.scale ?? [1, 1, 1];
    const [ox, oy, oz] = rotate([shift.x / PX_PER_METER * sx, -shift.y / PX_PER_METER * sy, 0], top.space.rotation);
    const [px, py, pz] = top.space.position;
    return updateNode(doc, profile.id, { ...moved, space: { ...top.space, position: [round2(px + ox), round2(py + oy), round2(pz + oz)] } });
  }
  return updateNode(doc, profile.id, moved);
}
function moveStartCap(doc, feature, profile, meters2) {
  const top = doc.nodes.find((n) => n.id === profile.id);
  const plane = top?.sketch?.plane;
  if (!top || !plane || plane.kind !== "default" && plane.kind !== "offset") {
    return { blocked: "This face moves with its sketch \u2014 pull the other end, or move the sketch" };
  }
  const next = plane.kind === "offset" ? { ...plane, distance: round2(plane.distance + meters2) } : { kind: "offset", from: plane, distance: round2(meters2) };
  const depth = Math.max(MIN_DEPTH, round2(feature.depth - meters2));
  const moved = updateNode(doc, top.id, { sketch: { ...top.sketch, plane: next } });
  return { doc: updateFeature(moved, feature.id, { depth }), did: `${feature.name} starts ${round2(meters2)} m further out` };
}
function editBody(doc, objectId, pick, delta) {
  const object = objectsOf(doc).find((o) => o.id === objectId);
  if (!object) return { blocked: "That part is gone" };
  const body = bodyOf(doc, object);
  const names = facesOf(body, pick);
  if (names.length === 0) return { blocked: "Nothing to edit there" };
  if (new Set(names.map((n) => `${n.feature}|${n.profile}`)).size > 1) return { blocked: "That lies where two features meet \u2014 pick a face of one of them" };
  const { feature: featureId, profile: profileId } = names[0];
  const feature = object.features.find((f) => f.id === featureId);
  const profile = findNode(doc, profileId);
  if (!feature || !profile) return { blocked: "What built that is gone" };
  const placed = linkOfLayer(doc, profileId);
  if (placed) return { blocked: `Placed from a sketch \u2014 edit \u201C${placed.node.name}\u201D there`, sketch: placed.link.doc };
  if (feature.kind === "revolve") return { blocked: `${feature.name} spins its sketch \u2014 edit the sketch, or its angle and axis in the right panel` };
  if (feature.kind === "sweep") return { blocked: `${feature.name} follows a path \u2014 edit the sketch or the path` };
  if (feature.kind === "loft") return { blocked: "Lofts aren\u2019t built yet" };
  const toLocal = sceneToLayer(doc, profile);
  const at = pointsOf(body, pick)[0];
  if (!at) return { blocked: "Nothing to edit there" };
  const from = toLocal(at);
  const to = toLocal([at[0] + delta[0], at[1] + delta[1], at[2] + delta[2]]);
  const d = { x: to.x - from.x, y: to.y - from.y, out: (to.out - from.out) / PX_PER_METER };
  if (pick.kind === "face" && names[0].role !== "side") {
    if (names[0].role === "end") {
      const sign = feature.direction === "reverse" ? -1 : feature.direction === "symmetric" ? 2 : 1;
      const depth = Math.max(MIN_DEPTH, round2(feature.depth + sign * d.out));
      return { doc: updateFeature(doc, feature.id, { depth }), did: `${feature.name} is ${depth} m deep` };
    }
    if (feature.direction === "reverse" || feature.direction === "symmetric") return { blocked: "Pull the other end to change its depth" };
    return moveStartCap(doc, feature, profile, d.out);
  }
  const corners = cornersOf(feature, profile, pointsOf(body, pick).map((p) => toLocal(p)));
  if (!corners) return { blocked: "That side runs round a curve \u2014 move the curve\u2019s points in sketch mode" };
  const anchors = [...new Set(corners.map((c) => c.anchor))];
  const whole = anchors.every((a) => corners.some((c) => c.anchor === a && c.cap === "start") && corners.some((c) => c.anchor === a && c.cap === "end"));
  if (isVectorNode(profile) && whole && (pick.kind === "face" || Math.abs(d.out) < 1e-6)) {
    const next = moveOutline(doc, profile, anchors, d.x, d.y);
    return { doc: next, did: anchors.length === 1 ? `Moved a point of ${profile.name}` : `Moved a side of ${profile.name}` };
  }
  const tweaks = { ...feature.tweaks };
  for (const c of corners) {
    const [x, y, z] = tweaks[cornerKey(c)] ?? [0, 0, 0];
    tweaks[cornerKey(c)] = [round2(x + d.x), round2(y + d.y), round2(z + d.out * PX_PER_METER)];
  }
  return { doc: updateFeature(doc, feature.id, { tweaks }), did: corners.length === 1 ? `Moved a point of ${profile.name}` : `Moved ${corners.length} points of ${profile.name}` };
}
function faceBoundary(body, face) {
  const point = (i) => [body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2]];
  const key = (p) => p.map((v) => Math.round(v * 1e5)).join(",");
  const sides = /* @__PURE__ */ new Map();
  for (const t of body.faces[face].triangles) {
    for (let k = 0; k < 3; k += 1) {
      const from = point(body.mesh.indices[t * 3 + k]);
      const to = point(body.mesh.indices[t * 3 + (k + 1) % 3]);
      if (key(from) === key(to)) continue;
      const id = [key(from), key(to)].sort().join("|");
      const seen2 = sides.get(id);
      if (seen2) seen2.uses += 1;
      else sides.set(id, { from, to, uses: 1 });
    }
  }
  const next = /* @__PURE__ */ new Map();
  for (const s of sides.values()) if (s.uses === 1) next.set(key(s.from), s.to);
  let best = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [startKey, first] of next) {
    if (seen.has(startKey)) continue;
    const loop = [];
    let at = first;
    let atKey = startKey;
    while (at && !seen.has(atKey)) {
      seen.add(atKey);
      loop.push(at);
      atKey = key(at);
      at = next.get(atKey);
    }
    if (loop.length > best.length) best = loop;
  }
  return best.length >= 3 ? best : null;
}
function extrudeFace(doc, objectId, face, meters2) {
  const object = objectsOf(doc).find((o) => o.id === objectId);
  if (!object) return { blocked: "That part is gone" };
  const body = bodyOf(doc, object);
  const named = body.faces[face]?.name;
  if (!named) return { blocked: "Nothing to extrude there" };
  const frame = faceFrame(doc, body, face);
  const normal = rotate([0, 0, 1], frame.rotation);
  if (meters2 <= 0) {
    if (meters2 === 0) return { doc, did: "Extrude 0 m" };
    return editBody(doc, objectId, { kind: "face", face }, [normal[0] * meters2, normal[1] * meters2, normal[2] * meters2]);
  }
  const loop = faceBoundary(body, face);
  if (!loop) return { blocked: "That face has no outline to extrude" };
  const placement = { position: frame.origin, rotation: frame.rotation };
  const flat = loop.map((p) => worldToPlane(placement, p));
  const span = Math.max(Math.max(...flat.map((p) => p.u)) - Math.min(...flat.map((p) => p.u)), Math.max(...flat.map((p) => p.v)) - Math.min(...flat.map((p) => p.v)));
  if (flat.some((p) => Math.abs(p.out) > span * 0.15)) return { blocked: "That face isn\u2019t flat enough to extrude" };
  const x0 = Math.min(...flat.map((p) => p.u));
  const y0 = Math.min(...flat.map((p) => p.v));
  const points = flat.map((p) => ({ x: round2(p.u - x0), y: round2(p.v - y0) }));
  const rect = { x: 0, y: 0, w: Math.max(...points.map((p) => p.x)) || 1, h: Math.max(...points.map((p) => p.y)) || 1 };
  const source = findNode(doc, named.profile);
  const sketch = {
    ...createVectorNode(rect, "path", { points, closed: true, viewBox: { w: rect.w, h: rect.h } }),
    name: nextSketchName(doc),
    // The same stuff as the face it grows from.
    style: { fills: source?.style.fills ?? [] },
    sketch: { plane: { kind: "face", objectId, face: named }, at: { u: round2(x0), v: round2(y0) } }
  };
  const stood = resolvePlanes({ ...doc, nodes: [...doc.nodes, sketch] });
  const depth = Math.max(MIN_DEPTH, round2(meters2));
  const added = addFeature(stood, objectId, sketch.id, { kind: "extrude", depth });
  return { doc: resolvePlanes(added.doc), did: `Extruded the face ${depth} m`, feature: added.featureId };
}
function faceIndexOf(body, name) {
  return body.faces.findIndex((f) => f.name.feature === name.feature && f.name.role === name.role && f.name.profile === name.profile && (f.name.segment ?? -1) === (name.segment ?? -1));
}

// src/modeling/viewport/selectionModes.ts
function elementCenter(body, ref) {
  if (ref.kind === "vertex") return body.vertices[ref.index]?.at ?? null;
  const points = ref.kind === "edge" ? body.edges[ref.index]?.points ?? [] : (body.faces[ref.index]?.triangles ?? []).flatMap(
    (t) => [0, 1, 2].map((k) => {
      const i = body.mesh.indices[t * 3 + k];
      return [body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2]];
    })
  );
  if (points.length === 0) return null;
  const sum = points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

// src/modeling/viewport/modalTransform.ts
var RAD2 = Math.PI / 180;
var SAME_POINT = 1e-5;
var sub2 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
var add2 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
var times = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
var cross2 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
var tidy = (n, places = 4) => Math.round(n * 10 ** places) / 10 ** places || 0;
function movePoint(move, pivot, p) {
  if (move.kind === "translate") return add2(p, move.by);
  if (move.kind === "rotate") return add2(pivot, rotateAbout(sub2(p, pivot), move.axis, move.deg));
  const d = sub2(p, pivot);
  return add2(pivot, [d[0] * move.by[0], d[1] * move.by[1], d[2] * move.by[2]]);
}
function movePlacement(move, pivot, placement) {
  const { position, rotation } = placement;
  const scale2 = placement.scale ?? [1, 1, 1];
  let next;
  if (move.kind === "translate") next = { position: add2(position, move.by), rotation, scale: scale2 };
  else if (move.kind === "rotate") {
    const turn = (v) => rotateAbout(v, move.axis, move.deg);
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => turn(rotate(e, rotation)));
    next = { position: add2(pivot, turn(sub2(position, pivot))), rotation: eulerOf(axes[0], axes[1], axes[2]), scale: scale2 };
  } else {
    const d = unrotate(sub2(position, pivot), rotation);
    next = {
      position: add2(pivot, rotate([d[0] * move.by[0], d[1] * move.by[1], d[2] * move.by[2]], rotation)),
      rotation,
      scale: [scale2[0] * move.by[0], scale2[1] * move.by[1], scale2[2] * move.by[2]]
    };
  }
  const out = { position: next.position.map((v) => tidy(v)), rotation: next.rotation.map((v) => tidy(v, 2)) };
  const s = next.scale.map((v) => tidy(v));
  return s.every((v) => v === 1) ? out : { ...out, scale: s };
}
var isIdentity = (p) => p.position.every((v) => v === 0) && p.rotation.every((v) => v === 0) && (p.scale ?? [1, 1, 1]).every((v) => v === 1);
var UNPLACED = { position: [0, 0, 0], rotation: [0, 0, 0] };
var partsOf = (doc, ids) => objectsOf(doc).filter((o) => ids.includes(o.id));
function pivotOf(doc, target) {
  if (target.kind === "elements") {
    const centers = target.elements.flatMap((ref) => {
      const object = objectsOf(doc).find((o) => o.id === ref.objectId);
      const c = object ? elementCenter(bodyOf(doc, object), ref) : null;
      return c ? [c] : [];
    });
    if (!centers.length) return null;
    return times(centers.reduce((s, c) => add2(s, c), [0, 0, 0]), 1 / centers.length);
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const reach = (p) => {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  };
  for (const object of partsOf(doc, target.parts)) {
    const { positions } = bodyOf(doc, object).mesh;
    for (let i = 0; i < positions.length; i += 3) reach([positions[i], positions[i + 1], positions[i + 2]]);
  }
  for (const id of target.layers) {
    const node = findNode(doc, id);
    if (!node) continue;
    const placement = placementOf(node);
    for (const [u, v] of [[0, 0], [node.rect.w, 0], [0, node.rect.h], [node.rect.w, node.rect.h]]) reach(planeToWorld(placement, u, v));
  }
  return Number.isFinite(min[0]) ? times(add2(min, max), 0.5) : null;
}
function pushNormalOf(doc, target) {
  if (target.kind !== "elements" || target.elements.length !== 1 || target.elements[0].kind !== "face") return void 0;
  const ref = target.elements[0];
  const object = objectsOf(doc).find((o) => o.id === ref.objectId);
  if (!object) return void 0;
  const body = bodyOf(doc, object);
  let sum = [0, 0, 0];
  let area2 = 0;
  for (const t of body.faces[ref.index]?.triangles ?? []) {
    const [a, b, c] = [0, 1, 2].map((k) => {
      const i = body.mesh.indices[t * 3 + k];
      return [body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2]];
    });
    const n = cross2(sub2(b, a), sub2(c, a));
    sum = add2(sum, n);
    area2 += Math.hypot(...n);
  }
  const len = Math.hypot(...sum);
  return area2 > 0 && len / area2 > 0.99 ? times(sum, 1 / len) : void 0;
}
function applyMove(doc, target, move, pivot) {
  if (move.kind === "extrude") {
    const ref = target.kind === "elements" && target.elements.length === 1 && target.elements[0].kind === "face" ? target.elements[0] : null;
    if (!ref) return { doc, said: "Pick one face to extrude", blocked: true };
    const edit = extrudeFace(doc, ref.objectId, ref.index, move.amount);
    if ("blocked" in edit) return { doc, said: edit.blocked, blocked: true };
    const object = objectsOf(edit.doc).find((o) => o.id === ref.objectId);
    const end = object && edit.feature ? bodyOf(edit.doc, object).faces.findIndex((f) => f.name.feature === edit.feature && f.name.role === "end") : -1;
    return { doc: edit.doc, said: edit.did, ...end >= 0 ? { elements: [{ ...ref, index: end }] } : {} };
  }
  if (target.kind === "parts") {
    let next = doc;
    for (const object of partsOf(doc, target.parts)) {
      const placement = movePlacement(move, pivot, object.placement ?? UNPLACED);
      next = setPartPlacement(next, object.id, isIdentity(placement) ? void 0 : placement);
    }
    for (const id of target.layers) {
      const node = findNode(next, id);
      if (!node) continue;
      const space = movePlacement(move, pivot, placementOf(node));
      const held = !!node.sketch && node.sketch.plane.kind !== "custom";
      next = updateNode(next, id, held ? { space, sketch: { link: node.sketch?.link, plane: { kind: "custom" } } } : { space });
    }
    const count = target.parts.length + target.layers.length;
    const what = count === 1 ? partsOf(doc, target.parts)[0]?.name ?? findNode(doc, target.layers[0])?.name ?? "it" : `${count} things`;
    return { doc: next, said: `${move.kind === "translate" ? "Moved" : move.kind === "rotate" ? "Turned" : "Scaled"} ${what}` };
  }
  return applyToElements(doc, target.elements, move, pivot);
}
function applyToElements(doc, elements, move, pivot) {
  const objects = new Map(objectsOf(doc).map((o) => [o.id, o]));
  if (elements.length === 1 && move.kind === "translate") {
    const ref = elements[0];
    const pick = ref.kind === "face" ? { kind: "face", face: ref.index } : ref.kind === "edge" ? { kind: "edge", edge: ref.index } : { kind: "vertex", vertex: ref.index };
    const edit = editBody(doc, ref.objectId, pick, move.by);
    return "blocked" in edit ? { doc, said: edit.blocked, blocked: true } : { doc: edit.doc, said: edit.did };
  }
  const steps = [];
  const seen = /* @__PURE__ */ new Set();
  const corner = (objectId, at) => {
    const key = `${objectId}:${at.map((v) => Math.round(v / SAME_POINT)).join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    steps.push({ objectId, at });
  };
  for (const ref of elements) {
    const object = objects.get(ref.objectId);
    if (!object) continue;
    const body = bodyOf(doc, object);
    if (ref.kind === "vertex" && body.vertices[ref.index]) corner(ref.objectId, body.vertices[ref.index].at);
    if (ref.kind === "edge") body.vertices.forEach((v) => v.edges.includes(ref.index) && corner(ref.objectId, v.at));
    if (ref.kind === "face") {
      const face = body.faces[ref.index];
      if (!face) continue;
      if (move.kind === "translate" && face.name.role !== "side") steps.push({ objectId: ref.objectId, face: face.name, at: elementCenter(body, ref) ?? pivot });
      else outlineOfFace(body, ref.index).vertices.forEach((v) => corner(ref.objectId, v.at));
    }
  }
  let next = doc;
  let moved = 0;
  let why = null;
  for (const step of steps) {
    const object = objectsOf(next).find((o) => o.id === step.objectId);
    if (!object) continue;
    const body = bodyOf(next, object);
    let pick = null;
    if (step.face) {
      const index = faceIndexOf(body, step.face);
      pick = index < 0 ? null : { kind: "face", face: index };
    } else {
      const index = body.vertices.findIndex((v) => Math.hypot(...sub2(v.at, step.at)) < SAME_POINT * 10);
      pick = index < 0 ? null : { kind: "vertex", vertex: index };
    }
    if (!pick) continue;
    const delta = sub2(movePoint(move, pivot, step.at), step.at);
    const edit = editBody(next, step.objectId, pick, delta);
    if ("blocked" in edit) {
      why ??= edit.blocked;
      continue;
    }
    next = edit.doc;
    moved += 1;
  }
  if (!moved) return { doc, said: why ?? "Nothing there moves that way", blocked: true };
  const verb = move.kind === "translate" ? "Moved" : move.kind === "rotate" ? "Turned" : "Scaled";
  return { doc: next, said: `${verb} ${elements.length} ${elements[0].kind === "vertex" ? "points" : elements[0].kind === "edge" ? "edges" : "faces"}${why ? ` \u2014 some couldn\u2019t: ${why}` : ""}` };
}

// src/modeling/scene3d/sceneMeshes.ts
var meshCache = /* @__PURE__ */ new WeakMap();
function layerMesh(node, doc, size = node.rect) {
  const feature = featureOf(doc, node.id)?.feature ?? null;
  const solid2 = solidOf(doc, node.id);
  const pathKey = solid2?.kind === "sweep" ? findById(doc, solid2.pathId) : null;
  const cached = meshCache.get(node);
  if (cached && cached.feature === feature && cached.pathKey === pathKey && cached.w === size.w && cached.h === size.h) return cached.mesh;
  let mesh = null;
  const sized = size.w === node.rect.w && size.h === node.rect.h ? node : { ...node, rect: { ...node.rect, w: size.w, h: size.h } };
  const shape = shapeOf(sized, toleranceOf(feature, Math.max(node.rect.w, node.rect.h)));
  if (shape) {
    const box = { w: size.w, h: size.h };
    if (solid2?.kind === "extrude") {
      const depth = solid2.depth * PX_PER_METER;
      const extruded = feature?.kind === "extrude" ? feature : null;
      const built = tweakMesh(extrude(shape, box, depth), node, depth, extruded?.tweaks);
      const shift = extruded ? extrudeShift(extruded, depth) : 0;
      mesh = shift ? { ...built, positions: built.positions.map((v, i) => i % 3 === 2 ? v + shift : v) } : built;
    } else if (solid2?.kind === "revolve") mesh = revolve(shape, box, solid2.axis, solid2.angle, solid2.steps);
    else if (solid2?.kind === "sweep") mesh = pathKey ? null : flatMesh(shape, box);
    else mesh = flatMesh(shape, box);
  }
  meshCache.set(node, { feature, pathKey, w: size.w, h: size.h, mesh });
  return mesh;
}
function sweepTolerance(doc, profile) {
  return toleranceOf(featureOf(doc, profile.id)?.feature, Math.max(profile.rect.w, profile.rect.h));
}
function sweptMesh(profile, path2, tolerance) {
  const shape = shapeOf(profile, tolerance);
  if (!shape || !isVectorNode(path2)) return null;
  const { points, closed } = guidePolyline(path2);
  const local = points.map((p) => ({ x: p.x - path2.rect.x, y: p.y - path2.rect.y }));
  return sweep(shape, { w: profile.rect.w, h: profile.rect.h }, local, closed);
}
function sweepsAlong(doc) {
  const out = /* @__PURE__ */ new Map();
  for (const object of objectsOf(doc)) {
    for (const feature of object.features) {
      if (feature.kind !== "sweep" || feature.hidden) continue;
      const profile = findById(doc, feature.sketchId);
      if (profile) out.set(feature.pathId, [...out.get(feature.pathId) ?? [], profile]);
    }
  }
  return out;
}
function findById(doc, id) {
  const visit = (nodes) => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = n.kind === "frame" ? visit(n.children) : null;
      if (hit) return hit;
    }
    return null;
  };
  return visit(doc.nodes);
}
function sceneTriangles(doc) {
  let total = 0;
  const sweeps = sweepsAlong(doc);
  const visit = (nodes) => {
    for (const n of nodes) {
      if (n.hidden) continue;
      const mesh = layerMesh(n, doc);
      if (mesh) total += triangleCount(mesh);
      for (const profile of sweeps.get(n.id) ?? []) {
        const tube = sweptMesh(profile, n, sweepTolerance(doc, profile));
        if (tube) total += triangleCount(tube);
      }
      if (n.kind === "frame") visit(n.children);
    }
  };
  visit(doc.nodes);
  return total;
}

// src/modeling/commands/describeScene.ts
var r3 = (n) => Math.round(n * 1e3) / 1e3 || 0;
var m = (px) => r3(px / PX_PER_METER);
var vec = (v) => `(${v.map(r3).join(", ")})`;
function planeName(doc, ref) {
  if (!ref) return "Front";
  if (ref.kind === "default") return ref.plane[0].toUpperCase() + ref.plane.slice(1);
  if (ref.kind === "offset") return `${planeName(doc, ref.from)}${ref.distance >= 0 ? "+" : ""}${r3(ref.distance)}`;
  if (ref.kind === "custom") return "a custom plane";
  const part = objectsOf(doc).find((o) => o.id === ref.objectId);
  if (!part) return "a face that is gone";
  const index = bodyOf(doc, part).faces.findIndex((f) => f.name.feature === ref.face.feature && f.name.role === ref.face.role && (f.name.segment ?? -1) === (ref.face.segment ?? -1));
  return index < 0 ? `a face of ${part.name} that is gone` : `"${part.name}: ${faceLabel(bodyOf(doc, part), part, index)}"`;
}
function faceLabel(body, part, index) {
  const face = body.faces[index];
  const feature = part.features.find((f) => f.id === face.name.feature);
  const same = body.faces.filter((f) => f.name.role === face.name.role && f.name.feature === face.name.feature);
  const n = same.indexOf(face) + 1;
  const role = face.name.role === "side" && same.length > 1 ? `side ${n}` : face.name.role;
  return part.features.length > 1 && feature ? `${feature.name} ${role}` : role;
}
var AXES = [["+X", [1, 0, 0]], ["-X", [-1, 0, 0]], ["+Y", [0, 1, 0]], ["-Y", [0, -1, 0]], ["+Z", [0, 0, 1]], ["-Z", [0, 0, -1]]];
function faceInfo(doc, part, body, index) {
  const points = [];
  for (const t of body.faces[index].triangles) {
    for (let k = 0; k < 3; k += 1) {
      const i = body.mesh.indices[t * 3 + k];
      points.push([body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2]]);
    }
  }
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i += 1) [lo[i], hi[i]] = [Math.min(lo[i], p[i]), Math.max(hi[i], p[i])];
  const center = lo.map((v, i) => (v + hi[i]) / 2);
  const normal = pushNormalOf(doc, { kind: "elements", elements: [{ objectId: part.id, kind: "face", index }] });
  let size;
  let facing;
  if (normal) {
    const frame = faceFrame(doc, body, index);
    const on = points.map((p) => worldToPlane({ position: frame.origin, rotation: frame.rotation }, p));
    const us = on.map((p) => p.u);
    const vs = on.map((p) => p.v);
    size = [m(Math.max(...us) - Math.min(...us)), m(Math.max(...vs) - Math.min(...vs))];
    const axis2 = AXES.find(([, a]) => a[0] * normal[0] + a[1] * normal[1] + a[2] * normal[2] > 0.9999);
    facing = axis2 ? axis2[0] : vec(normal);
  } else {
    size = hi.map((v, i) => r3(v - lo[i]));
    facing = "curved";
  }
  return { name: faceLabel(body, part, index), size, center: center.map(r3), facing };
}
function nameOf(doc, id) {
  const find = (nodes) => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = find(childrenOf(n));
      if (hit) return hit;
    }
    return null;
  };
  return find(doc.nodes)?.name ?? "a layer that is gone";
}
function featureDoes(doc, feature) {
  if (feature.kind === "loft") return `lofts ${feature.sketchIds.length} sketches (not built yet)`;
  const top = doc.nodes.find((n) => n.id === feature.sketchId) ?? doc.nodes.find((n) => childrenOf(n).some((c) => c.id === feature.sketchId));
  const from = `"${nameOf(doc, feature.sketchId)}" on ${planeName(doc, top?.sketch?.plane)}`;
  const how = feature.op === "new" || feature.op === "add" ? "" : `, ${feature.op}s (shown as added for now)`;
  const smooth = feature.smoothness && feature.smoothness !== "medium" ? `, ${feature.smoothness} smoothness` : "";
  const moved = feature.kind === "extrude" && feature.tweaks ? `, ${Object.keys(feature.tweaks).length} corners moved on their own` : "";
  if (feature.kind === "extrude") return `extrudes ${from} ${r3(feature.depth)} m ${feature.direction === "reverse" ? "reversed" : feature.direction === "symmetric" ? "both sides" : "one way"}${how}${smooth}${moved}`;
  if (feature.kind === "revolve") return `revolves ${from} ${r3(feature.angle)}\xB0 about its ${feature.axis}${feature.axis === "center" ? "" : " edge"}, ${feature.steps} steps${how}${smooth}`;
  return `sweeps ${from} along "${nameOf(doc, feature.pathId)}"${how}${smooth}`;
}
function sceneInfo(env, docs = [], part) {
  const broken = brokenFeatures(env);
  const parts = objectsOf(env).filter((o) => !part || o.id === part || o.name.toLowerCase() === part.toLowerCase()).map((object) => {
    const body = bodyOf(env, object);
    const p = body.mesh.positions;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 1) [min[i % 3], max[i % 3]] = [Math.min(min[i % 3], p[i]), Math.max(max[i % 3], p[i])];
    const placed = object.placement;
    const moved = placed ? [`moved ${vec(placed.position)} m`, placed.rotation.some((v) => v) ? `turned ${placed.rotation.map(r3).join(", ")}\xB0` : "", placed.scale ? `scaled ${placed.scale.map(r3).join(", ")}\xD7` : ""].filter(Boolean).join(", ") : void 0;
    return {
      name: object.name,
      features: object.features.map((f) => ({ name: f.name, does: featureDoes(env, f), ...broken.get(f.id) ? { broken: broken.get(f.id) } : {}, ...f.hidden ? { hidden: true } : {} })),
      ...moved ? { moved } : {},
      min: (p.length ? min : [0, 0, 0]).map(r3),
      max: (p.length ? max : [0, 0, 0]).map(r3),
      triangles: body.mesh.indices.length / 3,
      // A revolve leaves faces with no area at its poles and on its axis: nothing to see or pull. Their
      // neighbours keep their numbers, which is what the commands read.
      faces: body.faces.map((_, i) => faceInfo(env, object, body, i)).filter((f) => f.size.filter((v) => v > 0).length >= 2)
    };
  });
  const used = usedLayers(env);
  const links = new Map(linksOf(env).map(({ node, link }) => [node.id, docs.find((d) => d.id === link.doc)?.name ?? "a Sketch that is gone"]));
  const sketches = part ? [] : env.nodes.filter((n) => !used.has(n.id) && !childrenOf(n).some((c) => used.has(c.id))).map((n) => {
    const problem = sketchProblem(env, n);
    return {
      name: n.name,
      // As it stands in the scene: a placed design is scaled to fit (place --width).
      is: `${n.kind === "vector" ? n.shape === "rectangle" ? "rect" : n.shape : n.kind} ${m(n.rect.w * (n.space?.scale?.[0] ?? 1))} \xD7 ${m(n.rect.h * (n.space?.scale?.[1] ?? 1))} m`,
      on: planeName(env, n.sketch?.plane),
      ...links.has(n.id) ? { linkedFrom: links.get(n.id) } : {},
      ...problem ? { broken: problem } : {}
    };
  });
  return { name: env.name, triangles: sceneTriangles(env), parts, sketches };
}
function describeScene(env, docs = [], part) {
  const info = sceneInfo(env, docs, part);
  const lines = [`${info.name} \u2014 ${info.parts.length} part${info.parts.length === 1 ? "" : "s"}, ${info.triangles.toLocaleString("en-US")} triangles. Meters; Y is up.`];
  if (part && !info.parts.length) lines.push(`No part called "${part}".`);
  const links = new Map(linksOf(env).map(({ node, link }) => [node.id, docs.find((d) => d.id === link.doc)?.name]));
  for (const p of info.parts) {
    const size = p.max.map((v, i) => r3(v - p.min[i]));
    lines.push("", `${p.name}: ${size.join(" \xD7 ")} box, ${vec(p.min)} to ${vec(p.max)}${p.moved ? `; ${p.moved}` : ""}`);
    for (const f of p.features) lines.push(`  ${f.name} ${f.does}${f.hidden ? " \u2014 turned off" : ""}${f.broken ? ` \u2014 BROKEN: ${f.broken}` : ""}`);
    const object = objectsOf(env).find((o) => o.name === p.name);
    const linked = object?.features.map((f) => "sketchId" in f ? links.get(env.nodes.find((n) => n.id === f.sketchId || childrenOf(n).some((c) => c.id === f.sketchId))?.id ?? "") : void 0).find(Boolean);
    if (linked) lines.push(`  its sketch is placed from the Sketch "${linked}" \u2014 edit it there`);
    lines.push(`  faces: ${p.faces.map((f) => `${f.name} ${f.size.join("\xD7")} at ${vec(f.center)} ${f.facing}`).join("; ")}`);
  }
  if (info.sketches.length) {
    lines.push("", "Sketches no part uses yet:");
    for (const s of info.sketches) lines.push(`  "${s.name}" ${s.is} on ${s.on}${s.linkedFrom ? `, placed from the Sketch "${s.linkedFrom}"` : ""}${s.broken ? ` \u2014 BROKEN: ${s.broken}` : ""}`);
  }
  return lines.join("\n");
}

// src/modeling/commands/modelCommands.ts
function placeSketchIn(env, source, plane = { kind: "default", plane: "front" }, frame) {
  const node = placedSketch(source, frame ? { doc: source.id, frame } : { doc: source.id }, nextId("frame"));
  if (!node) return null;
  const bounds = sceneBounds(env);
  const next = plane.kind === "default" && plane.plane === "front" ? resolvePlanes({
    ...env,
    nodes: [...env.nodes, { ...node, sketch: { ...node.sketch, plane, at: { u: bounds ? (bounds.max[0] + 0.5) * PX_PER_METER : -node.rect.w / 2, v: -node.rect.h } } }]
  }) : addSketch(env, plane, node);
  return next ? { doc: next, id: node.id } : null;
}
function parseArgs(argv) {
  const words = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1];
      if (value !== void 0 && !value.startsWith("--")) {
        flags[key] = value;
        i += 1;
      } else flags[key] = true;
    } else words.push(a);
  }
  return { words, flags };
}
var CommandError = class extends Error {
};
var fail = (message) => {
  throw new CommandError(message);
};
var norm = (s) => s.trim().toLowerCase();
var str = (flags, key) => typeof flags[key] === "string" ? flags[key] : void 0;
var need = (flags, key, what) => str(flags, key) ?? fail(`Say ${what} with --${key}`);
var num2 = (flags, key) => {
  const raw = str(flags, key);
  if (raw === void 0) return void 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fail(`--${key} must be a number, not "${raw}"`);
};
var nums = (raw, count, key) => {
  const parts = raw.split(",").map((s) => Number(s.trim()));
  if (parts.length !== count || parts.some((n) => !Number.isFinite(n))) fail(`--${key} takes ${count} numbers, like ${Array.from({ length: count }, (_, i) => i).join(",")}`);
  return parts;
};
var round5 = (n, places = 4) => Math.round(n * 10 ** places) / 10 ** places || 0;
var meters = (px) => round5(px / PX_PER_METER);
function findDoc(docs, name, kind) {
  const pool = kind ? docs.filter((d) => documentKindOf(d) === kind) : docs;
  const hit = pool.filter((d) => d.id === name || norm(d.name) === norm(name));
  if (hit.length === 1) return hit[0];
  const what = kind ? KIND_NAMES2[kind].toLowerCase() : "document";
  if (hit.length > 1) return fail(`More than one ${what} is called "${name}" \u2014 use its id: ${hit.map((d) => d.id).join(", ")}`);
  return fail(`No ${what} called "${name}". There ${pool.length === 1 ? "is" : "are"}: ${pool.map((d) => `"${d.name}"`).join(", ") || "none yet"}`);
}
function allNodes(doc) {
  const out = [];
  const step = (nodes) => nodes.forEach((n) => (out.push(n), step(childrenOf(n))));
  step(doc.nodes);
  return out;
}
function findLayer(doc, name) {
  const hit = allNodes(doc).filter((n) => n.id === name || norm(n.name) === norm(name));
  if (hit.length === 1) return hit[0];
  if (hit.length > 1) return fail(`More than one layer in "${doc.name}" is called "${name}" \u2014 use its id: ${hit.map((n) => n.id).join(", ")}`);
  return fail(`No sketch or layer called "${name}" in "${doc.name}". Top-level: ${doc.nodes.map((n) => `"${n.name}"`).join(", ") || "none"}`);
}
function findPart(doc, name) {
  const parts = objectsOf(doc);
  const hit = parts.filter((o) => o.id === name || norm(o.name) === norm(name));
  if (hit.length === 1) return hit[0];
  if (hit.length > 1) return fail(`More than one part is called "${name}" \u2014 use its id: ${hit.map((o) => o.id).join(", ")}`);
  return fail(`No part called "${name}" in "${doc.name}". Parts: ${parts.map((o) => `"${o.name}"`).join(", ") || "none yet"}`);
}
function findFeature(doc, name) {
  for (const part of objectsOf(doc)) for (const feature of part.features) if (feature.id === name || norm(feature.name) === norm(name)) return { part, feature };
  return fail(`No feature called "${name}" in "${doc.name}"`);
}
function findFace(body, part, spec) {
  const words = norm(spec).replace(/\s+face$/, "");
  const feature = part.features.find((f) => words.startsWith(norm(f.name)));
  const rest = feature ? words.slice(norm(feature.name).length).trim() : words;
  const m2 = /^(end|start|side)(?:\s+(\d+))?$/.exec(rest);
  if (!m2) return fail(`Name a face as end, start or side (side 2 for the second); with several features, put its name first: "${part.features[0]?.name ?? "Extrude 1"} end"`);
  const faces = body.faces.map((f, index) => ({ ...f, index })).filter((f) => f.name.role === m2[1] && (!feature || f.name.feature === feature.id));
  if (!faces.length) return fail(`${part.name} has no ${rest} face`);
  const features = new Set(faces.map((f) => f.name.feature));
  if (!feature && features.size > 1) return fail(`${part.name} has a ${m2[1]} face on each of ${features.size} features \u2014 say which: ${part.features.map((f) => `"${f.name} ${m2[1]}"`).join(", ")}`);
  const which = m2[2] ? Number(m2[2]) - 1 : 0;
  if (m2[1] === "side" && !m2[2] && faces.length > 1) return fail(`${part.name} has ${faces.length} sides \u2014 say which, side 1 to side ${faces.length}`);
  const face = faces[which] ?? fail(`${part.name} has ${faces.length} ${m2[1]} face${faces.length === 1 ? "" : "s"}`);
  return { index: face.index, name: face.name };
}
function planeOf(doc, raw) {
  const off = /^(front|top|side)\s*([+-]\s*\d*\.?\d+)?$/i.exec(raw.trim());
  if (off) {
    const base = { kind: "default", plane: off[1].toLowerCase() };
    return off[2] ? { kind: "offset", from: base, distance: Number(off[2].replace(/\s/g, "")) } : base;
  }
  const colon = raw.indexOf(":");
  if (colon < 0) return fail(`A plane is front, top or side (top+0.5 to offset it), or a face as "Part: end"`);
  const part = findPart(doc, raw.slice(0, colon));
  const face = findFace(bodyOf(doc, part), part, raw.slice(colon + 1));
  return { kind: "face", objectId: part.id, face: face.name };
}
var SHAPES = { rect: "rectangle", rectangle: "rectangle", ellipse: "ellipse", circle: "ellipse", polygon: "polygon", path: "path" };
var STARTERS = ["box", "cylinder", "sphere", "cone", "torus", "polygon"];
function settle(before, next) {
  return { ...resolvePlanes(syncPlacements(before, next)), updatedAt: Date.now() };
}
function envOf({ docs, flags }) {
  const env = findDoc(docs, need(flags, "env", "the environment"), "environment");
  return refreshLinks(env, (id) => docs.find((d) => d.id === id)).doc;
}
function done(said, ...writes) {
  return { ok: true, said, writes };
}
var VERBS = {
  list: ({ docs }) => {
    const line = (d) => {
      const parts = objectsOf(d).map((o) => o.name);
      return `  ${d.name}${documentKindOf(d) === "environment" ? parts.length ? ` \u2014 parts: ${parts.join(", ")}` : " \u2014 empty" : ` \u2014 ${d.nodes.length} frame${d.nodes.length === 1 ? "" : "s"}`}`;
    };
    const of = (kind) => docs.filter((d) => documentKindOf(d) === kind).map(line);
    return done(["Environments:", ...of("environment").length ? of("environment") : ["  none"], "Sketches:", ...of("sketch").length ? of("sketch") : ["  none"]].join("\n"));
  },
  describe: (ctx) => {
    const env = envOf(ctx);
    const part = str(ctx.flags, "part");
    if (part) findPart(env, part);
    return done(ctx.flags.json ? JSON.stringify(sceneInfo(env, ctx.docs, part), null, 1) : describeScene(env, ctx.docs, part));
  },
  env: ({ docs, flags }, [sub3]) => {
    if (sub3 !== "create") return fail("env create --name <name>");
    const name = need(flags, "name", "its name");
    if (docs.some((d) => norm(d.name) === norm(name))) fail(`"${name}" exists already`);
    return done(`Made the environment "${name}"`, createDoc(name, "environment"));
  },
  sketch: (ctx, [sub3]) => {
    const { docs, flags } = ctx;
    if (sub3 === "create") {
      const name2 = need(flags, "name", "its name");
      if (docs.some((d) => norm(d.name) === norm(name2))) fail(`"${name2}" exists already`);
      return done(`Made the sketch "${name2}" \u2014 draw in it with canvas.mjs build --board "${name2}", then place it`, createDoc(name2, "sketch"));
    }
    const env = envOf(ctx);
    const plane = planeOf(env, str(flags, "plane") ?? "front");
    const shapeKey = (str(flags, "shape") ?? "frame").toLowerCase();
    const name = str(flags, "name") ?? nextSketchName(env);
    const [w, h] = str(flags, "size") ? nums(str(flags, "size"), 2, "size").map((m2) => m2 * PX_PER_METER) : [100, 100];
    let node;
    if (shapeKey === "frame") node = { ...createFrameNode({ x: 0, y: 0, w, h }), name };
    else if (shapeKey in SHAPES) {
      const shape = SHAPES[shapeKey];
      if (shape === "path") {
        const pts = need(flags, "points", 'its points ("x,y x,y \u2026", meters)').trim().split(/\s+/).map((p) => nums(p, 2, "points"));
        if (pts.length < 3) fail("A path needs at least three points");
        const xs = pts.map((p) => p[0] * PX_PER_METER);
        const ys = pts.map((p) => -p[1] * PX_PER_METER);
        const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
        const rect = { x: 0, y: 0, w: Math.max(...xs) - x0 || 1, h: Math.max(...ys) - y0 || 1 };
        const points = xs.map((x, i) => ({ x: round5(x - x0, 3), y: round5(ys[i] - y0, 3) }));
        node = { ...createVectorNode(rect, "path", { points, closed: true, viewBox: { w: rect.w, h: rect.h } }), name, style: { fills: [{ type: "solid", color: "#d9d9d9" }] } };
        node = { ...node, sketch: { plane, at: { u: round5(x0, 3), v: round5(y0, 3) } } };
        return done(`Stood the sketch "${name}" on ${str(flags, "plane") ?? "front"}`, settle(env, resolvePlanes({ ...env, nodes: [...env.nodes, node] })));
      }
      node = { ...createVectorNode({ x: 0, y: 0, w, h }, shape, shape === "polygon" ? { sides: num2(flags, "sides") ?? 6 } : {}), name };
    } else return fail(`--shape is frame, rect, ellipse, polygon or path`);
    const at = str(flags, "at") ? nums(str(flags, "at"), 2, "at") : null;
    const placed = at ? resolvePlanes({ ...env, nodes: [...env.nodes, { ...node, sketch: { plane, at: { u: round5(at[0] * PX_PER_METER - w / 2, 3), v: round5(-at[1] * PX_PER_METER - h / 2, 3) } } }] }) : addSketch(env, plane, node);
    if (!placed) fail("That face is gone \u2014 pick another");
    return done(`Stood the sketch "${name}" on ${str(flags, "plane") ?? "front"} (${meters(w)} \xD7 ${meters(h)} m)`, settle(env, placed));
  },
  place: (ctx) => {
    const env = envOf(ctx);
    const source = findDoc(ctx.docs, need(ctx.flags, "sketch", "the Sketch document to place"), "sketch");
    const frame = str(ctx.flags, "frame") ? findLayer(source, str(ctx.flags, "frame")).id : void 0;
    const plane = planeOf(env, str(ctx.flags, "on") ?? str(ctx.flags, "plane") ?? "front");
    const placed = placeSketchIn(env, source, plane, frame) ?? fail(`"${source.name}" has nothing to place`);
    const node = findNode(placed.doc, placed.id);
    const width = num2(ctx.flags, "width");
    if (width === void 0) {
      const wide = meters(node.rect.w);
      return done(`Placed "${source.name}" in "${env.name}" as the sketch "${node.name}" (${wide} \xD7 ${meters(node.rect.h)} m \u2014 100 px to the meter; --width sets it), linked \u2014 edits to it there show here`, settle(env, placed.doc));
    }
    if (width <= 0) fail("--width is the placed width in meters");
    const s = width * PX_PER_METER / node.rect.w;
    const at = node.sketch?.at ?? { u: 0, v: 0 };
    const grounded2 = plane.kind === "default" && plane.plane === "front";
    const u = grounded2 ? at.u : at.u + node.rect.w * (1 - s) / 2;
    const v = grounded2 ? at.v + node.rect.h * (1 - s) : at.v + node.rect.h * (1 - s) / 2;
    const sized = updateNode(placed.doc, placed.id, { space: { ...node.space, scale: [round5(s, 6), round5(s, 6), 1] }, sketch: { ...node.sketch, at: { u: round5(u, 3), v: round5(v, 3) } } });
    return done(`Placed "${source.name}" in "${env.name}" as the sketch "${node.name}", ${round5(width)} \xD7 ${round5(meters(node.rect.h) * s)} m, linked \u2014 edits to it there show here`, settle(env, sized));
  },
  extrude: (ctx) => {
    if (!str(ctx.flags, "face")) return solid(ctx, "extrude");
    const env = envOf(ctx);
    const part = findPart(env, need(ctx.flags, "part", "the part"));
    const face = findFace(bodyOf(env, part), part, str(ctx.flags, "face"));
    const edit = extrudeFace(env, part.id, face.index, num2(ctx.flags, "depth") ?? 0.1);
    if ("blocked" in edit) return fail(edit.blocked);
    return done(`${edit.did} \u2014 on ${part.name}`, settle(env, edit.doc));
  },
  revolve: (ctx) => solid(ctx, "revolve"),
  sweep: (ctx) => solid(ctx, "sweep"),
  starter: (ctx) => {
    const env = envOf(ctx);
    const shape = need(ctx.flags, "shape", `the shape (${STARTERS.join(", ")})`).toLowerCase();
    if (!STARTERS.includes(shape)) fail(`--shape is one of ${STARTERS.join(", ")}`);
    const { doc, id } = addStarterShape(env, shape);
    let next = doc;
    const name = str(ctx.flags, "name");
    if (name) {
      next = updateNode(next, id, { name });
      const part = partReading(next, id);
      if (part) next = renameObject(next, part.object.id, name);
    }
    return done(`Added ${findNode(next, id).name}`, settle(env, next));
  },
  smoothness: (ctx) => {
    const env = envOf(ctx);
    const part = findPart(env, need(ctx.flags, "part", "the part"));
    const level = need(ctx.flags, "level", "low, medium or high").toLowerCase();
    if (!(level in SMOOTHNESS)) fail("--level is low, medium or high");
    const next = part.features.reduce((d, f) => updateFeature(d, f.id, f.kind === "revolve" ? { smoothness: level, steps: Math.max(3, Math.round(SMOOTHNESS[level].steps * f.angle / 360)) } : { smoothness: level }), env);
    return done(`${part.name} is ${SMOOTHNESS[level].label.toLowerCase()} smoothness`, settle(env, next));
  },
  feature: (ctx) => {
    const env = envOf(ctx);
    const byPart = !str(ctx.flags, "name") && str(ctx.flags, "part") ? findPart(env, str(ctx.flags, "part")) : null;
    if (byPart && byPart.features.length !== 1) fail(`${byPart.name} has ${byPart.features.length} features \u2014 name one with --name: ${byPart.features.map((f) => `"${f.name}"`).join(", ")}`);
    const { feature } = byPart ? { feature: byPart.features[0] } : findFeature(env, need(ctx.flags, "name", 'the feature ("Extrude 1"), or --part for a part with one'));
    const patch = {};
    const depth = num2(ctx.flags, "depth");
    if (depth !== void 0) patch.depth = Math.max(1e-3, depth);
    if (str(ctx.flags, "direction")) patch.direction = direction(str(ctx.flags, "direction"));
    if (str(ctx.flags, "axis")) patch.axis = axis(str(ctx.flags, "axis"));
    if (num2(ctx.flags, "angle") !== void 0) patch.angle = num2(ctx.flags, "angle");
    if (num2(ctx.flags, "steps") !== void 0) patch.steps = Math.round(num2(ctx.flags, "steps"));
    if (str(ctx.flags, "op")) patch.op = op(str(ctx.flags, "op"));
    if (!Object.keys(patch).length) fail("Say what to set: --depth, --direction, --axis, --angle, --steps or --op");
    return done(`${feature.name}: ${Object.entries(patch).map(([k, v]) => `${k} ${v}`).join(", ")}`, settle(env, updateFeature(env, feature.id, patch)));
  },
  edit: (ctx) => {
    const env = envOf(ctx);
    const part = findPart(env, need(ctx.flags, "part", "the part"));
    const face = findFace(bodyOf(env, part), part, need(ctx.flags, "face", "the face (end, start, side 2\u2026)"));
    const target = { kind: "elements", elements: [{ objectId: part.id, kind: "face", index: face.index }] };
    const pull = num2(ctx.flags, "pull");
    let by;
    if (pull !== void 0) {
      const normal = pushNormalOf(env, target) ?? fail(`That face is curved \u2014 resize its sketch instead: resize --env "${env.name}" --sketch <sketch> --size w,h`);
      by = [normal[0] * pull, normal[1] * pull, normal[2] * pull];
    } else by = nums(need(ctx.flags, "move", "how far: --pull <m> or --move x,y,z"), 3, "move");
    const result = applyMove(env, target, { kind: "translate", by }, pivotOf(env, target) ?? [0, 0, 0]);
    if (result.blocked) fail(result.said);
    return done(result.said, settle(env, result.doc));
  },
  move: (ctx) => {
    const env = envOf(ctx);
    const part = findPart(env, need(ctx.flags, "part", "the part"));
    const target = { kind: "parts", parts: [part.id], layers: [] };
    const about = str(ctx.flags, "about") ? nums(str(ctx.flags, "about"), 3, "about") : pivotOf(env, target) ?? [0, 0, 0];
    const moves = [];
    if (str(ctx.flags, "by")) moves.push({ kind: "translate", by: nums(str(ctx.flags, "by"), 3, "by") });
    if (str(ctx.flags, "turn")) {
      const [ax, deg] = str(ctx.flags, "turn").split(",");
      const dir = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
      moves.push({ kind: "rotate", axis: dir[norm(ax)] ?? fail("--turn is axis,degrees: x,90"), deg: Number(deg) });
    }
    if (str(ctx.flags, "scale")) {
      const s = str(ctx.flags, "scale").split(",").map(Number);
      moves.push({ kind: "scale", by: s.length === 3 ? s : [s[0], s[0], s[0]] });
    }
    if (!moves.length) fail("Say how: --by x,y,z (meters), --turn axis,degrees, --scale f \u2014 with --about x,y,z to turn or scale about a point (a hinge)");
    const next = moves.reduce((d, m2) => applyMove(d, target, m2, about).doc, env);
    const placed = objectsOf(next).find((o) => o.id === part.id)?.placement;
    return done(`Moved ${part.name}${placed ? ` \u2014 now at ${placed.position.join(", ")} m, turned ${placed.rotation.join(", ")}\xB0` : " back where its sketch stands it"}`, settle(env, next));
  },
  resize: (ctx) => {
    const env = envOf(ctx);
    const layer = findLayer(env, need(ctx.flags, "sketch", "the sketch"));
    if (linkOfLayer(env, layer.id)) fail(`"${layer.name}" is placed from a Sketch document \u2014 resize it there, or unlink it first`);
    const [w, h] = nums(need(ctx.flags, "size", "the new size (w,h meters)"), 2, "size").map((m2) => Math.max(1, m2 * PX_PER_METER));
    const top = env.nodes.find((n) => n.id === layer.id);
    const at = top?.sketch?.at;
    const patch = { rect: { ...layer.rect, w, h } };
    if (top?.sketch && at) patch.sketch = { ...top.sketch, at: { u: round5(at.u - (w - layer.rect.w) / 2, 3), v: round5(at.v - (h - layer.rect.h) / 2, 3) } };
    const sized = layer.kind === "vector" && layer.shape === "path" ? fail("A path keeps its points \u2014 move them in sketch mode") : updateNode(env, layer.id, patch);
    return done(`${layer.name} is ${meters(w)} \xD7 ${meters(h)} m`, settle(env, sized));
  },
  unlink: (ctx) => {
    const env = envOf(ctx);
    const layer = findLayer(env, need(ctx.flags, "sketch", "the placed sketch"));
    if (!linkOfLayer(env, layer.id)) fail(`"${layer.name}" isn't placed from a Sketch document`);
    return done(`"${layer.name}" is its own now \u2014 edits to its Sketch no longer reach it`, settle(env, unlinkSketch(env, layer.id)));
  },
  rename: (ctx) => {
    const env = envOf(ctx);
    const to = need(ctx.flags, "to", "the new name");
    if (str(ctx.flags, "part")) {
      const part = findPart(env, str(ctx.flags, "part"));
      return done(`${part.name} is now ${to}`, settle(env, renameObject(env, part.id, to)));
    }
    const layer = findLayer(env, need(ctx.flags, "sketch", "what to rename: --part or --sketch"));
    return done(`${layer.name} is now ${to}`, settle(env, updateNode(env, layer.id, { name: to })));
  },
  delete: (ctx) => {
    const env = envOf(ctx);
    if (str(ctx.flags, "part")) {
      const part = findPart(env, str(ctx.flags, "part"));
      return done(`Deleted ${part.name}; its sketches stay`, settle(env, removeObject(env, part.id)));
    }
    if (str(ctx.flags, "feature")) {
      const { feature } = findFeature(env, str(ctx.flags, "feature"));
      return done(`Deleted ${feature.name}`, settle(env, removeFeature(env, feature.id)));
    }
    const layer = findLayer(env, need(ctx.flags, "sketch", "what to delete: --part, --feature or --sketch"));
    const users = objectsOf(env).filter((o) => o.features.some((f) => "sketchId" in f && f.sketchId === layer.id)).map((o) => o.name);
    return done(`Deleted ${layer.name}${users.length ? ` \u2014 ${users.join(", ")} now ${users.length === 1 ? "shows" : "show"} as broken; re-pick or delete ${users.length === 1 ? "it" : "them"}` : ""}`, settle(env, deleteNode(env, layer.id)));
  }
};
function direction(raw) {
  const d = { normal: "normal", "one-way": "normal", reverse: "reverse", symmetric: "symmetric", both: "symmetric", "both-sides": "symmetric" }[norm(raw)];
  return d ?? fail("--direction is normal, reverse or symmetric");
}
function axis(raw) {
  return ["center", "left", "bottom"].includes(norm(raw)) ? norm(raw) : fail("--axis is center, left or bottom");
}
function op(raw) {
  return ["new", "add", "subtract", "intersect"].includes(norm(raw)) ? norm(raw) : fail("--op is add, subtract or intersect");
}
function solid(ctx, kind) {
  const env = envOf(ctx);
  const layer = findLayer(env, need(ctx.flags, "sketch", "the sketch"));
  if (layer.kind !== "frame" && layer.kind !== "vector") fail(`"${layer.name}" is ${layer.kind === "text" ? "text" : "not a shape"} \u2014 extrude a frame or a shape`);
  if (linkOfLayer(env, layer.id) && layer.id !== linkOfLayer(env, layer.id).node.id && kind !== "extrude") fail(`"${layer.name}" is part of a placed sketch \u2014 shape the placed sketch as a whole`);
  const spec = kind === "extrude" ? { kind, depth: Math.max(1e-3, num2(ctx.flags, "depth") ?? 0.2) } : kind === "revolve" ? { kind, axis: axis(str(ctx.flags, "axis") ?? "center"), angle: num2(ctx.flags, "angle") ?? 360, steps: 48 } : { kind, pathId: findLayer(env, need(ctx.flags, "path", "the path to follow")).id };
  let next = setSolidOf(env, layer.id, spec, str(ctx.flags, "part") ?? layer.name);
  const made = partReading(next, layer.id);
  if (kind === "extrude" && str(ctx.flags, "direction")) next = updateFeature(next, made.feature.id, { direction: direction(str(ctx.flags, "direction")) });
  const what = kind === "extrude" ? `${spec.kind === "extrude" ? spec.depth : ""} m` : kind === "revolve" ? `about its ${str(ctx.flags, "axis") ?? "center"}` : "along its path";
  return done(`${made.feature.name} ${kind}s "${layer.name}" ${what} \u2014 part "${made.object.name}"`, settle(env, next));
}
function runModelCommand(docs, argv) {
  const { words, flags } = parseArgs(argv);
  const [verb, ...rest] = words;
  const run = verb ? VERBS[verb] : void 0;
  if (!run) return { ok: false, error: `Unknown command "${verb ?? ""}". Commands: ${Object.keys(VERBS).join(", ")} (help for details)` };
  try {
    return run({ docs, flags }, rest);
  } catch (e) {
    if (e instanceof CommandError) return { ok: false, error: e.message };
    throw e;
  }
}
function splitLine(line) {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m2) => m2[1] ?? m2[2]);
}
function runBatch(docs, script, env) {
  let current = docs;
  const written = /* @__PURE__ */ new Map();
  const said = [];
  let ran = 0;
  const lines = script.split(/\r?\n/);
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n].trim();
    if (!line || line.startsWith("#")) continue;
    const argv = splitLine(line);
    if (env && !argv.includes("--env")) argv.push("--env", env);
    const result = runModelCommand(current, argv);
    if (!result.ok) return { ok: false, error: `Line ${n + 1} failed: ${line}
${result.error}
Nothing was written. Fix that line and run the whole batch again.` };
    for (const doc of result.writes) {
      written.set(doc.id, doc);
      current = current.some((d) => d.id === doc.id) ? current.map((d) => d.id === doc.id ? doc : d) : [...current, doc];
    }
    said.push(result.said);
    ran += 1;
  }
  if (!ran) return { ok: false, error: "The batch has no commands in it" };
  return { ok: true, said: said.join("\n"), writes: [...written.values()] };
}
var MODEL_HELP = `Sleipnir model commands \u2014 build 3D environments from the command line.
Sizes and positions are meters; a plane's up is its own (Top's up points away).

  list
  describe --env <env> [--part <part>] [--json]     what is there: parts, numbers, faces by name, sizes
  env create --name <name>
  sketch create --name <name>                     a Sketch document (draw in it with canvas.mjs, then place it)
  sketch --env <env> [--plane front|top|side|top+0.5|"Part: end"]
         [--shape frame|rect|ellipse|polygon|path] [--size w,h] [--at x,y] [--sides n]
         [--points "x,y x,y \u2026"] [--name <name>]  a sketch standing in the environment
  place --env <env> --sketch <Sketch doc> [--frame <frame>] [--on <plane or "Part: face">] [--width m]
  extrude --env <env> --sketch <sketch> [--depth m] [--direction normal|reverse|symmetric] [--part <name>]
  extrude --env <env> --part <part> --face end|side 2|\u2026 [--depth m]     new material out of one flat face
  revolve --env <env> --sketch <sketch> [--axis center|left|bottom] [--angle deg] [--part <name>]
  sweep   --env <env> --sketch <sketch> --path <sketch> [--part <name>]
  starter --env <env> --shape box|cylinder|sphere|cone|torus|polygon [--name <name>]
  feature --env <env> (--name "Extrude 1" | --part <part>) [--depth m] [--direction \u2026] [--axis \u2026] [--angle deg] [--steps n] [--op add|subtract|intersect]
  smoothness --env <env> --part <part> --level low|medium|high
  edit --env <env> --part <part> --face end|start|side [n]|"Extrude 2 end" (--pull m | --move x,y,z)
  move --env <env> --part <part> [--by x,y,z] [--turn x|y|z,deg] [--scale f|x,y,z] [--about x,y,z]
  unlink --env <env> --sketch <placed sketch>
  rename --env <env> (--part <part> | --sketch <sketch>) --to <name>
  resize --env <env> --sketch <sketch> --size w,h      kept centered where it stands
  delete --env <env> (--part <part> | --feature <feature> | --sketch <sketch>)

  batch [--env <env>] [--file <path>]   many commands, one per line, from a file or stdin; all or nothing
                                        (# comments; --env is the default for lines without one; end with describe)

Each command is one change; Sleipnir shows it live.`;

// src/modeling/commands/modelCli.ts
function readBoards(root) {
  const dir = path.join(root, CANVAS_DIR);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.flatMap((f) => {
    const doc = parseDoc(fs.readFileSync(path.join(dir, f), "utf8"));
    return doc && f === `${doc.id}.json` ? [doc] : [];
  });
}
function main(argv) {
  const { words, flags } = parseArgs(argv);
  if (!argv.length || argv[0] === "help" || flags.help) {
    console.log(MODEL_HELP);
    return 0;
  }
  const root = typeof flags.root === "string" ? flags.root : ".";
  const result = words[0] === "batch" ? runBatch(readBoards(root), fs.readFileSync(typeof flags.file === "string" ? flags.file : 0, "utf8"), typeof flags.env === "string" ? flags.env : void 0) : runModelCommand(readBoards(root), argv);
  if (!result.ok) {
    console.error(result.error);
    return 1;
  }
  for (const doc of result.writes) {
    const file = path.join(root, canvasDocPath(doc.id));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, serializeDoc(doc));
  }
  console.log(result.said);
  return 0;
}
process.exitCode = main(process.argv.slice(2));
