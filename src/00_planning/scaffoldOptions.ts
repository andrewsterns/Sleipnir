import type { ScaffoldLanguage } from './graph/types'

// Kept in sync with tools/languages.mjs's LANGUAGES. Shared by PlanningView's
// "+" NewComponentForm and CreateLibraryModal so both pickers stay identical.
export const SCAFFOLD_LANGUAGES: { id: ScaffoldLanguage; label: string }[] = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
]
