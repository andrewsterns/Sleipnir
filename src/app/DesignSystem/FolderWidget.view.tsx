import { forwardRef } from 'react'
import { FolderBrowserView } from './FolderBrowserView'
import { AutoPreview } from './AutoPreview'
import type { FolderBrowserHandle } from './iFolderBrowserView'
import type { FolderWidgetProps } from './iFolderWidget'

// Thin config wrapper around the unified FolderBrowserView for any
// `kind: 'folder'` widget (Docker today) — no create/archive support (that's
// Components-only), optional AutoPreview when the widget opts into it.
export const FolderWidgetView = forwardRef<FolderBrowserHandle, FolderWidgetProps>(function FolderWidgetView(
  { entry, onAddToPlan },
  ref,
) {
  // AutoPreview only applies to .tsx files (its import.meta.glob is scoped to
  // src/**/*.tsx) — a 'curated' strategy stays DSM-only and isn't wired here.
  const getPreview =
    entry.previewStrategy === 'auto'
      ? (name: string, path: string) => (path.endsWith('.tsx') ? <AutoPreview path={path} name={name} /> : undefined)
      : undefined

  return (
    <FolderBrowserView
      ref={ref}
      scope={entry.rootScope === 'src' ? 'src' : 'repo'}
      root={entry.root ?? ''}
      extraFiles={entry.extraFiles}
      readOnly={entry.readOnly}
      getPreview={getPreview}
      onAddToPlan={onAddToPlan}
    />
  )
})
