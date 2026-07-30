// Per-language scaffold definitions. TypeScript is the only one using the
// full MVVM (View/ViewModel/interface) triplet + <Frame> base — that's this
// app's own TSX design-system idiom, not a general convention, so other
// languages get a single minimal file instead of trying to force-fit them
// into View/ViewModel/atoms-molecules-organisms.
export const LANGUAGES = {
  typescript: { id: 'typescript', label: 'TypeScript', ext: 'tsx', templateDir: 'mvvm', mvvm: true },
  python: { id: 'python', label: 'Python', ext: 'py', templateDir: 'python', mvvm: false },
  rust: { id: 'rust', label: 'Rust', ext: 'rs', templateDir: 'rust', mvvm: false },
  go: { id: 'go', label: 'Go', ext: 'go', templateDir: 'go', mvvm: false },
}

export const DEFAULT_LANGUAGE = 'typescript'
