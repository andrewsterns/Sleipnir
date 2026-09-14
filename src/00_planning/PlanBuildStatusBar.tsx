import React from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface PlanBuildStatus {
  planId: string
  label: string
  /** Plan-step nodes created for this plan so far (draft + approved). */
  stepCount: number
  /** Of stepCount, how many are still status:'draft'. */
  draftCount: number
  /** Of draftCount, how many carry a staged proposedFile (see backend's proposeFileNode) — these are never bulk-approved by APPROVE ALL (see backend's approvePlanNodes), so draftCount - draftFileCount is what APPROVE ALL actually targets. The rest need individual REVIEW & APPROVE on their own card. */
  draftFileCount: number
  /** From tools/sleipnir-plan.mjs's --total-steps, when the authoring agent declared it. */
  expectedSteps?: number
  /** Deterministic (stepCount >= expectedSteps) when declared; a quiet-period guess otherwise, and also the fallback if a declared count is never reached — see PlanningView.ViewModel.tsx. */
  complete: boolean
  /** True when completion came from the quiet-period fallback despite a declared expectedSteps never being reached — the agent said N, delivered fewer, and stopped. Distinct from the normal "no count was ever declared" case. */
  stoppedShort: boolean
}

interface PlanBuildStatusBarProps {
  status: PlanBuildStatus
  onApproveAll: (planId: string) => void
}

let _kfInjected = false
function ensurePulseCSS() {
  if (_kfInjected || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-plan-build-kf', '')
  el.textContent = `@keyframes plan-build-indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`
  document.head.appendChild(el)
  _kfInjected = true
}
ensurePulseCSS()

// Live "the AI is building this plan" strip, docked under the graph — two
// states sharing one layout: a progress bar while steps are still arriving
// (real N-of-M when the CLI declared --total-steps, an indeterminate pulse
// otherwise, since an external process gives no other signal to go on), then
// a completion banner with a bulk APPROVE ALL once the build looks done —
// see PlanningView.ViewModel.tsx's planBuildStatus for how "done" is decided.
export const PlanBuildStatusBar: React.FC<PlanBuildStatusBarProps> = ({ status, onApproveAll }) => {
  const { planId, label, stepCount, draftCount, draftFileCount, expectedSteps, complete, stoppedShort } = status
  const determinate = typeof expectedSteps === 'number'
  const progress = determinate ? Math.min(1, stepCount / expectedSteps!) : null
  // Files always need an individual look-before-you-bake review (see
  // proposeFileNode/approvePlanNodes) — APPROVE ALL only ever bulk-approves
  // the rest, so the button's own count must exclude them or it overstates
  // what one click actually does.
  const bulkApprovableCount = draftCount - draftFileCount

  return (
    <Frame
      flow="horizontal"
      align="center"
      gap={12}
      padding={{ x: 14, y: 8 }}
      stroke={{ top: { color: 'var(--border-1)' } }}
      fill={{ solid: 'bg-1' }}
      shrink={0}
    >
      <Frame flow="vertical" gap={4} grow minW={0}>
        <span style={{ fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-3)', ...MONO }}>
          {complete
            ? stoppedShort
              ? `PLAN READY — ${stepCount} OF ${expectedSteps} DECLARED STEPS DRAFTED (STOPPED SHORT)`
              : `PLAN READY — ${stepCount} STEP${stepCount === 1 ? '' : 'S'} DRAFTED`
            : determinate
              ? `BUILDING "${label.toUpperCase()}" — ${stepCount} OF ${expectedSteps}`
              : `BUILDING "${label.toUpperCase()}" — ${stepCount} STEP${stepCount === 1 ? '' : 'S'} SO FAR…`}
        </span>
        {complete && draftFileCount > 0 && (
          <span style={{ fontSize: 9, letterSpacing: '0.04em', color: 'var(--text-3)', ...MONO }}>
            {draftFileCount} proposed file{draftFileCount === 1 ? '' : 's'} — review individually below, nothing writes automatically
          </span>
        )}
        {!complete && (
          <Frame w="fill" h={3} radius={2} fill={{ solid: 'bg-3' }} clipContent style={{ overflow: 'hidden' }}>
            {determinate ? (
              <div
                style={{
                  width: `${(progress ?? 0) * 100}%`,
                  height: '100%',
                  background: 'var(--text-1)',
                  transition: 'width 0.2s ease',
                }}
              />
            ) : (
              <div
                style={{
                  width: '25%',
                  height: '100%',
                  background: 'var(--text-1)',
                  animation: 'plan-build-indeterminate 1.1s ease-in-out infinite',
                }}
              />
            )}
          </Frame>
        )}
      </Frame>

      {complete && bulkApprovableCount > 0 && (
        <button
          onClick={() => onApproveAll(planId)}
          style={{
            background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
            border: '1px solid var(--border-2)',
            color: 'var(--text-1)',
            fontSize: 9,
            letterSpacing: '0.08em',
            padding: '6px 12px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            ...MONO,
          }}
        >
          APPROVE ALL ({bulkApprovableCount})
        </button>
      )}
    </Frame>
  )
}
