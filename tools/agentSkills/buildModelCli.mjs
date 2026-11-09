// Builds tools/agentSkills/vendor/model.mjs — the agent's model commands
// (src/modeling/commands/) bundled with the app's own model code into one
// Node file, so `.sleipnir/model.mjs` in a project needs no install and can
// never disagree with the app. Run after changing anything it bundles:
//
//   npm run build:model-cli
//
// Committed like the other vendored CLIs; scaffold.mjs copies it into projects.

import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

await build({
  entryPoints: [path.join(root, 'src/modeling/commands/modelCli.ts')],
  outfile: path.join(here, 'vendor/model.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  legalComments: 'none',
  banner: {
    js: [
      '// Sleipnir model commands — standalone, generated. Do not edit:',
      '// built from src/modeling/commands/ by tools/agentSkills/buildModelCli.mjs and',
      '// copied into each project as `.sleipnir/model.mjs`. Node only, no install.',
      '//   node .sleipnir/model.mjs help',
    ].join('\n'),
  },
  logLevel: 'warning',
})
console.log('built tools/agentSkills/vendor/model.mjs')
