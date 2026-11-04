// What a diff is about, without its syntax colors: kept apart from
// diffHighlight so DiffView can decide what to show on first render while the
// highlighter (and CodeMirror with it) loads only once a diff is opened.

/** The file a unified diff is about: its `+++ b/` path, else the `diff --git` one. */
export function diffPath(diff: string): string | null {
  return diff.match(/^\+\+\+ b\/(.+)$/m)?.[1] ?? diff.match(/^diff --git a\/.+ b\/(.+)$/m)?.[1] ?? null
}

// Lockfiles and generated output: long, machine-written, rarely worth reading
// line by line. Their diffs start collapsed.
const COLLAPSED = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|go\.sum|poetry\.lock|Pipfile\.lock|uv\.lock|Gemfile\.lock|composer\.lock|Package\.resolved|packages\.lock\.json|gradle\.lockfile)$|(^|\/)(dist|build|out|target)\//

export function collapsedByDefault(filePath: string | null): boolean {
  return !!filePath && COLLAPSED.test(filePath)
}
