// Shared lazy handle on tools/sleipnir-backend.mjs for the agent's main-
// process modules — the same dynamic-import trick main.cjs's getBackend()
// uses (a file:// URL, required for absolute paths on Windows). Node caches
// the module by resolved URL, so this and main.cjs share one instance.
const path = require('node:path')
const { pathToFileURL } = require('node:url')

let backend
async function getBackend() {
  if (!backend) {
    const backendPath = path.join(__dirname, '..', '..', 'tools', 'sleipnir-backend.mjs')
    backend = await import(pathToFileURL(backendPath).href)
  }
  return backend
}

// The backend tracks ONE workspace root at a time. Setting it and calling a
// synchronous backend function with no await in between is what keeps two
// windows' concurrent agent calls on their own projects — same safety
// property as main.cjs's `ws()` wrapper. `fn` must therefore be synchronous;
// anything async (git) goes through runWithRoot in git-control.mjs instead.
async function withRoot(root, fn) {
  const b = await getBackend()
  b.setWorkspaceRoot(root)
  return fn(b)
}

module.exports = { getBackend, withRoot }
