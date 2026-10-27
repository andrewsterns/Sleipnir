import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootTask, previewBoot, startBoot } from './boot'
import { preloadViews } from './app/lazyViews'
import { getWorkspaceScan } from './00_planning/graph/workspaceScanCache'

// /loader (or #/loader in the packaged app, which loads from file://) never
// mounts the app, so index.html's boot screen stays up and loops forever —
// a preview page for the loader.
const isLoaderPreview = /^\/loader\/?$/.test(location.pathname) || location.hash === '#/loader'

if (isLoaderPreview) {
  previewBoot()
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  // Work the boot screen covers. Warming every view's chunk makes the first
  // switch to it instant; the workspace scan (every source file's imports) is
  // the slowest first-time action in Planning, and it's cached, so starting it
  // now makes the architecture view and asset plans open immediately.
  bootTask(preloadViews())
  bootTask(getWorkspaceScan(), { optional: true })
  startBoot()
}
