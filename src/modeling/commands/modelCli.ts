// The command line around modelCommands.ts: reads the project's boards from
// `.components/.boards/`, runs one command, writes what it changed. Bundled
// with the app's own model code into tools/agentSkills/vendor/model.mjs
// (tools/agentSkills/buildModelCli.mjs), which Sleipnir copies into each
// project as `.sleipnir/model.mjs` — Node and nothing else.
//
//   node .sleipnir/model.mjs <command> --root . [flags]     (help lists them)

import fs from 'node:fs'
import path from 'node:path'
import type { CanvasDoc } from '../../document/types'
import { CANVAS_DIR, canvasDocPath, parseDoc, serializeDoc } from '../../canvas/io/docFormat'
import { MODEL_HELP, parseArgs, runBatch, runModelCommand } from './modelCommands'

function readBoards(root: string): CanvasDoc[] {
  const dir = path.join(root, CANVAS_DIR)
  let files: string[] = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  return files.flatMap((f) => {
    const doc = parseDoc(fs.readFileSync(path.join(dir, f), 'utf8'))
    // A board is found by the id inside it; the file is named after that id.
    return doc && f === `${doc.id}.json` ? [doc] : []
  })
}

function main(argv: string[]): number {
  const { words, flags } = parseArgs(argv)
  if (!argv.length || argv[0] === 'help' || flags.help) {
    console.log(MODEL_HELP)
    return 0
  }
  const root = typeof flags.root === 'string' ? flags.root : '.'
  const result =
    words[0] === 'batch'
      ? runBatch(readBoards(root), fs.readFileSync(typeof flags.file === 'string' ? flags.file : 0, 'utf8'), typeof flags.env === 'string' ? flags.env : undefined)
      : runModelCommand(readBoards(root), argv)
  if (!result.ok) {
    console.error(result.error)
    return 1
  }
  for (const doc of result.writes) {
    const file = path.join(root, canvasDocPath(doc.id))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, serializeDoc(doc))
  }
  console.log(result.said)
  return 0
}

process.exitCode = main(process.argv.slice(2))
