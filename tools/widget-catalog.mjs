// Read-only source for the Widget Store's browsable catalog. Backed by a
// local JSON file today, but this is the ONLY place that reads it — swapping
// to a real hosted manifest later (fetch(catalogUrl) instead of
// fs.readFileSync) is a one-function change here, nothing downstream
// (tools/sleipnir-backend.mjs, PlatformAPI, the store UI) needs to know or
// change. That's the whole point of not statically importing the catalog
// into the compiled app: growing it to hundreds of entries is a data change,
// never a Sleipnir release.
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const CATALOG_PATH = path.join(REPO_ROOT, 'src/00_planning/graph/widget-catalog.json')

export function readCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) return []
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))
  } catch {
    return []
  }
}
