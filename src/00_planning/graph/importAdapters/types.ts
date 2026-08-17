import type { LanguageId, NodeRole } from '../architectures'
import type { PathAliasConfig } from './pathAliases'

export interface ImportSpecifier {
  /** The raw specifier text as written in source (e.g. './ShoppingCart.ViewModel'). */
  raw: string
  /** Character offset into `content` where the specifier text starts. */
  index: number
  length: number
}

// Pragmatic regex/line-based per-language adapters — not full AST parsers.
// Nothing in this codebase uses a real parser anywhere today (no Babel/
// tree-sitter/compiler-API), and the JS/TS logic this interface generalizes
// (see tsxAdapter.ts, extracted from NewWorkspacePlanModal.ViewModel.tsx) was
// already exactly this kind of regex — so this doesn't lower any existing
// bar, just makes the same approach reusable across languages/call sites.
export interface ImportAdapter {
  id: LanguageId
  /** Every import/require/dynamic-import specifier found in `content`, regardless of whether it resolves to anything. */
  detectImports(content: string): ImportSpecifier[]
  /** Resolves a raw specifier (as found by detectImports) against a pool of known workspace-relative file paths. `aliases` (tsconfig/jsconfig path mapping — see pathAliases.ts) is consulted for non-relative specifiers before giving up; adapters that don't use it (every non-JS language) simply ignore the param. Returns the matching path, or null if unresolvable (e.g. a genuine bare package import, or no match in the pool). */
  resolveSpecifier(fromPath: string, raw: string, candidatePaths: string[], aliases?: PathAliasConfig): string | null
  /** Inserts a real import statement for `toPath` into `content` — idempotent, a no-op if that exact statement is already present. `targetRole` picks which of the target's exports gets imported (see each adapter's own naming convention). */
  insertImport(content: string, fromPath: string, toPath: string, targetLabel: string, targetRole?: NodeRole): string
  /** The bare identifier `insertImport` makes available in scope (e.g. `useShoppingCartViewModel`) — what the `##token` editor extension inserts in place of the token itself once resolved. Takes `fromPath`/`toPath` too (unused by most adapters) because Go's answer genuinely depends on both: an unqualified name for a same-package target, `pkg.Name` for a cross-package one. */
  importedIdentifier(fromPath: string, toPath: string, targetLabel: string, targetRole?: NodeRole): string
  /** Removes whatever import statement(s) reference `toPath` from `content`. */
  removeImport(content: string, fromPath: string, toPath: string): string
}
