// A tsconfig for the staging tier, so editors type-check staged components
// with the project's own settings.
//
// `.canvas` sits outside every project tsconfig on purpose (see paths.ts's
// DEFAULT_COMPONENT_ROOT) — staged experiments must not break the build. But
// an editor still has to type-check a file you open, and with no config that
// claims it, VS Code's TypeScript server falls back to an "inferred project"
// with none of the project's options: no `jsx` setting, no path aliases, no
// `lib`. Every staged component then opens covered in errors that are not
// really there. type-aware ESLint (typescript-eslint's projectService) hits
// the same wall.
//
// A tsconfig inside `.canvas` fixes both: the TS server always takes the
// nearest one, so staged files get the project's real options, while the
// build never sees it — nothing references it, and a root `include` glob
// skips dot-folders. Written only when missing, so a human can edit or delete
// it and have that stick.

import { stripJsonComments } from '../../00_planning/graph/importAdapters/pathAliases'
import { createWorkspaceFile, readWorkspaceFile } from '../../00_planning/api/sleipnirApi'
import { DEFAULT_COMPONENT_ROOT, normalizeRelPath } from './paths'

export const STAGING_TSCONFIG = `${DEFAULT_COMPONENT_ROOT}/tsconfig.json`

interface RawTsconfig {
  compilerOptions?: { jsx?: unknown }
  references?: unknown
}

async function readConfig(path: string, readFile: (path: string) => Promise<string>): Promise<RawTsconfig | null> {
  try {
    const parsed: unknown = JSON.parse(stripJsonComments(await readFile(path)))
    return parsed && typeof parsed === 'object' ? (parsed as RawTsconfig) : null
  } catch {
    return null
  }
}

/**
 * Which of the project's configs staged components should inherit from, or
 * null for a project with no tsconfig at all.
 *
 * The root tsconfig.json is often only a solution file — `files: []` plus
 * references to an app and a node config (Vite's template, and this repo). The
 * staged files are UI code, so the referenced config that sets `jsx` is the
 * one that describes them; failing that, the root itself.
 */
export async function pickBaseTsconfig(readFile: (path: string) => Promise<string>): Promise<string | null> {
  const root = await readConfig('tsconfig.json', readFile)
  if (!root) return null
  if (root.compilerOptions?.jsx !== undefined || !Array.isArray(root.references)) return 'tsconfig.json'

  for (const ref of root.references as unknown[]) {
    const refPath = ref && typeof ref === 'object' ? (ref as { path?: unknown }).path : undefined
    if (typeof refPath !== 'string') continue
    const normalized = normalizeRelPath(refPath)
    const configPath = normalized.endsWith('.json') ? normalized : `${normalized}/tsconfig.json`
    const config = await readConfig(configPath, readFile)
    if (config?.compilerOptions?.jsx !== undefined) return configPath
  }
  return 'tsconfig.json'
}

/**
 * Ambient type files a bundler template ships, which give `import x from
 * './a.png'` its type. The project's own config includes them through its
 * `src` glob; the staging config's glob is `.canvas`, so they have to be named.
 */
const AMBIENT_TYPE_FILES = ['src/vite-env.d.ts', 'vite-env.d.ts', 'next-env.d.ts']

export async function findAmbientTypeFiles(readFile: (path: string) => Promise<string>): Promise<string[]> {
  const found: string[] = []
  for (const path of AMBIENT_TYPE_FILES) {
    try {
      await readFile(path)
      found.push(path)
    } catch {
      // Not this template.
    }
  }
  return found
}

/** The file's text. Standalone defaults for a project with no tsconfig, so a staged `.tsx` still opens clean. */
export function renderStagingTsconfig(base: string | null, ambient: string[] = []): string {
  const header = [
    '// Written by Sleipnir so your editor type-checks staged canvas components',
    "// with this project's settings. Nothing builds from it; edit or delete it",
    '// freely — it is only written when missing.',
  ]
  const body = base
    ? {
        extends: `../${base}`,
        compilerOptions: { noEmit: true },
        include: ['**/*', ...ambient.map((p) => `../${p}`)],
      }
    : {
        compilerOptions: {
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['**/*', ...ambient.map((p) => `../${p}`)],
      }
  return `${header.join('\n')}\n${JSON.stringify(body, null, 2)}\n`
}

/** Writes `.canvas/tsconfig.json` if it isn't there. Never throws, never overwrites. */
export async function ensureStagingTsconfig(): Promise<boolean> {
  const read = async (path: string) => (await readWorkspaceFile(path)).content
  try {
    await readWorkspaceFile(STAGING_TSCONFIG)
    return false
  } catch {
    // Missing — write it.
  }
  try {
    await createWorkspaceFile(
      STAGING_TSCONFIG,
      renderStagingTsconfig(await pickBaseTsconfig(read), await findAmbientTypeFiles(read)),
    )
    return true
  } catch {
    return false
  }
}
