// The test runners Validation can drive, and how each one's report becomes the
// one result shape the Validation view renders (vitest's JSON-reporter shape:
// files/suites of assertions with status, duration and failure messages).
//
// Detection is a filesystem read of the project root, like runTargets.cjs.
// Each runner says what to spawn and how to read what it produced: a JSON
// stream on stdout (vitest, jest, go test), plain text (cargo test), or a
// report file the run writes (JUnit XML from pytest, ctest, Gradle, Maven and
// SwiftPM; TRX from dotnet). Pure parsing lives here so it's testable without
// spawning anything; validation.cjs does the running.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const exists = (p) => {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}
const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}
const firstMatching = (dir, re) => {
  try {
    return fs.readdirSync(dir).find((n) => re.test(n)) ?? null
  } catch {
    return null
  }
}

// ── The shared result shape ────────────────────────────────────────────────

/** Groups tests into suites and totals them, in vitest's JSON-reporter shape. */
function toResults(tests, exitCode) {
  const suites = new Map()
  for (const t of tests) {
    if (!suites.has(t.suite)) suites.set(t.suite, [])
    suites.get(t.suite).push({ title: t.title, fullName: t.fullName ?? `${t.suite} ${t.title}`, status: t.status, duration: t.duration ?? 0, failureMessages: t.failureMessages ?? [] })
  }
  const testResults = [...suites].map(([name, assertionResults]) => ({
    name,
    status: assertionResults.some((a) => a.status === 'failed') ? 'failed' : 'passed',
    assertionResults,
  }))
  const all = testResults.flatMap((f) => f.assertionResults)
  const failed = all.filter((a) => a.status === 'failed').length
  return {
    numTotalTests: all.length,
    numPassedTests: all.filter((a) => a.status === 'passed').length,
    numFailedTests: failed,
    numPendingTests: all.filter((a) => a.status === 'skipped' || a.status === 'pending').length,
    success: failed === 0 && (exitCode === 0 || exitCode === null),
    testResults,
  }
}

// ── Parsers ────────────────────────────────────────────────────────────────

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
const decodeXml = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
      e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
    )
const attrsOf = (text) => Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], decodeXml(m[2])]))

/** JUnit XML (pytest, ctest, Gradle, Maven, SwiftPM) → tests. */
function parseJunit(xml) {
  const tests = []
  for (const m of xml.matchAll(/<testcase\b((?:[^>"]|"[^"]*")*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = attrsOf(m[1])
    const body = m[2] ?? ''
    const failure = body.match(/<(failure|error)\b((?:[^>"]|"[^"]*")*)(?:\/>|>([\s\S]*?)<\/\1>)/)
    const skipped = /<skipped\b/.test(body)
    const message = failure ? [attrsOf(failure[2]).message, failure[3] && decodeXml(failure[3]).trim()].filter(Boolean).join('\n') : ''
    tests.push({
      suite: attrs.classname || attrs.file || 'tests',
      title: attrs.name ?? '(unnamed)',
      status: failure ? 'failed' : skipped ? 'skipped' : 'passed',
      duration: Math.round(Number(attrs.time || 0) * 1000),
      failureMessages: failure ? [message || failure[1]] : [],
    })
  }
  return tests
}

/** dotnet's TRX → tests. */
function parseTrx(xml) {
  const tests = []
  for (const m of xml.matchAll(/<UnitTestResult\b((?:[^>"]|"[^"]*")*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g)) {
    const attrs = attrsOf(m[1])
    const name = attrs.testName ?? '(unnamed)'
    const dot = name.lastIndexOf('.')
    const [h, min, sec] = (attrs.duration ?? '0:0:0').split(':').map(Number)
    const message = (m[2] ?? '').match(/<Message>([\s\S]*?)<\/Message>/)?.[1]
    const outcome = (attrs.outcome ?? '').toLowerCase()
    tests.push({
      suite: dot > 0 ? name.slice(0, dot) : 'tests',
      title: dot > 0 ? name.slice(dot + 1) : name,
      status: outcome === 'passed' ? 'passed' : outcome === 'failed' ? 'failed' : 'skipped',
      duration: Math.round(((h || 0) * 3600 + (min || 0) * 60 + (sec || 0)) * 1000),
      failureMessages: message ? [decodeXml(message).trim()] : [],
    })
  }
  return tests
}

/** `cargo test`'s text output → tests (module path as the suite). */
function parseCargo(text) {
  const failures = new Map()
  for (const m of text.matchAll(/^---- (\S+) stdout ----\r?\n([\s\S]*?)(?=^---- |^failures:|^test result:)/gm)) failures.set(m[1], m[2].trim())
  const tests = []
  for (const m of text.matchAll(/^test (\S+) \.\.\. (ok|FAILED|ignored)/gm)) {
    const name = m[1]
    const at = name.lastIndexOf('::')
    tests.push({
      suite: at > 0 ? name.slice(0, at) : 'crate',
      title: at > 0 ? name.slice(at + 2) : name,
      fullName: name,
      status: m[2] === 'ok' ? 'passed' : m[2] === 'FAILED' ? 'failed' : 'skipped',
      failureMessages: m[2] === 'FAILED' ? [failures.get(name) ?? 'failed'] : [],
    })
  }
  return tests
}

/** `go test -json` event stream → tests (package as the suite). */
function parseGoJson(text) {
  const output = new Map()
  const tests = []
  for (const line of text.split('\n')) {
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (!e.Test) continue
    const key = `${e.Package}\u0000${e.Test}`
    if (e.Action === 'output') output.set(key, (output.get(key) ?? '') + e.Output)
    if (e.Action === 'pass' || e.Action === 'fail' || e.Action === 'skip') {
      tests.push({
        suite: e.Package,
        title: e.Test,
        status: e.Action === 'pass' ? 'passed' : e.Action === 'fail' ? 'failed' : 'skipped',
        duration: Math.round((e.Elapsed ?? 0) * 1000),
        failureMessages: e.Action === 'fail' ? [(output.get(key) ?? '').trim()] : [],
      })
    }
  }
  return tests
}

/** vitest/jest JSON reporter output → the shape as-is (it's already the shape). */
function parseJestJson(text) {
  const start = text.indexOf('{')
  return start >= 0 ? JSON.parse(text.slice(start)) : null
}

// ── Detection ──────────────────────────────────────────────────────────────

const gradle = (root) =>
  exists(path.join(root, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')) ? (process.platform === 'win32' ? 'gradlew.bat' : './gradlew') : 'gradle'

// Report files written since `since` in `dir` — a build tool's results folder
// keeps old reports around, so only this run's count.
function freshReports(dir, re, since) {
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => re.test(n))
      .map((n) => path.join(dir, n))
      .filter((p) => fs.statSync(p).mtimeMs >= since - 1000)
      .map((p) => fs.readFileSync(p, 'utf8'))
  } catch {
    return []
  }
}

/**
 * Every test runner the project at `root` is set up for, most specific first.
 * Each: { id, label, command, args, reportFile? , read(stdout, exitCode, startedAt) → results | null }.
 */
function detectTestRunners(root) {
  if (!root || !exists(root)) return []
  const runners = []
  const tmp = (name) => path.join(os.tmpdir(), `sleipnir-${process.pid}-${Date.now()}-${name}`)

  const pkg = readJson(path.join(root, 'package.json'))
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
  if (deps.vitest) {
    runners.push({ id: 'vitest', label: 'Vitest', command: 'npx', args: ['vitest', 'run', '--reporter=json'], read: (out) => parseJestJson(out) })
  } else if (deps.jest) {
    runners.push({ id: 'jest', label: 'Jest', command: 'npx', args: ['jest', '--json'], read: (out) => parseJestJson(out) })
  }
  if (exists(path.join(root, 'Cargo.toml'))) {
    runners.push({ id: 'cargo', label: 'cargo test', command: 'cargo', args: ['test'], read: (out, code) => toResults(parseCargo(out), code) })
  }
  if (exists(path.join(root, 'go.mod'))) {
    runners.push({ id: 'go', label: 'go test', command: 'go', args: ['test', '-json', './...'], read: (out, code) => toResults(parseGoJson(out), code) })
  }
  if (['pyproject.toml', 'pytest.ini', 'setup.cfg', 'tox.ini', 'requirements.txt'].some((f) => exists(path.join(root, f))) && exists(path.join(root, 'tests'))) {
    const report = tmp('pytest.xml')
    runners.push({ id: 'pytest', label: 'pytest', command: process.platform === 'win32' ? 'python' : 'python3', args: ['-m', 'pytest', `--junitxml=${report}`, '-q'], reportFile: report, read: (_out, code) => readReport(report, parseJunit, code) })
  }
  if (exists(path.join(root, 'build', 'CTestTestfile.cmake'))) {
    const report = tmp('ctest.xml')
    runners.push({ id: 'ctest', label: 'ctest', command: 'ctest', args: ['--test-dir', 'build', '--output-junit', report], reportFile: report, read: (_out, code) => readReport(report, parseJunit, code) })
  }
  if (['build.gradle', 'build.gradle.kts'].some((f) => exists(path.join(root, f)))) {
    runners.push({
      id: 'gradle',
      label: 'gradle test',
      command: gradle(root),
      args: ['test'],
      read: (_out, code, since) => toResults(freshReports(path.join(root, 'build', 'test-results', 'test'), /\.xml$/, since).flatMap(parseJunit), code),
    })
  } else if (exists(path.join(root, 'pom.xml'))) {
    runners.push({
      id: 'maven',
      label: 'mvn test',
      command: 'mvn',
      args: ['test'],
      read: (_out, code, since) => toResults(freshReports(path.join(root, 'target', 'surefire-reports'), /^TEST-.*\.xml$/, since).flatMap(parseJunit), code),
    })
  }
  if (exists(path.join(root, 'Package.swift'))) {
    const report = tmp('swift.xml')
    runners.push({ id: 'swift', label: 'swift test', command: 'swift', args: ['test', '--xunit-output', report], reportFile: report, read: (_out, code) => readReport(report, parseJunit, code) })
  }
  if (firstMatching(root, /\.(csproj|sln)$/)) {
    const dir = tmp('dotnet')
    runners.push({
      id: 'dotnet',
      label: 'dotnet test',
      command: 'dotnet',
      args: ['test', '--results-directory', dir, '--logger', 'trx;LogFileName=results.trx'],
      reportFile: path.join(dir, 'results.trx'),
      read: (_out, code) => readReport(path.join(dir, 'results.trx'), parseTrx, code),
    })
  }
  return runners
}

// A runner's report file, parsed and then removed; null when the run never wrote one.
function readReport(file, parse, exitCode) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  try {
    fs.rmSync(file, { force: true })
  } catch {
    // A leftover temp file is harmless.
  }
  return toResults(parse(text), exitCode)
}

module.exports = { detectTestRunners, toResults, parseJunit, parseTrx, parseCargo, parseGoJson, parseJestJson }
