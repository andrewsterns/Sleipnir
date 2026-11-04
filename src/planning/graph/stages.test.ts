import { describe, it, expect } from 'vitest'
import { fileStageKey, nodeStageKey } from './stages'

describe('nodeStageKey', () => {
  it('keys a workspace-file (asset-plan) node by its file path, not its plan-scoped id', () => {
    const node = {
      id: 'workspace-asset/plan/link-test-123/src/app.tsx',
      type: 'workspace-file',
      filePath: 'src/app.tsx',
    }
    expect(nodeStageKey(node)).toBe('file:src/app.tsx')
    expect(nodeStageKey(node)).toBe(fileStageKey('src/app.tsx'))
  })

  it('keys the SAME file the same way across two different plans, so status is shared, not per-plan', () => {
    const inPlanA = { id: 'workspace-asset/plan-a/src/app.tsx', type: 'workspace-file', filePath: 'src/app.tsx' }
    const inPlanB = { id: 'workspace-asset/plan-b/src/app.tsx', type: 'workspace-file', filePath: 'src/app.tsx' }
    expect(nodeStageKey(inPlanA)).toBe(nodeStageKey(inPlanB))
  })

  it('falls back to the node\'s own id for every other node kind (scaffolded, note, AI plan-step)', () => {
    expect(nodeStageKey({ id: 'note/planning/foo-123', type: 'note', filePath: undefined })).toBe('note/planning/foo-123')
    expect(nodeStageKey({ id: 'plan/x/step-1', type: 'plan-step' })).toBe('plan/x/step-1')
    // Even a workspace-file-typed record with no filePath can't be keyed by
    // path — falls back to id rather than producing "file:undefined".
    expect(nodeStageKey({ id: 'workspace-asset/p/x', type: 'workspace-file', filePath: undefined })).toBe(
      'workspace-asset/p/x',
    )
  })
})
