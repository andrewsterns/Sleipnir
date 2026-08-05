// Local storage for the last-opened Workspace folder, so relaunching the app
// reopens the same project — same shape as modelStore.cjs, unencrypted (a
// folder path isn't a secret).
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

function storePath() {
  return path.join(app.getPath('userData'), 'workspace.json')
}

function getLastWorkspacePath() {
  const p = storePath()
  if (!fs.existsSync(p)) return null
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'))
    return typeof data.lastWorkspacePath === 'string' ? data.lastWorkspacePath : null
  } catch {
    return null
  }
}

function setLastWorkspacePath(absolutePath) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify({ lastWorkspacePath: absolutePath }, null, 2))
}

module.exports = { getLastWorkspacePath, setLastWorkspacePath }
