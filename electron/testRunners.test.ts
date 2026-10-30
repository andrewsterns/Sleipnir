// @vitest-environment node
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { detectTestRunners, toResults, parseJunit, parseTrx, parseCargo, parseGoJson } = require('./testRunners.cjs')

describe('reading each runner into one shape', () => {
  it('reads cargo test output, failures included', () => {
    const out = [
      'running 3 tests',
      'test cart::tests::adds ... ok',
      'test cart::tests::rounds ... FAILED',
      'test parse ... ignored',
      '',
      'failures:',
      '',
      '---- cart::tests::rounds stdout ----',
      "thread 'cart::tests::rounds' panicked at src/cart.rs:12:9:",
      'assertion `left == right` failed',
      '',
      'failures:',
      '    cart::tests::rounds',
      '',
      'test result: FAILED. 1 passed; 1 failed; 1 ignored',
    ].join('\n')
    const r = toResults(parseCargo(out), 101)
    expect(r).toMatchObject({ numTotalTests: 3, numPassedTests: 1, numFailedTests: 1, numPendingTests: 1, success: false })
    const failed = r.testResults.find((f: { name: string }) => f.name === 'cart::tests').assertionResults.find((a: { title: string }) => a.title === 'rounds')
    expect(failed.failureMessages[0]).toContain('src/cart.rs:12:9')
  })

  it('reads go test -json events by package', () => {
    const out = [
      { Action: 'run', Package: 'shop/cart', Test: 'TestAdd' },
      { Action: 'pass', Package: 'shop/cart', Test: 'TestAdd', Elapsed: 0.01 },
      { Action: 'output', Package: 'shop/cart', Test: 'TestRound', Output: '    cart_test.go:20: got 3, want 4\n' },
      { Action: 'fail', Package: 'shop/cart', Test: 'TestRound', Elapsed: 0.02 },
      { Action: 'pass', Package: 'shop/cart', Elapsed: 0.5 },
    ]
      .map((e) => JSON.stringify(e))
      .join('\n')
    const r = toResults(parseGoJson(out), 1)
    expect(r.testResults[0]).toMatchObject({ name: 'shop/cart', status: 'failed' })
    expect(r.testResults[0].assertionResults[1]).toMatchObject({ title: 'TestRound', status: 'failed', duration: 20, failureMessages: ['cart_test.go:20: got 3, want 4'] })
  })

  it('reads JUnit XML (pytest, ctest, Gradle, Maven, SwiftPM)', () => {
    const xml = `<?xml version="1.0"?>
<testsuites><testsuite name="pytest" tests="3">
  <testcase classname="tests.test_cart" name="test_add" time="0.004"/>
  <testcase classname="tests.test_cart" name="test_round" time="0.010"><failure message="assert 3 == 4">tests/test_cart.py:9: AssertionError &amp; more</failure></testcase>
  <testcase classname="tests.test_cart" name="test_later" time="0"><skipped message="todo"/></testcase>
</testsuite></testsuites>`
    const r = toResults(parseJunit(xml), 1)
    expect(r).toMatchObject({ numTotalTests: 3, numPassedTests: 1, numFailedTests: 1, numPendingTests: 1 })
    expect(r.testResults[0].assertionResults[1].failureMessages[0]).toBe('assert 3 == 4\ntests/test_cart.py:9: AssertionError & more')
  })

  it('reads dotnet TRX', () => {
    const trx = `<TestRun><Results>
  <UnitTestResult testName="Shop.Tests.CartTests.Adds" outcome="Passed" duration="00:00:00.0120000"/>
  <UnitTestResult testName="Shop.Tests.CartTests.Rounds" outcome="Failed" duration="00:00:00.5000000"><Output><ErrorInfo><Message>Expected 4 but was 3</Message></ErrorInfo></Output></UnitTestResult>
</Results></TestRun>`
    const r = toResults(parseTrx(trx), 1)
    expect(r.testResults[0]).toMatchObject({ name: 'Shop.Tests.CartTests', status: 'failed' })
    expect(r.testResults[0].assertionResults[1]).toMatchObject({ title: 'Rounds', duration: 500, failureMessages: ['Expected 4 but was 3'] })
  })
})

describe('detectTestRunners', () => {
  let root: string
  const write = (rel: string, content = '') => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), content)
  }
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sleipnir-tests-'))
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  it('finds every runner a polyglot project is set up for', () => {
    write('package.json', JSON.stringify({ devDependencies: { vitest: '2' } }))
    write('Cargo.toml')
    write('go.mod')
    write('pyproject.toml')
    write('tests/test_a.py')
    write('build/CTestTestfile.cmake')
    write('pom.xml')
    write('Package.swift')
    write('Shop.sln')
    expect(detectTestRunners(root).map((r: { id: string }) => r.id)).toEqual(['vitest', 'cargo', 'go', 'pytest', 'ctest', 'maven', 'swift', 'dotnet'])
  })

  it('needs a configured CMake build for ctest, and a tests folder for pytest', () => {
    write('CMakeLists.txt')
    write('requirements.txt')
    expect(detectTestRunners(root)).toEqual([])
  })
})
