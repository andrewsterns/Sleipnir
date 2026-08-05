// Exposes window.electronAPI to the renderer — the exact PlatformAPI shape
// (see src/00_planning/api/PlatformAPI.ts), just routed through IPC instead
// of fetch(). contextIsolation stays on; nothing but these typed calls
// crosses the bridge.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  scaffoldComponent: (name, tier, language, parts, libraryId) =>
    ipcRenderer.invoke('sleipnir:scaffoldComponent', name, tier, language, parts, libraryId),
  regenerateGraph: () => ipcRenderer.invoke('sleipnir:regenerateGraph'),
  createLibrary: (input) => ipcRenderer.invoke('sleipnir:createLibrary', input),
  listLibraries: (kind) => ipcRenderer.invoke('sleipnir:listLibraries', kind),
  removeLibrary: (id) => ipcRenderer.invoke('sleipnir:removeLibrary', id),
  deleteLibrary: (id) => ipcRenderer.invoke('sleipnir:deleteLibrary', id),
  listWidgets: () => ipcRenderer.invoke('sleipnir:listWidgets'),
  installWidget: (input) => ipcRenderer.invoke('sleipnir:installWidget', input),
  getWidgetCatalog: () => ipcRenderer.invoke('sleipnir:getWidgetCatalog'),
  readFile: (filePath) => ipcRenderer.invoke('sleipnir:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('sleipnir:writeFile', filePath, content),
  listDir: (dirPath) => ipcRenderer.invoke('sleipnir:listDir', dirPath),
  listRepoDir: (dirPath, extraFiles) => ipcRenderer.invoke('sleipnir:listRepoDir', dirPath, extraFiles),
  readRepoFile: (filePath) => ipcRenderer.invoke('sleipnir:readRepoFile', filePath),
  writeRepoFile: (filePath, content) => ipcRenderer.invoke('sleipnir:writeRepoFile', filePath, content),
  createFile: (filePath, content) => ipcRenderer.invoke('sleipnir:createFile', filePath, content),
  createDir: (dirPath) => ipcRenderer.invoke('sleipnir:createDir', dirPath),
  getWorkspaceInfo: () => ipcRenderer.invoke('sleipnir:getWorkspaceInfo'),
  listWorkspaceDir: (dirPath) => ipcRenderer.invoke('sleipnir:listWorkspaceDir', dirPath),
  readWorkspaceFile: (filePath) => ipcRenderer.invoke('sleipnir:readWorkspaceFile', filePath),
  writeWorkspaceFile: (filePath, content) => ipcRenderer.invoke('sleipnir:writeWorkspaceFile', filePath, content),
  createWorkspaceFile: (filePath, content) => ipcRenderer.invoke('sleipnir:createWorkspaceFile', filePath, content),
  createWorkspaceDir: (dirPath) => ipcRenderer.invoke('sleipnir:createWorkspaceDir', dirPath),
  searchRepo: (query, opts) => ipcRenderer.invoke('sleipnir:searchRepo', query, opts),
  searchWorkspace: (query, opts) => ipcRenderer.invoke('sleipnir:searchWorkspace', query, opts),
  listRepoTree: () => ipcRenderer.invoke('sleipnir:listRepoTree'),
  importPath: (sourceAbsolutePath, destRepoRelativeDir) => ipcRenderer.invoke('sleipnir:importPath', sourceAbsolutePath, destRepoRelativeDir),
  detectPreviewConfig: (folderPath) => ipcRenderer.invoke('sleipnir:detectPreviewConfig', folderPath),
  getPreviewConfig: (folderPath) => ipcRenderer.invoke('sleipnir:getPreviewConfig', folderPath),
  setPreviewConfig: (folderPath, config) => ipcRenderer.invoke('sleipnir:setPreviewConfig', folderPath, config),
  getArchivedPaths: () => ipcRenderer.invoke('sleipnir:getArchivedPaths'),
  setArchived: (filePath, archived, label) => ipcRenderer.invoke('sleipnir:setArchived', filePath, archived, label),
  getNotes: () => ipcRenderer.invoke('sleipnir:getNotes'),
  addNote: (map, label, description) => ipcRenderer.invoke('sleipnir:addNote', map, label, description),
  createPlanNode: (planId, label, description, parentId) =>
    ipcRenderer.invoke('sleipnir:createPlanNode', planId, label, description, parentId),
  setNodeStatus: (id, status) => ipcRenderer.invoke('sleipnir:setNodeStatus', id, status),
  openFileNode: (filePath, label) => ipcRenderer.invoke('sleipnir:openFileNode', filePath, label),
  getPlans: () => ipcRenderer.invoke('sleipnir:getPlans'),
  createPlan: (label, nodeIds) => ipcRenderer.invoke('sleipnir:createPlan', label, nodeIds),
  deletePlan: (id) => ipcRenderer.invoke('sleipnir:deletePlan', id),
  runScript: (filePath) => ipcRenderer.invoke('sleipnir:runScript', filePath),
  previewRefactor: (architecture, libraryId) => ipcRenderer.invoke('sleipnir:previewRefactor', architecture, libraryId),
  applyRefactor: (architecture, libraryId) => ipcRenderer.invoke('sleipnir:applyRefactor', architecture, libraryId),
  getCurrentArchitecture: (libraryId) => ipcRenderer.invoke('sleipnir:getCurrentArchitecture', libraryId),
  getGitStatus: () => ipcRenderer.invoke('sleipnir:getGitStatus'),
  getGitDiff: (filePath, staged) => ipcRenderer.invoke('sleipnir:getGitDiff', filePath, staged),
  stageFiles: (paths) => ipcRenderer.invoke('sleipnir:stageFiles', paths),
  unstageFiles: (paths) => ipcRenderer.invoke('sleipnir:unstageFiles', paths),
  commitChanges: (message) => ipcRenderer.invoke('sleipnir:commitChanges', message),
  getBranches: () => ipcRenderer.invoke('sleipnir:getBranches'),
  getBranchTree: () => ipcRenderer.invoke('sleipnir:getBranchTree'),
  checkoutBranch: (name) => ipcRenderer.invoke('sleipnir:checkoutBranch', name),
  createBranch: (name) => ipcRenderer.invoke('sleipnir:createBranch', name),
  gitPush: () => ipcRenderer.invoke('sleipnir:gitPush'),
  gitPull: () => ipcRenderer.invoke('sleipnir:gitPull'),
  gitFetch: () => ipcRenderer.invoke('sleipnir:gitFetch'),
  getGitIdentity: () => ipcRenderer.invoke('sleipnir:getGitIdentity'),
  setGitIdentity: (name, email) => ipcRenderer.invoke('sleipnir:setGitIdentity', name, email),

  // Native pickers — Electron-only, no web transport equivalent (see
  // electron/main.cjs's handlers for why the relative-path math happens
  // there, not here). Feature-detected by the File menu at call time.
  openFileDialog: () => ipcRenderer.invoke('sleipnir:openFileDialog'),
  openFolderDialog: () => ipcRenderer.invoke('sleipnir:openFolderDialog'),
  importDialog: () => ipcRenderer.invoke('sleipnir:importDialog'),
  openWorkspace: () => ipcRenderer.invoke('sleipnir:openWorkspace'),
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

// Prototype live preview bridge — same shape as terminalAPI (fire-and-forget
// start/stop, push-event status filtered by id). No web equivalent (see
// electron/preview.cjs). The folder's own repo-relative path is the id, not
// a server-generated one — start() needs no invoke/response round-trip.
contextBridge.exposeInMainWorld('previewAPI', {
  start: (folderPath, config) => ipcRenderer.send('preview:start', folderPath, config),
  stop: (folderPath) => ipcRenderer.send('preview:stop', folderPath),
  onStatus: (folderPath, callback) => {
    const listener = (_e, id, status) => { if (id === folderPath) callback(status) }
    ipcRenderer.on('preview:status', listener)
    return () => ipcRenderer.removeListener('preview:status', listener)
  },
})

// Streaming AI chat bridge — same shape as terminalAPI above (invoke to kick
// off a request, send for fire-and-forget cancel, on-based push listeners
// filtered by session id). No web equivalent (see electron/chat.cjs).
contextBridge.exposeInMainWorld('chatAPI', {
  sendMessage: (sessionId, history, message) => ipcRenderer.invoke('chat:sendMessage', sessionId, history, message),
  cancel: (sessionId) => ipcRenderer.send('chat:cancel', sessionId),
  onToken: (sessionId, callback) => {
    const listener = (_e, id, delta) => { if (id === sessionId) callback(delta) }
    ipcRenderer.on('chat:token', listener)
    return () => ipcRenderer.removeListener('chat:token', listener)
  },
  onPlanNodeCreated: (sessionId, callback) => {
    const listener = (_e, id, node) => { if (id === sessionId) callback(node) }
    ipcRenderer.on('chat:planNodeCreated', listener)
    return () => ipcRenderer.removeListener('chat:planNodeCreated', listener)
  },
  onLibraryCreated: (sessionId, callback) => {
    const listener = (_e, id, library) => { if (id === sessionId) callback(library) }
    ipcRenderer.on('chat:libraryCreated', listener)
    return () => ipcRenderer.removeListener('chat:libraryCreated', listener)
  },
  onCodeGenerated: (sessionId, callback) => {
    const listener = (_e, id, payload) => { if (id === sessionId) callback(payload) }
    ipcRenderer.on('chat:codeGenerated', listener)
    return () => ipcRenderer.removeListener('chat:codeGenerated', listener)
  },
  onDone: (sessionId, callback) => {
    const listener = (_e, id, fullText) => { if (id === sessionId) callback(fullText) }
    ipcRenderer.on('chat:done', listener)
    return () => ipcRenderer.removeListener('chat:done', listener)
  },
  onError: (sessionId, callback) => {
    const listener = (_e, id, message) => { if (id === sessionId) callback(message) }
    ipcRenderer.on('chat:error', listener)
    return () => ipcRenderer.removeListener('chat:error', listener)
  },
})

// BYOK settings — request/response, like electronAPI. Never exposes the raw
// key back to the renderer once saved (see electron/apiKeyStore.cjs).
contextBridge.exposeInMainWorld('settingsAPI', {
  getKeyStatus: (provider) => ipcRenderer.invoke('settings:getKeyStatus', provider),
  setKey: (provider, key) => ipcRenderer.invoke('settings:setKey', provider, key),
  clearKey: (provider) => ipcRenderer.invoke('settings:clearKey', provider),
  getModel: () => ipcRenderer.invoke('settings:getModel'),
  setModel: (model) => ipcRenderer.invoke('settings:setModel', model),
})
