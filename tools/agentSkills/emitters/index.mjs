// One translator per target agent. Each takes the canonical skills from
// ../registry.mjs and returns the files that agent reads, as
// { path, content, managed } — `managed` meaning "merge into a delimited block
// in a file the human also owns" rather than "Sleipnir owns this file outright".
//
// Every emitter is a pure function: skills in, strings out, no filesystem. That
// keeps them trivially unit-testable, which matters most for the TOML one, where
// a quoting mistake produces a file Gemini silently refuses to load.

import { ARGS_TOKEN, PLAN_CLI } from '../registry.mjs'

// Each target's own placeholder for "the text the user typed after the command".
const CLAUDE_ARGS = '$ARGUMENTS'
const CODEX_ARGS = '$ARGUMENTS'
const GEMINI_ARGS = '{{args}}'

function withArgs(command, placeholder) {
  return command.split(ARGS_TOKEN).join(placeholder)
}

// YAML frontmatter values: quote and escape so a description containing a colon
// or a quote can't break the parse.
function yamlValue(value) {
  return JSON.stringify(value)
}

function frontmatter(fields) {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${yamlValue(v)}`)
  return `---\n${lines.join('\n')}\n---\n`
}

// ---------------------------------------------------------------------------
// AGENTS.md — the cross-agent standard, read natively by Codex, Cursor, Copilot,
// Windsurf, Zed, Aider, Jules and others. Carries the real content, because most
// agents that read it have no import mechanism to follow a pointer with.
// ---------------------------------------------------------------------------

export function emitAgentsMd(skills) {
  const sections = skills.map((s) => `## ${titleFor(s)}\n\n${s.context}`)
  return [{ path: 'AGENTS.md', content: sections.join('\n\n'), managed: true }]
}

function titleFor(skill) {
  return skill.id === 'plan' ? 'Planning with Sleipnir' : `Sleipnir: ${skill.id}`
}

// ---------------------------------------------------------------------------
// Claude Code — reads CLAUDE.md and not AGENTS.md, so the officially documented
// bridge is an `@AGENTS.md` import. It must sit as bare text: Claude Code skips
// imports inside code spans and fences.
// ---------------------------------------------------------------------------

export function emitClaude(skills) {
  const files = [
    {
      path: 'CLAUDE.md',
      managed: true,
      content: `@AGENTS.md\n\nThe import above carries this project's Sleipnir planning instructions.\nRun \`/plan <what to plan>\` to draft one into the Planning graph.`,
    },
  ]
  for (const skill of skills) {
    files.push({
      path: `.claude/commands/${skill.id}.md`,
      managed: false,
      content:
        frontmatter({ description: skill.description, 'argument-hint': skill.argumentHint }) +
        '\n' +
        withArgs(skill.command, CLAUDE_ARGS) +
        '\n',
    })
  }
  return files
}

// ---------------------------------------------------------------------------
// Codex CLI — already reads AGENTS.md natively, so it needs no context file of
// its own, only the explicit slash command.
// ---------------------------------------------------------------------------

export function emitCodex(skills) {
  return skills.map((skill) => ({
    path: `.codex/prompts/${skill.id}.md`,
    managed: false,
    content:
      frontmatter({ description: skill.description, 'argument-hint': skill.argumentHint }) +
      '\n' +
      withArgs(skill.command, CODEX_ARGS) +
      '\n',
  }))
}

// ---------------------------------------------------------------------------
// Gemini CLI — GEMINI.md for context, and TOML (not Markdown) for commands.
// ---------------------------------------------------------------------------

// A TOML multi-line *literal* string: no escape processing at all. Required
// here, because the command text contains backslash line-continuations, and in a
// basic ("""...""") string TOML would read a trailing backslash as a
// line-ending escape and silently swallow the newline and indentation after it.
function tomlLiteral(value) {
  if (value.includes("'''")) {
    throw new Error("Cannot emit TOML literal string: value contains \"'''\"")
  }
  // A literal string cannot end with a quote directly before the delimiter, and
  // a leading newline immediately after the opening delimiter is trimmed by
  // spec — so open on its own line and keep the close on its own line.
  return `'''\n${value}\n'''`
}

function tomlBasic(value) {
  return JSON.stringify(value)
}

export function emitGemini(skills) {
  const files = [
    {
      path: 'GEMINI.md',
      managed: true,
      content: `## Planning with Sleipnir\n\nRead \`AGENTS.md\` at the project root before planning or writing code here — it\ndocuments this project's \`.planning/\` graph and the \`node ${PLAN_CLI}\` CLI that\nwrites to it correctly.\n\nRun \`/plan <what to plan>\` to draft a plan into the graph.`,
    },
  ]
  for (const skill of skills) {
    files.push({
      path: `.gemini/commands/${skill.id}.toml`,
      managed: false,
      content:
        `description = ${tomlBasic(skill.description)}\n` +
        `prompt = ${tomlLiteral(withArgs(skill.command, GEMINI_ARGS))}\n`,
    })
  }
  return files
}

// ---------------------------------------------------------------------------

export const EMITTERS = [emitAgentsMd, emitClaude, emitCodex, emitGemini]

// Every file the scaffolder writes, for a given set of skills. Order is stable so
// scaffold.json's hash map and any diff of it read the same way run to run.
export function emitAll(skills) {
  return EMITTERS.flatMap((emit) => emit(skills))
}
