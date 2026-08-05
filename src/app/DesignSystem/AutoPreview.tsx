import React from 'react'
import { Text } from '../UIKit/Text/Text'

// Every .tsx file in the repo, lazily. Lets the preview pane render a
// component that has no hand-authored entry in componentPreviewMap — the
// map only needs to cover components whose default (prop-less) render
// isn't representative enough to be worth curating.
const modules = import.meta.glob('/src/**/*.tsx')

// forwardRef/memo-wrapped components are objects (with a $$typeof marker),
// not plain functions — a bare `typeof === 'function'` check rejects them.
function isRenderable(value: unknown): value is React.ComponentType {
  if (typeof value === 'function') return true
  return typeof value === 'object' && value !== null && '$$typeof' in value
}

// The graph label for a "verbose" MVVM file (Counter.view.tsx, Header.view.tsx)
// keeps its `.view`/`.viewModel`/`.interface` suffix so it stays distinct from
// its siblings in search/tree UI — but the file's actual export is the bare
// name (`Counter`, not `Counter.view`). Strip it as a fallback lookup key so
// this naming convention doesn't read as "no preview available".
const SUFFIX_RE = /\.(view|viewModel|interface)$/i
function resolveExport(mod: Record<string, unknown>, name: string): unknown {
  if (isRenderable(mod[name])) return mod[name]
  const stripped = name.replace(SUFFIX_RE, '')
  if (stripped !== name && isRenderable(mod[stripped])) return mod[stripped]
  return mod.default
}

class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) {
      return (
        <Text variant="small" color="text-2" mono>
          Preview unavailable — this component needs props or context this pane can't supply.
        </Text>
      )
    }
    return this.props.children
  }
}

// Reset the boundary whenever the previewed component changes, otherwise a
// prior failure stays latched and blocks the next (possibly fine) component.
export const AutoPreview: React.FC<{ path: string; name: string }> = ({ path, name }) => {
  const [Comp, setComp] = React.useState<React.ComponentType | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    setComp(null)
    setFailed(false)
    const loader = modules[`/src/${path}`]
    if (!loader) {
      setFailed(true)
      return
    }
    let cancelled = false
    loader()
      .then((mod: any) => {
        if (cancelled) return
        const found = resolveExport(mod, name)
        if (isRenderable(found)) setComp(() => found as React.ComponentType)
        else setFailed(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [path, name])

  if (failed) {
    return (
      <Text variant="small" color="text-2" mono>
        No preview available
      </Text>
    )
  }
  if (!Comp) {
    return (
      <Text variant="small" color="text-2" mono>
        Loading preview…
      </Text>
    )
  }

  return (
    <PreviewErrorBoundary key={`${path}:${name}`}>
      <div
        className="theme-tactical"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 8,
          background: 'var(--bg-1)',
          padding: 16,
          width: '100%',
          minHeight: 80,
        }}
      >
        <Comp />
      </div>
    </PreviewErrorBoundary>
  )
}
