import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../UIKit/Frame/Frame'
import { Card } from '../UIKit/Card/Card'
import { ScrollWindow } from '../UIKit/ScrollWindow/ScrollWindow'
import { useCommandPaletteViewModel, type PaletteResultItem } from './CommandPalette.ViewModel'
import type { CommandPaletteProps } from './iCommandPalette'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Ctrl+P/Cmd+P quick-open (ROADMAP.md's Phase 1) — a fuzzy file switcher over
// the open Workspace's files. Mounted once at the App shell level alongside
// TerminalDock/AgentDock/ProblemsDock — fully self-contained, no App-level
// open/close coordination needed (no mutual exclusion with the docks).
export const CommandPalette: React.FC<CommandPaletteProps> = ({ onJumpToFile }) => {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Same theme-ancestor portal pattern as OpenFolderModal.tsx — document.body
  // sits outside every theme scope, so this component's CSS custom
  // properties would resolve to nothing there.
  useLayoutEffect(() => {
    let node: HTMLElement | null = anchorRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
  }, [])

  const close = () => setOpen(false)
  const { query, setQuery, mode, workspaceOpen, results, loading, truncated, error, selectedIndex, setSelectedIndex, select, onKeyDown } =
    useCommandPaletteViewModel(open, onJumpToFile, close)

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const pathOf = (item: PaletteResultItem): string => (item.kind === 'file' ? item.file.path : item.path)
  const keyOf = (item: PaletteResultItem, i: number): string =>
    item.kind === 'file' ? `file:${item.file.path}` : `match:${item.path}:${item.match.line}:${item.match.column}:${i}`

  return (
    <Frame
      ref={anchorRef}
      style={{ display: 'contents' }}
      onHotkey={[
        { key: 'p', modifiers: ['ctrl'], scope: 'global', handler: () => setOpen(true) },
        { key: 'p', modifiers: ['meta'], scope: 'global', handler: () => setOpen(true) },
      ]}
    >
      {open && portalTarget &&
        ReactDOM.createPortal(
          <Frame fixed inset z={300} flow="vertical" align="center" justify="start" padding={{ top: 120 }}>
            <div
              aria-hidden="true"
              onClick={close}
              style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
            />
            <Card
              flow="vertical"
              gap={0}
              padding={0}
              relative
              w={560}
              maxH="60vh"
              clipContent
            >
              <Frame
                flow="horizontal"
                align="center"
                gap={8}
                shrink={0}
                stroke={{ bottom: { color: 'var(--border-2)' } }}
              >
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Go to file… (> to search inside files)"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-1)',
                    fontSize: 14,
                    padding: '14px 16px',
                    outline: 'none',
                    ...MONO,
                  }}
                />
                {workspaceOpen && (
                  <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-3)', paddingRight: 14, flexShrink: 0, ...MONO }}>
                    WORKSPACE
                  </span>
                )}
              </Frame>
              <ScrollWindow axis="y" flow="vertical" gap={0} minH={0} grow>
                {error && (
                  <span style={{ fontSize: 11, color: '#e07a7a', padding: '12px 16px', display: 'block', ...MONO }}>
                    {error}
                  </span>
                )}
                {!error && loading && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', padding: '12px 16px', display: 'block', ...MONO }}>
                    Loading…
                  </span>
                )}
                {!error && !loading && !workspaceOpen && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', padding: '12px 16px', display: 'block', ...MONO }}>
                    Choose a Workspace folder to search.
                  </span>
                )}
                {!error && !loading && workspaceOpen && results.length === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', padding: '12px 16px', display: 'block', ...MONO }}>
                    No matches
                  </span>
                )}
                {results.map((item, i) => {
                  const showGroupHeader = mode === 'search' && (i === 0 || pathOf(results[i - 1]) !== pathOf(item))
                  return (
                    <React.Fragment key={keyOf(item, i)}>
                      {showGroupHeader && (
                        <span
                          style={{
                            fontSize: 11,
                            letterSpacing: '0.06em',
                            color: 'var(--text-3)',
                            padding: '10px 16px 4px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'block',
                            ...MONO,
                          }}
                        >
                          {pathOf(item)}
                        </span>
                      )}
                      <Frame
                        as="button"
                        onClick={() => select(item)}
                        onMouseEnter={() => setSelectedIndex(i)}
                        title={item.kind === 'match' ? item.match.lineText.trim() : undefined}
                        flow="horizontal"
                        align="center"
                        minH={32}
                        w="fill"
                        variant="none"
                        hoverFill="bg-3"
                        fill={i === selectedIndex ? { solid: 'bg-2' } : undefined}
                        radius={0}
                        padding={{ x: 16, y: 6 }}
                        cursor="pointer"
                        textColor="var(--text-2)"
                        style={{
                          textAlign: 'left',
                          fontSize: 12,
                          letterSpacing: '0.02em',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          ...MONO,
                        }}
                      >
                        {item.kind === 'file' ? (
                          item.file.path
                        ) : (
                          <>
                            <span style={{ color: 'var(--text-3)', marginRight: 10, flexShrink: 0 }}>{item.match.line}</span>
                            {item.match.lineText.trim()}
                          </>
                        )}
                      </Frame>
                    </React.Fragment>
                  )
                })}
                {truncated && (
                  <span style={{ fontSize: 10, color: 'var(--text-3)', padding: '12px 16px', display: 'block', ...MONO }}>
                    Showing partial results — refine your search for more.
                  </span>
                )}
              </ScrollWindow>
            </Card>
          </Frame>,
          portalTarget,
        )}
    </Frame>
  )
}
