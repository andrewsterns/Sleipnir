// Shared by the title bar's Run control and the Run dock's header.
import { CUSTOM_TARGET_ID, type Runner } from './useRunner'
import type { RunPhase, RunTarget } from './iRun'

/** One status colour per phase. */
export function phaseColor(phase: RunPhase): string {
  switch (phase) {
    case 'installing':
    case 'starting':
      return '#e0a040'
    case 'running':
    case 'ready':
      return '#7ec98f'
    case 'error':
      return '#e07a7a'
    default:
      return 'var(--text-3)'
  }
}

export function targetLabel(target: RunTarget | null, run: Runner): string {
  if (run.selectedId === CUSTOM_TARGET_ID) return run.custom || 'Custom command…'
  if (!target) return run.scanning ? 'Scanning…' : 'Nothing to run'
  return target.dir ? `${target.dir}/ ${target.label}` : target.label
}
