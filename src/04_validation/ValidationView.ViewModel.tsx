import { useEffect, useRef, useState } from 'react'
import { isValidationAvailable, type ValidationResults } from './iValidationView'

export function useValidationViewModel() {
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [results, setResults] = useState<ValidationResults | null>(null)
  const [rawOnFailure, setRawOnFailure] = useState('')
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const available = isValidationAvailable()

  // One session for the component's lifetime — same idea as AgentChat's own
  // sessionIdRef (see AgentChat.ViewModel.tsx).
  const sessionIdRef = useRef(crypto.randomUUID())

  useEffect(() => {
    const api = window.validationAPI
    if (!api) return
    const sessionId = sessionIdRef.current

    const unsubOutput = api.onOutput(sessionId, ({ text }) => {
      setOutput((prev) => prev + text)
    })
    const unsubDone = api.onDone(sessionId, ({ exitCode, timedOut, raw, results }) => {
      setRunning(false)
      setResults(results)
      setRawOnFailure(results ? '' : raw)
      setExitCode(exitCode)
      setTimedOut(timedOut)
    })

    return () => {
      unsubOutput()
      unsubDone()
    }
  }, [])

  const runTests = () => {
    const api = window.validationAPI
    if (!api || running) return
    setHasRun(true)
    setRunning(true)
    setOutput('')
    setResults(null)
    api.run(sessionIdRef.current)
  }

  const stop = () => {
    window.validationAPI?.stop(sessionIdRef.current)
    setRunning(false)
  }

  return { running, output, results, rawOnFailure, exitCode, timedOut, hasRun, runTests, stop, available }
}
