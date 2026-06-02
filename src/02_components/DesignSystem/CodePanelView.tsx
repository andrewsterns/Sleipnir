import React, { useState, useCallback, useMemo } from 'react'
import { Frame } from '../01_atoms/Frame/Frame'
import { Text } from '../01_atoms/Text/Text'
import { componentsList } from './DesignLibrary.ViewModel'

// ─── Tokenizer ───────────────────────────────────────────────────────────────

type TK =
  | 'comment' | 'string' | 'number' | 'keyword'
  | 'component' | 'tag'
  | 'prop' | 'operator'
  | 'brace' | 'bracket' | 'angle'
  | 'plain'

interface Token {
  kind: TK
  text: string
  component?: string  // only for 'component' tokens that are in our library
}

const KEYWORDS = new Set([
  'true', 'false', 'null', 'undefined',
  'return', 'import', 'export', 'from',
  'const', 'let', 'var', 'type', 'interface',
  'function', 'async', 'await', 'if', 'else',
])

const KNOWN_COMPONENTS = new Set(componentsList.map(c => c.name))

function tokenize(code: string): Token[] {
  const result: Token[] = []
  let i = 0

  while (i < code.length) {
    // ── Line comment ─────────────────────────────────────────────────────────
    if (code[i] === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i)
      const text = nl === -1 ? code.slice(i) : code.slice(i, nl)
      result.push({ kind: 'comment', text })
      i += text.length
      continue
    }

    // ── Block comment ─────────────────────────────────────────────────────────
    if (code[i] === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      const text = end === -1 ? code.slice(i) : code.slice(i, end + 2)
      result.push({ kind: 'comment', text })
      i += text.length
      continue
    }

    // ── Double-quoted string ──────────────────────────────────────────────────
    if (code[i] === '"') {
      let j = i + 1
      while (j < code.length && code[j] !== '"') {
        if (code[j] === '\\') j++
        j++
      }
      result.push({ kind: 'string', text: code.slice(i, j + 1) })
      i = j + 1
      continue
    }

    // ── Single-quoted string ──────────────────────────────────────────────────
    if (code[i] === "'") {
      let j = i + 1
      while (j < code.length && code[j] !== "'") {
        if (code[j] === '\\') j++
        j++
      }
      result.push({ kind: 'string', text: code.slice(i, j + 1) })
      i = j + 1
      continue
    }

    // ── Template literal ──────────────────────────────────────────────────────
    if (code[i] === '`') {
      let j = i + 1
      while (j < code.length && code[j] !== '`') {
        if (code[j] === '\\') j++
        j++
      }
      result.push({ kind: 'string', text: code.slice(i, j + 1) })
      i = j + 1
      continue
    }

    // ── Self-closing tag /> ───────────────────────────────────────────────────
    if (code[i] === '/' && code[i + 1] === '>') {
      result.push({ kind: 'angle', text: '/>' })
      i += 2
      continue
    }

    // ── Closing tag </ ───────────────────────────────────────────────────────
    if (code[i] === '<' && code[i + 1] === '/') {
      result.push({ kind: 'angle', text: '</' })
      i += 2
      const m = code.slice(i).match(/^([A-Za-z][a-zA-Z0-9]*)/)
      if (m) {
        const name = m[1]
        const isComp = /^[A-Z]/.test(name)
        result.push({
          kind: isComp ? 'component' : 'tag',
          text: name,
          component: (isComp && KNOWN_COMPONENTS.has(name)) ? name : undefined,
        })
        i += name.length
      }
      continue
    }

    // ── Opening tag < ─────────────────────────────────────────────────────────
    if (code[i] === '<') {
      const ahead = code.slice(i + 1)
      const m = ahead.match(/^([A-Za-z][a-zA-Z0-9]*)/)
      if (m) {
        result.push({ kind: 'angle', text: '<' })
        i++
        const name = m[1]
        const isComp = /^[A-Z]/.test(name)
        result.push({
          kind: isComp ? 'component' : 'tag',
          text: name,
          component: (isComp && KNOWN_COMPONENTS.has(name)) ? name : undefined,
        })
        i += name.length
        continue
      }
      result.push({ kind: 'angle', text: '<' })
      i++
      continue
    }

    // ── > ────────────────────────────────────────────────────────────────────
    if (code[i] === '>') {
      result.push({ kind: 'angle', text: '>' })
      i++
      continue
    }

    // ── Braces / brackets ─────────────────────────────────────────────────────
    if ('{}' .includes(code[i])) { result.push({ kind: 'brace',   text: code[i] }); i++; continue }
    if ('[]()'.includes(code[i])) { result.push({ kind: 'bracket', text: code[i] }); i++; continue }

    // ── Number ────────────────────────────────────────────────────────────────
    if (/\d/.test(code[i]) && (i === 0 || /[^a-zA-Z0-9_$]/.test(code[i - 1]))) {
      const m = code.slice(i).match(/^\d+(?:\.\d+)?/)
      if (m) { result.push({ kind: 'number', text: m[0] }); i += m[0].length; continue }
    }

    // ── Identifier (keyword / prop / plain) ───────────────────────────────────
    if (/[a-zA-Z_$]/.test(code[i])) {
      const m = code.slice(i).match(/^([a-zA-Z_$][a-zA-Z0-9_$-]*)/)
      if (m) {
        const word = m[1]
        result.push({ kind: KEYWORDS.has(word) ? 'keyword' : 'plain', text: word })
        i += word.length
        continue
      }
    }

    // ── Operator = ────────────────────────────────────────────────────────────
    if (code[i] === '=') { result.push({ kind: 'operator', text: '=' }); i++; continue }
    if (code[i] === ':') { result.push({ kind: 'operator', text: ':' }); i++; continue }
    if (code[i] === ',') { result.push({ kind: 'operator', text: ',' }); i++; continue }

    // ── Fallthrough ───────────────────────────────────────────────────────────
    result.push({ kind: 'plain', text: code[i] })
    i++
  }

  // ── Second pass: plain identifiers before = are prop names ───────────────
  for (let j = 0; j < result.length; j++) {
    if (result[j].kind === 'plain' && result[j + 1]?.kind === 'operator' && result[j + 1]?.text === '=') {
      result[j].kind = 'prop'
    }
  }

  return result
}

// ─── Token styles ────────────────────────────────────────────────────────────
// One Dark-ish palette mapped onto our CSS token system

const TOKEN_COLOR: Record<TK, string> = {
  comment:  'var(--text-3)',
  string:   'var(--warning-4)',
  number:   'var(--danger-3)',
  keyword:  'var(--accent-3)',
  component:'var(--accent-2)',
  tag:      'var(--info-3)',
  prop:     'var(--info-4)',
  operator: 'var(--text-3)',
  brace:    'var(--text-2)',
  bracket:  'var(--text-2)',
  angle:    'var(--text-3)',
  plain:    'var(--text-1)',
}

const TOKEN_STYLE: Partial<Record<TK, React.CSSProperties>> = {
  comment: { fontStyle: 'italic' },
  component: { fontWeight: 600 },
}

// ─── CodePanel ───────────────────────────────────────────────────────────────

interface Props {
  code: string
  onSelectComponent: (component: string) => void
  onHoverComponent: (component: string | null) => void
}

export const CodePanel: React.FC<Props> = ({ code, onSelectComponent, onHoverComponent }) => {
  const [hovered, setHovered] = useState<{ name: string; x: number; y: number } | null>(null)

  const tokens = useMemo(() => tokenize(code), [code])

  const handleEnter = useCallback(
    (name: string, e: React.MouseEvent) => {
      setHovered({ name, x: e.clientX, y: e.clientY })
      onHoverComponent(name)
    },
    [onHoverComponent],
  )

  const handleMove = useCallback((e: React.MouseEvent) => {
    setHovered(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
  }, [])

  const handleLeave = useCallback(() => {
    setHovered(null)
    onHoverComponent(null)
  }, [onHoverComponent])

  const handleClick = useCallback(
    (name: string) => onSelectComponent(name),
    [onSelectComponent],
  )

  const hoveredMeta = hovered ? componentsList.find(c => c.name === hovered.name) : null

  return (
    <>
      <pre
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'var(--font-code, "Sometype Mono", "Space Mono", monospace)',
          fontSize: 12.5,
          lineHeight: 1.75,
          background: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          tabSize: 2,
        }}
      >
        {tokens.map((token, idx) => {
          // Interactive component token
          if (token.component && KNOWN_COMPONENTS.has(token.component)) {
            const isCurrentlyHovered = hovered?.name === token.component
            return (
              <span
                key={idx}
                onMouseEnter={e => handleEnter(token.component!, e)}
                onMouseMove={handleMove}
                onMouseLeave={handleLeave}
                onClick={() => handleClick(token.component!)}
                style={{
                  color: TOKEN_COLOR.component,
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: 2,
                  padding: '0 1px',
                  background: isCurrentlyHovered ? 'var(--accent-7)' : 'transparent',
                  outline: isCurrentlyHovered ? '1px solid var(--accent-5)' : 'none',
                  transition: 'background 80ms, outline 80ms',
                }}
              >
                {token.text}
              </span>
            )
          }

          // All other tokens
          return (
            <span
              key={idx}
              style={{
                color: TOKEN_COLOR[token.kind],
                ...TOKEN_STYLE[token.kind],
              }}
            >
              {token.text}
            </span>
          )
        })}
      </pre>

      {/* ── Hover tooltip (fixed to viewport, follows cursor) ── */}
      {hovered && hoveredMeta && (
        <Frame
          fixed
          x={hovered.x + 16}
          y={hovered.y - 12}
          z={9000}
          flow="vertical"
          gap={6}
          padding={{ x: 12, y: 10 }}
          fill={{ solid: 'bg-3' }}
          stroke={{ color: 'border-2' }}
          radius="var(--radius-2)"
          pointerEvents="none"
          effects={{
            'drop-shadow': { y: 6, blur: 20, color: 'rgba(0,0,0,0.45)' },
          }}
        >
          <Text variant="small" weight="bold" color="text-0">
            &lt;{hovered.name}/&gt;
          </Text>
          <Text variant="xs" color="text-3" transform="uppercase" tracking="widest">
            {hoveredMeta.type}
          </Text>
          <Frame flow="horizontal" align="center" gap={4} padding={{ top: 4 }} stroke={{ top: { color: 'border-1' } }}>
            <Text variant="xs" color="accent" tracking="wide">
              click to jump →
            </Text>
          </Frame>
        </Frame>
      )}
    </>
  )
}
