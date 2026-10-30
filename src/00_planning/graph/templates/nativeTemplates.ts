// Scaffold templates for the C family and the typed object languages (Java,
// Kotlin, Swift, C#) — the same minimal one-declaration-per-role shape as the
// templates in index.ts, in each language's own idiom. Declared symbols are
// `<Pascal><Role>` (typeExportName), like Rust, Python and Go.
//
// C and C++ split a role into a header and a source. The header is the role's
// contract — what its siblings include — and the source includes it and holds
// the bodies. An Interface has no body to hold: it is a header alone.

import type { NodeRole } from '../architectures'
import { toPascalCase, toSnakeCase, typeExportName } from '../naming'

export type NativeLanguage = 'c' | 'cpp' | 'java' | 'kotlin' | 'swift' | 'csharp'

export const NATIVE_LANGUAGES: NativeLanguage[] = ['c', 'cpp', 'java', 'kotlin', 'swift', 'csharp']

/** Whether a role in this language is scaffolded as a header plus a source. */
export function hasCompanionHeader(language: string, role: NodeRole): boolean {
  return (language === 'c' || language === 'cpp') && role !== 'interface'
}

interface NativeContext {
  role: NodeRole
  label: string
  /** The header's own file name, for the source's #include and the include guard. */
  headerFile: string
  /** The file's folder, when known — Java/Kotlin packages and C# namespaces come from it. */
  folder?: string
  header: boolean
}

export function renderNative(language: NativeLanguage, ctx: NativeContext): string {
  switch (language) {
    case 'c':
      return ctx.header ? cHeader(ctx) : cSource(ctx)
    case 'cpp':
      return ctx.header ? cppHeader(ctx) : cppSource(ctx)
    case 'java':
      return javaFile(ctx)
    case 'kotlin':
      return kotlinFile(ctx)
    case 'swift':
      return swiftFile(ctx)
    case 'csharp':
      return csharpFile(ctx)
  }
}

// ── C ──────────────────────────────────────────────────────────────────────

const guardOf = (headerFile: string) => headerFile.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()
// The function prefix for a role: cart_view_model_init.
const cPrefix = (role: NodeRole, label: string) => toSnakeCase(typeExportName(role, label))

function cHeader({ role, label, headerFile }: NativeContext): string {
  const sym = typeExportName(role, label)
  const guard = guardOf(headerFile)
  const body =
    role === 'interface'
      ? // A C interface: a table of operations a type fills in.
        `typedef struct ${sym} {\n    void (*update)(void *self);\n} ${sym};\n`
      : `typedef struct ${sym} {\n    int placeholder;\n} ${sym};\n\nvoid ${cPrefix(role, label)}_init(${sym} *self);\n`
  return `#ifndef ${guard}\n#define ${guard}\n\n${body}\n#endif /* ${guard} */\n`
}

function cSource({ role, label, headerFile }: NativeContext): string {
  const sym = typeExportName(role, label)
  return `#include "${headerFile}"\n\nvoid ${cPrefix(role, label)}_init(${sym} *self) {\n    self->placeholder = 0;\n}\n`
}

// ── C++ ────────────────────────────────────────────────────────────────────

function cppHeader({ role, label }: NativeContext): string {
  const sym = typeExportName(role, label)
  const body =
    role === 'interface'
      ? `class ${sym} {\npublic:\n    virtual ~${sym}() = default;\n    virtual void update() = 0;\n};\n`
      : `class ${sym} {\npublic:\n    void update();\n};\n`
  return `#pragma once\n\n${body}`
}

function cppSource({ role, label, headerFile }: NativeContext): string {
  return `#include "${headerFile}"\n\nvoid ${typeExportName(role, label)}::update() {\n}\n`
}

// ── JVM ────────────────────────────────────────────────────────────────────

// The package a file's folder implies under a Maven/Gradle source root
// (src/main/java/com/shop/cart → com.shop.cart); none outside one.
function jvmPackage(folder: string | undefined, root: 'java' | 'kotlin'): string | null {
  if (!folder) return null
  const dirs = folder.split('/').filter(Boolean)
  const at = dirs.lastIndexOf(root)
  if (at < 0 || at === dirs.length - 1) return null
  return dirs.slice(at + 1).join('.')
}

function javaFile({ role, label, folder }: NativeContext): string {
  const sym = typeExportName(role, label)
  const pkg = jvmPackage(folder, 'java')
  const decl = role === 'interface' ? `public interface ${sym} {\n}\n` : `public class ${sym} {\n}\n`
  return `${pkg ? `package ${pkg};\n\n` : ''}${decl}`
}

function kotlinFile({ role, label, folder }: NativeContext): string {
  const sym = typeExportName(role, label)
  const pkg = jvmPackage(folder, 'kotlin')
  const decl = role === 'interface' ? `interface ${sym}\n` : `class ${sym}\n`
  return `${pkg ? `package ${pkg}\n\n` : ''}${decl}`
}

// ── Swift ──────────────────────────────────────────────────────────────────

function swiftFile({ role, label }: NativeContext): string {
  const sym = typeExportName(role, label)
  switch (role) {
    case 'interface':
      return `protocol ${sym} {\n}\n`
    case 'view-model':
      // A reference type: views observe it.
      return `final class ${sym} {\n}\n`
    default:
      return `struct ${sym} {\n}\n`
  }
}

// ── C# ─────────────────────────────────────────────────────────────────────

function csharpFile({ role, label, folder }: NativeContext): string {
  const sym = typeExportName(role, label)
  const last = folder?.split('/').filter(Boolean).pop()
  const ns = last ? toPascalCase(last) : null
  const decl = role === 'interface' ? `public interface ${sym}\n{\n}\n` : `public class ${sym}\n{\n}\n`
  return `${ns ? `namespace ${ns};\n\n` : ''}${decl}`
}
