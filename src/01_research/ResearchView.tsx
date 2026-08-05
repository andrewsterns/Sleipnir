import React from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { ScrollWindow } from '../app/UIKit/ScrollWindow/ScrollWindow'
import { Search } from '../app/UIKit/Search/Search'
import { CodeEditorView } from '../app/DesignSystem/CodeEditorView'
import { useResearchViewModel } from './ResearchView.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export const ResearchView: React.FC = () => {
  const { query, setQuery, filteredNodes, selectedId, setSelectedId, selectedNode, content } = useResearchViewModel()

  return (
    <Frame theme="tactical" h="fill" flow="vertical" fill={{ solid: 'var(--bg-1)' }} style={MONO}>
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 24, y: 10 }}
        stroke={{ bottom: { color: 'rgba(255,255,255,0.07)' } }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-2)', ...MONO }}>
          01 — RESEARCH
        </span>
        <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
          {filteredNodes.length} DOCS
        </span>
      </Frame>

      <Frame flow="horizontal" grow minH={0}>
        <ScrollWindow axis="y" flow="vertical" gap={0} minW={260} w={260} padding={16} stroke={{ right: { color: 'rgba(255,255,255,0.08)' } }}>
          <Frame padding={{ bottom: 10 }} shrink={0}>
            <Search value={query} onChange={setQuery} placeholder="Search research…" w="fill" />
          </Frame>
          {filteredNodes.length === 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>— no matches —</span>
          )}
          {filteredNodes.map((n) => (
            <div
              key={n.id}
              onClick={() => setSelectedId(n.id)}
              style={{
                cursor: 'pointer',
                padding: '5px 0',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: n.id === selectedId ? 'var(--text-1)' : 'var(--text-2)',
                  opacity: n.id === selectedId ? 1 : 0.85,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  ...MONO,
                }}
              >
                {n.label}
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 9,
                  color: 'var(--text-3)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  ...MONO,
                }}
              >
                {n.filePath}
              </span>
            </div>
          ))}
        </ScrollWindow>

        {/* Right pane — blank space until a doc is selected; nothing else lives here yet. */}
        {selectedNode ? (
          <Frame grow minW={0}>
            <CodeEditorView path={selectedNode.id} value={content} />
          </Frame>
        ) : (
          <Frame flow="vertical" grow minW={0} align="center" justify="center">
            <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', ...MONO }}>
              SELECT A DOCUMENT
            </span>
          </Frame>
        )}
      </Frame>
    </Frame>
  )
}
