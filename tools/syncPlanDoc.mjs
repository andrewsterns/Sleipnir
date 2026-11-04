#!/usr/bin/env node
// Copies the PLANDOC region of tools/planDoc.mjs, and the LANGUAGES region of the
// language table (tools/agentSkills/vendor/languages.mjs) it reads, into the
// vendored project CLI (tools/agentSkills/vendor/plan.mjs), byte for byte. The
// vendored CLI may only use node: builtins, so it can't import either — it
// carries these copies instead, and src/platform/vendoredPlanCli.test.ts
// fails when they differ. Run after editing either source:
//
//   node tools/syncPlanDoc.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SOURCE_PATH = path.join(here, 'planDoc.mjs')
export const LANGUAGES_PATH = path.join(here, 'agentSkills', 'vendor', 'languages.mjs')
export const VENDOR_PATH = path.join(here, 'agentSkills', 'vendor', 'plan.mjs')

/** A marked region (markers included), with line endings normalized to \n. */
export function extractRegion(text, name) {
  const begin = `// --- BEGIN ${name} ---`
  const end = `// --- END ${name} ---`
  const normalized = text.replace(/\r\n/g, '\n')
  const start = normalized.indexOf(begin)
  const stop = normalized.indexOf(end)
  if (start < 0 || stop < start) throw new Error(`${name} markers not found`)
  return normalized.slice(start, stop + end.length)
}

export const extractPlanDocRegion = (text) => extractRegion(text, 'PLANDOC')
export const extractLanguagesRegion = (text) => extractRegion(text, 'LANGUAGES')

export function syncVendoredPlanDoc() {
  const vendor = fs.readFileSync(VENDOR_PATH, 'utf8').replace(/\r\n/g, '\n')
  let next = vendor
  for (const [name, source] of [['PLANDOC', SOURCE_PATH], ['LANGUAGES', LANGUAGES_PATH]]) {
    const region = extractRegion(fs.readFileSync(source, 'utf8'), name)
    next = next.replace(extractRegion(next, name), () => region)
  }
  if (next !== vendor) fs.writeFileSync(VENDOR_PATH, next)
  return { changed: next !== vendor }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { changed } = syncVendoredPlanDoc()
  process.stdout.write(changed ? 'vendor/plan.mjs updated from planDoc.mjs\n' : 'vendor/plan.mjs already in sync\n')
}
