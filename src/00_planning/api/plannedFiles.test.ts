// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as backend from '../../../tools/sleipnir-backend.mjs'

// Backend-only behavior of planned files after they're declared: moving one
// before approval, and keeping steps that carry them out of bulk approval.
describe('planned files in the backend', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sleipnir-planned-'))
    backend.setWorkspaceRoot(root)
  })

  afterEach(() => {
    backend.setWorkspaceRoot(null)
    rmSync(root, { recursive: true, force: true })
  })

  const notes = () => JSON.parse(readFileSync(join(root, '.planning', 'notes.json'), 'utf8'))
  const plans = () => JSON.parse(readFileSync(join(root, '.planning', 'plans.json'), 'utf8'))

  const createPlanWithFiles = () => {
    const { plan } = backend.createPlan('Cart', [], undefined, undefined, undefined, false, 2)
    const { node: step, planned } = backend.createPlanNode(plan.id, 'Build cart', 'UI', undefined, {
      files: ['src/cart/cartView.tsx:view', 'src/cart/cartViewModel.tsx:view-model'],
    })
    backend.createPlanNode(plan.id, 'Write docs', 'No files', undefined)
    return { plan, step, planned }
  }

  it('moves a planned file, re-keying its id, edges, plan membership and plan.md', () => {
    const { planned } = createPlanWithFiles()
    const vm = planned.find((p: { role: string }) => p.role === 'view-model')

    const { node } = backend.updatePlannedFilePath(vm.id, 'src/features/cart/cartViewModel.tsx')

    expect(node.id).toMatch(/\/src\/features\/cart\/cartViewModel\.tsx$/)
    expect(node.filePath).toBe('src/features/cart/cartViewModel.tsx')
    const data = notes()
    expect(data.nodes.some((n: { id: string }) => n.id === vm.id)).toBe(false)
    expect(data.edges.some((e: { source: string; target: string }) => e.source === vm.id || e.target === vm.id)).toBe(false)
    expect(data.edges).toContainEqual(expect.objectContaining({ target: node.id, kind: 'borrows' }))
    expect(plans()[0].nodeIds).toContain(node.id)
    expect(plans()[0].nodeIds).not.toContain(vm.id)
    // docPath is recorded on the plan once its first step is written.
    expect(readFileSync(join(root, plans()[0].docPath), 'utf8')).toContain('src/features/cart/cartViewModel.tsx')
    // Still a placeholder — nothing written.
    expect(existsSync(join(root, 'src'))).toBe(false)
  })

  it('refuses to move a planned file onto .planning, an existing file, or outside the project', () => {
    const { planned } = createPlanWithFiles()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'taken.tsx'), '')
    expect(() => backend.updatePlannedFilePath(planned[0].id, '.planning/x.tsx')).toThrow(/never \.planning/)
    expect(() => backend.updatePlannedFilePath(planned[0].id, 'src/taken.tsx')).toThrow(/already exists/)
    expect(() => backend.updatePlannedFilePath(planned[0].id, '../x.tsx')).toThrow(/escapes allowed root/i)
    expect(() => backend.updatePlannedFilePath('plan/nope', 'src/y.tsx')).toThrow(/No planned file/)
  })

  it('leaves steps with planned files out of bulk approval', () => {
    const { plan, step } = createPlanWithFiles()
    const { approvedIds, needsReviewIds } = backend.approvePlanNodes(plan.id)
    expect(needsReviewIds).toEqual([step.id])
    expect(approvedIds).toHaveLength(1)
  })

  it('does not report a planned file as a missing path', async () => {
    createPlanWithFiles()
    const { missing } = await backend.checkPlanningPaths()
    expect(missing).toEqual([])
  })
})
