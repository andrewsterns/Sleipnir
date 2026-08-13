// Exposes window.electronAPI to the renderer — the exact PlatformAPI shape
// (see src/00_planning/api/PlatformAPI.ts), just routed through IPC instead
// of fetch(). contextIsolation stays on; nothing but these typed calls
// crosses the bridge.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  regenerateGraph: () => ipcRenderer.invoke('sleipnir:regenerateGraph'),
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
  deleteWorkspacePath: (filePath) => ipcRenderer.invoke('sleipnir:deleteWorkspacePath', filePath),
  renameWorkspacePath: (fromPath, toPath) => ipcRenderer.invoke('sleipnir:renameWorkspacePath', fromPath, toPath),
  copyWorkspacePath: (fromPath, toPath) => ipcRenderer.invoke('sleipnir:copyWorkspacePath', fromPath, toPath),
  searchWorkspace: (query, opts) => ipcRenderer.invoke('sleipnir:searchWorkspace', query, opts),
  detectPreviewConfig: (folderPath) => ipcRenderer.invoke('sleipnir:detectPreviewConfig', folderPath),
  getPreviewConfig: (folderPath) => ipcRenderer.invoke('sleipnir:getPreviewConfig', folderPath),
  setPreviewConfig: (folderPath, config) => ipcRenderer.invoke('sleipnir:setPreviewConfig', folderPath, config),
  getArchivedPaths: () => ipcRenderer.invoke('sleipnir:getArchivedPaths'),
  setArchived: (filePath, archived, label) => ipcRenderer.invoke('sleipnir:setArchived', filePath, archived, label),
  getNotes: () => ipcRenderer.invoke('sleipnir:getNotes'),
  addNote: (map, label, description) => ipcRenderer.invoke('sleipnir:addNote', map, label, description),
  scaffoldNodes: (map, entries, links) => ipcRenderer.invoke('sleipnir:scaffoldNodes', map, entries, links),
  createPlanNode: (planId, label, description, parentId) =>
    ipcRenderer.invoke('sleipnir:createPlanNode', planId, label, description, parentId),
  setNodeStatus: (id, status) => ipcRenderer.invoke('sleipnir:setNodeStatus', id, status),
  setNodeBorrows: (nodeId, targetIds) => ipcRenderer.invoke('sleipnir:setNodeBorrows', nodeId, targetIds),
  updateNote: (id, patch) => ipcRenderer.invoke('sleipnir:updateNote', id, patch),
  deleteNote: (id) => ipcRenderer.invoke('sleipnir:deleteNote', id),
  getNodeStages: () => ipcRenderer.invoke('sleipnir:getNodeStages'),
  setNodeStage: (id, stage) => ipcRenderer.invoke('sleipnir:setNodeStage', id, stage),
  getPlans: () => ipcRenderer.invoke('sleipnir:getPlans'),
  createPlan: (label, nodeIds, assetPaths, assetEdges) => ipcRenderer.invoke('sleipnir:createPlan', label, nodeIds, assetPaths, assetEdges),
  appendPlanGeneratedFiles: (id, paths) => ipcRenderer.invoke('sleipnir:appendPlanGeneratedFiles', id, paths),
  addPlanNodes: (id, nodeIds) => ipcRenderer.invoke('sleipnir:addPlanNodes', id, nodeIds),
  deletePlan: (id, opts) => ipcRenderer.invoke('sleipnir:deletePlan', id, opts),
  runScript: (filePath) => ipcRenderer.invoke('sleipnir:runScript', filePath),
  getGitStatus: () => ipcRenderer.invoke('sleipnir:getGitStatus'),
  getGitDiff: (filePath, staged) => ipcRenderer.invoke('sleipnir:getGitDiff', filePath, staged),
  stageFiles: (paths) => ipcRenderer.invoke('sleipnir:stageFiles', paths),
  unstageFiles: (paths) => ipcRenderer.invoke('sleipnir:unstageFiles', paths),
  discardFiles: (paths) => ipcRenderer.invoke('sleipnir:discardFiles', paths),
  commitChanges: (message) => ipcRenderer.invoke('sleipnir:commitChanges', message),
  getBranches: () => ipcRenderer.invoke('sleipnir:getBranches'),
  getBranchTree: () => ipcRenderer.invoke('sleipnir:getBranchTree'),
  getCommitGraph: () => ipcRenderer.invoke('sleipnir:getCommitGraph'),
  getCommitFileMap: () => ipcRenderer.invoke('sleipnir:getCommitFileMap'),
  checkoutBranch: (name) => ipcRenderer.invoke('sleipnir:checkoutBranch', name),
  createBranch: (name) => ipcRenderer.invoke('sleipnir:createBranch', name),
  renameBranch: (oldName, newName) => ipcRenderer.invoke('sleipnir:renameBranch', oldName, newName),
  gitPush: () => ipcRenderer.invoke('sleipnir:gitPush'),
  gitPull: () => ipcRenderer.invoke('sleipnir:gitPull'),
  gitFetch: () => ipcRenderer.invoke('sleipnir:gitFetch'),
  getGitIdentity: () => ipcRenderer.invoke('sleipnir:getGitIdentity'),
  setGitIdentity: (name, email) => ipcRenderer.invoke('sleipnir:setGitIdentity', name, email),

  // Native folder picker — Electron-only, no web transport equivalent.
  openWorkspace: () => ipcRenderer.invoke('sleipnir:openWorkspace'),
  saveScratchToFolder: () => ipcRenderer.invoke('sleipnir:saveScratchToFolder'),
  // Project switching — also Electron-only (see openWorkspace above).
  getRecentProjects: () => ipcRenderer.invoke('sleipnir:getRecentProjects'),
  openRecentProject: (projectPath) => ipcRenderer.invoke('sleipnir:openRecentProject', projectPath),
  newWindow: () => ipcRenderer.invoke('sleipnir:newWindow'),
  renameProject: (projectPath, name) => ipcRenderer.invoke('sleipnir:renameProject', projectPath, name),
  // Recolors this window's native (OS-drawn) minimize/maximize/close overlay to
  // match the active theme — fire-and-forget, Windows-only (no-op elsewhere).
  setTitleBarTheme: (colors) => ipcRenderer.send('sleipnir:setTitleBarTheme', colors),
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
