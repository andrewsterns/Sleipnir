import React from 'react'
import { Frame } from '../01_atoms/Frame/Frame'
import { Dropdown } from '../02_molecules/Dropdown/Dropdown'
import { useCodeEditorViewModel } from './CodeEditorView.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface CodeEditorViewProps {
  /** Repo-relative path (from src/) — used for language detection and as the save target. */
  path: string
  value: string
  readOnly?: boolean
  onSaved?: () => void
}

export const CodeEditorView: React.FC<CodeEditorViewProps> = ({ path, value, readOnly, onSaved }) => {
  const { containerRef, dirty, status, errorMessage, save, runnable, running, runResult, run } =
    useCodeEditorViewModel({ path, value, readOnly })

  const handleSave = async () => {
    await save()
    onSaved?.()
  }

  return (
    <Frame flow="vertical" h="fill" w="fill" style={{ position: 'relative' }}>
      {!readOnly && (
        <Frame
          flow="horizontal"
          align="center"
          gap={8}
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
        >
          {status === 'error' && errorMessage && (
            <span style={{ fontSize: 9, color: '#e07a7a', maxWidth: 240, ...MONO }}>{errorMessage}</span>
          )}
          <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-3)', ...MONO }}>
            {status === 'saving' ? 'SAVING…' : dirty ? 'UNSAVED' : status === 'saved' ? 'SAVED' : ''}
          </span>
          {runnable && (
            <button
              onClick={run}
              disabled={running}
              title="Run"
              style={{
                background: running ? 'transparent' : 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'var(--text-1)',
                fontSize: 9,
                letterSpacing: '0.08em',
                padding: '4px 10px',
                cursor: running ? 'default' : 'pointer',
                opacity: running ? 0.5 : 1,
                ...MONO,
              }}
            >
              {running ? 'RUNNING…' : 'RUN'}
            </button>
          )}
          <Dropdown
            options={[{ value: 'save', label: 'Save (Ctrl/Cmd+S)' }]}
            onChange={() => handleSave()}
            trigger={
              <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-1)', ...MONO }}>
                FILE
              </span>
            }
          />
        </Frame>
      )}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />
      {runResult && (
        <Frame
          flow="vertical"
          w="fill"
          maxH="35%"
          scroll="y"
          stroke={{ top: { color: 'rgba(255,255,255,0.15)', width: 1 } }}
          fill={{ solid: 'rgba(0,0,0,0.35)' }}
          padding={8}
        >
          <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-3)', ...MONO }}>
            EXIT CODE: {runResult.exitCode ?? 'none'}
          </span>
          {runResult.stdout && (
            <pre style={{ fontSize: 11, color: 'var(--text-1)', whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>
              {runResult.stdout}
            </pre>
          )}
          {runResult.stderr && (
            <pre style={{ fontSize: 11, color: '#e07a7a', whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>
              {runResult.stderr}
            </pre>
          )}
        </Frame>
      )}
    </Frame>
  )
}
