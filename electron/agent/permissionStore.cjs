// "Always allow in this project" rules — same local-JSON-in-userData shape as
// modelStore.cjs. Deliberately NOT stored in the project folder: what one
// person lets their agent do unasked is their call, and must not arrive for
// everyone else through a `git pull`.
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

function storePath() {
  return path.join(app.getPath('userData'), 'agent-permissions.json')
}

// Keyed by the real path so the same folder opened via a junction, a symlink
// or different drive-letter casing still finds its rules.
function projectKey(root) {
  if (!root) return null
  try {
    return fs.realpathSync(root)
  } catch {
    return path.resolve(root)
  }
}

function readStore() {
  try {
    const data = JSON.parse(fs.readFileSync(storePath(), 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2))
}

function getRules(root) {
  const key = projectKey(root)
  if (!key) return new Set()
  const list = readStore()[key]
  return new Set(Array.isArray(list) ? list : [])
}

function addRule(root, ruleKey) {
  const key = projectKey(root)
  if (!key || !ruleKey) return
  const data = readStore()
  const list = new Set(Array.isArray(data[key]) ? data[key] : [])
  list.add(ruleKey)
  data[key] = [...list].sort()
  writeStore(data)
}

function removeRule(root, ruleKey) {
  const key = projectKey(root)
  if (!key) return
  const data = readStore()
  if (!Array.isArray(data[key])) return
  data[key] = data[key].filter((r) => r !== ruleKey)
  if (!data[key].length) delete data[key]
  writeStore(data)
}

module.exports = { getRules, addRule, removeRule }
