#!/usr/bin/env node
// Copies the PLANDOC region of tools/planDoc.mjs into the vendored project CLI
// (tools/agentSkills/vendor/plan.mjs), byte for byte. The vendored CLI may only
// use node: builtins, so it can't import planDoc.mjs — it carries this copy
// instead, and src/00_planning/api/vendoredPlanCli.test.ts fails when they
// differ. Run after editing planDoc.mjs:
//
//   node tools/syncPlanDoc.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SOURCE_PATH = path.join(here, 'planDoc.mjs')
export const VENDOR_PATH = path.join(here, 'agentSkills', 'vendor', 'plan.mjs')

const BEGIN = '// --- BEGIN PLANDOC ---'
const END = '// --- END PLANDOC ---'

/** The marked region (markers included), with line endings normalized to \n. */
export function extractPlanDocRegion(text) {
  const normalized = text.replace(/\r\n/g, '\n')
  const start = normalized.indexOf(BEGIN)
  const end = normalized.indexOf(END)
  if (start < 0 || end < start) throw new Error('PLANDOC markers not found')
  return normalized.slice(start, end + END.length)
}

export function syncVendoredPlanDoc() {
  const region = extractPlanDocRegion(fs.readFileSync(SOURCE_PATH, 'utf8'))
  const vendor = fs.readFileSync(VENDOR_PATH, 'utf8').replace(/\r\n/g, '\n')
  const next = vendor.replace(extractPlanDocRegion(vendor), () => region)
  if (next !== vendor) fs.writeFileSync(VENDOR_PATH, next)
  return { changed: next !== vendor }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { changed } = syncVendoredPlanDoc()
  process.stdout.write(changed ? 'vendor/plan.mjs updated from planDoc.mjs\n' : 'vendor/plan.mjs already in sync\n')
}
