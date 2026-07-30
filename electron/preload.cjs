// Exposes window.electronAPI to the renderer — the exact PlatformAPI shape
// (see src/00_planning/api/PlatformAPI.ts), just routed through IPC instead
// of fetch(). contextIsolation stays on; nothing but these typed calls
// crosses the bridge.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  scaffoldComponent: (name, tier, language, parts) => ipcRenderer.invoke('sleipnir:scaffoldComponent', name, tier, language, parts),
  regenerateGraph: () => ipcRenderer.invoke('sleipnir:regenerateGraph'),
  readFile: (filePath) => ipcRenderer.invoke('sleipnir:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('sleipnir:writeFile', filePath, content),
  listDir: (dirPath) => ipcRenderer.invoke('sleipnir:listDir', dirPath),
  createFile: (filePath, content) => ipcRenderer.invoke('sleipnir:createFile', filePath, content),
  createDir: (dirPath) => ipcRenderer.invoke('sleipnir:createDir', dirPath),
  getArchivedPaths: () => ipcRenderer.invoke('sleipnir:getArchivedPaths'),
  setArchived: (filePath, archived, label) => ipcRenderer.invoke('sleipnir:setArchived', filePath, archived, label),
  getNotes: () => ipcRenderer.invoke('sleipnir:getNotes'),
  addNote: (map, label, description) => ipcRenderer.invoke('sleipnir:addNote', map, label, description),
  runScript: (filePath) => ipcRenderer.invoke('sleipnir:runScript', filePath),
  previewRefactor: (architecture) => ipcRenderer.invoke('sleipnir:previewRefactor', architecture),
  applyRefactor: (architecture) => ipcRenderer.invoke('sleipnir:applyRefactor', architecture),
  getCurrentArchitecture: () => ipcRenderer.invoke('sleipnir:getCurrentArchitecture'),
})

// Separate bridge — a streaming/event-based API, not request/response like
// electronAPI above. No web equivalent exists (see electron/terminal.cjs).
contextBridge.exposeInMainWorld('terminalAPI', {
  spawn: (cols, rows) => ipcRenderer.invoke('terminal:spawn', cols, rows),
  write: (id, data) => ipcRenderer.send('terminal:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('terminal:kill', id),
  onData: (id, callback) => {
    const listener = (_e, dataId, chunk) => { if (dataId === id) callback(chunk) }
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  onExit: (id, callback) => {
    const listener = (_e, exitId, code) => { if (exitId === id) callback(code) }
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  },
})
