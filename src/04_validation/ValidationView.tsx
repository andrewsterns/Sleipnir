import React from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Icon } from '../app/UIKit/Icon/Icon'
import { Button } from '../app/UIKit/Button/Button'
import { SleipnirLoader } from '../app/UIKit/SleipnirLoader/SleipnirLoader'
import { useValidationViewModel } from './ValidationView.ViewModel'
import { shortenTestPath, type ValidationTestFileResult } from './iValidationView'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

function TestFileRow({ file }: { file: ValidationTestFileResult }) {
  const failed = file.assertionResults.filter((a) => a.status === 'failed')
  return (
    <Frame flow="vertical" gap={4} padding={{ x: 14, y: 8 }} stroke={{ bottom: { color: 'var(--border-1)' } }}>
      <Frame flow="horizontal" align="center" gap={8}>
        <span style={{ color: file.status === 'passed' ? '#7ec98f' : '#e07a7a', display: 'inline-flex' }}>
          <Icon name={file.status === 'passed' ? 'check' : 'x'} size={12} />
        </span>
        <span style={{ fontSize: 11, color: file.status === 'passed' ? 'var(--text-2)' : '#e07a7a', ...MONO }}>
          {shortenTestPath(file.name)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>
          {file.assertionResults.length - failed.length}/{file.assertionResults.length}
        </span>
      </Frame>
      {failed.map((a) => (
        <Frame key={a.fullName} flow="vertical" gap={2} padding={{ left: 20 }}>
          <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{a.title}</span>
          {a.failureMessages.map((msg, i) => (
            <span key={i} style={{ fontSize: 9, color: 'var(--text-3)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...MONO }}>
              {msg}
            </span>
          ))}
        </Frame>
      ))}
    </Frame>
  )
}

// Restores the "Validation" pipeline stage's UI (see App.tsx's NAV_ITEMS
// comment) — runs the open Workspace's own `npm test` via electron/validation.cjs
// (vitest --reporter=json) and surfaces pass/fail results in-app, row-list
// styled after ProblemsDock. Electron-only, like the terminal/chat/preview docks.
export default function ValidationView() {
  const { running, output, results, rawOnFailure, exitCode, timedOut, hasRun, runTests, stop, available } =
    useValidationViewModel()

  if (!available) {
    return (
      <Frame flow="vertical" h="fill" w="fill" align="center" justify="center" fill={{ solid: 'bg-1' }} padding={20}>
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-3)', textAlign: 'center', ...MONO }}>
          VALIDATION IS DESKTOP-ONLY — RUN THE ELECTRON APP
        </span>
      </Frame>
    )
  }

  return (
    <Frame flow="vertical" h="fill" w="fill" fill={{ solid: 'bg-1' }}>
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 14, y: 10 }}
        stroke={{ bottom: { color: 'var(--border-1)' } }}
        shrink={0}
      >
        <span style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
          VALIDATION
          {results && ` — ${results.numPassedTests}/${results.numTotalTests} PASSED`}
        </span>
        <Button variant={running ? 'ghost' : 'primary'} size="sm" onClick={running ? stop : runTests}>
          {running ? 'Stop' : 'Run Tests'}
        </Button>
      </Frame>

      <Frame grow minH={0} scroll="y" flow="vertical">
        {!hasRun && (
          <Frame flow="vertical" align="center" justify="center" h="fill">
            <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.08em', ...MONO }}>
              RUN TESTS TO SEE RESULTS HERE
            </span>
          </Frame>
        )}

        {running && (
          <Frame flow="vertical" gap={10} align="center" padding={20}>
            <SleipnirLoader size={32} />
            <Frame
              w="fill"
              maxH={300}
              scroll="y"
              padding={10}
              fill={{ solid: 'bg-0' }}
              stroke={{ color: 'var(--border-1)' }}
            >
              <span style={{ fontSize: 10, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...MONO }}>
                {output || 'Starting…'}
              </span>
            </Frame>
          </Frame>
        )}

        {!running && results && results.testResults.map((file) => <TestFileRow key={file.name} file={file} />)}

        {!running && hasRun && !results && (
          <Frame flow="vertical" gap={8} padding={14}>
            <span style={{ fontSize: 11, color: '#e07a7a', ...MONO }}>
              {timedOut ? 'Timed out.' : `Vitest didn't produce a result (exit code: ${exitCode}).`}
            </span>
            <Frame padding={10} fill={{ solid: 'bg-0' }} stroke={{ color: 'var(--border-1)' }}>
              <span style={{ fontSize: 10, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...MONO }}>
                {rawOnFailure || '(no output)'}
              </span>
            </Frame>
          </Frame>
        )}
      </Frame>
    </Frame>
  )
}
