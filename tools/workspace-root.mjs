// The current "open folder" workspace root — independent of REPO_ROOT/SRC_ROOT
// (tools/sleipnir-backend.mjs), which stay permanently pinned to Sleipnir's
// own repo for the Planning graph/Component-library/Prototype-library/
// Refactor-engine pipeline. This is a *second*, user-chosen root for the
// general "edit any project" Workspace feature — see sleipnir-backend.mjs's
// openWorkspace/getWorkspaceInfo/listWorkspaceDir/etc.
let currentRoot = null

export function getWorkspaceRoot() {
  return currentRoot
}

export function setWorkspaceRoot(absolutePath) {
  currentRoot = absolutePath
}
