/**
 * `state.md` parsing is the riskiest seam: it turns hand-editable prose into the
 * facts the whole panel trusts. A field silently read as absent, or a phase
 * guessed from a typo, would misreport a task. These cases pin that behaviour.
 */
import { parseState, deriveTrail, PHASES } from '../src/shared/parse-state.js'
import assert from 'node:assert/strict'

const RUNNING = `# Task State

## Task ID
- 20261107-demo

## Runtime Root
- /Users/neil/.mindflow/MindFlow/runtime

## Current Phase
- execution-control

## Current Step
- Step 2

## Overall Status
- running

## Step Status Map
- Step 1: completed
- Step 2: running
- Step 3: pending

## Parallel Branch Status
- none

## Last Failure
- none

## Retry Count
- 1
`

const FRESH = `# Task State

## Task ID
- current task ID

## Current Phase
- active phases: \`learning-read / recognition / analysis / planning / execution-control / learning-acquire / reflection / terminal-learning\`

## Overall Status
- running

## Step Status Map
- pending — not yet planned
`

let n = 0
const check = (label, fn) => {
  fn()
  n++
}

check('running task parses every field', () => {
  const s = parseState(RUNNING)
  assert.equal(s.taskId, '20261107-demo')
  assert.equal(s.runtimeRoot, '/Users/neil/.mindflow/MindFlow/runtime')
  assert.equal(s.phase, 'execution-control')
  assert.equal(s.currentStep, 'Step 2')
  assert.equal(s.overallStatus, 'running') // 'running' is a real value, not a placeholder
  assert.equal(s.retryCount, 1)
  assert.equal(s.lastFailure, null) // 'none' means "no failure", rendered as null
  assert.deepEqual(s.steps.map((x) => x.status), ['completed', 'running', 'pending'])
})

check('template placeholders are not mistaken for data', () => {
  const s = parseState(FRESH)
  assert.equal(s.taskId, null)
  assert.equal(s.phase, null) // a template's phase list is not a phase
  assert.equal(s.overallStatus, 'running') // this one IS the initialised value
  assert.deepEqual(s.steps, [])
})

check('an unrecognised phase is surfaced verbatim, not guessed', () => {
  const s = parseState(RUNNING.replace('- execution-control', '- exectuion-control'))
  assert.equal(s.phase, null)
  assert.equal(s.phaseRaw, 'exectuion-control')
})

check('step numbers sort numerically', () => {
  const md = RUNNING.replace(
    '- Step 1: completed\n- Step 2: running\n- Step 3: pending',
    '- Step 1: completed\n- Step 2: completed\n- Step 10: pending\n- Step 3: pending',
  )
  const s = parseState(md)
  assert.deepEqual(s.steps.map((x) => x.index), [1, 2, 3, 10])
})

check('terminal phases mark the whole trail done', () => {
  const s = parseState(RUNNING.replace('- execution-control', '- completed').replace('- running', '- completed'))
  assert.ok(s.trail.every((t) => t.state === 'done'))
})

check('acquire slots in before reflection at its real position', () => {
  const trail = deriveTrail('learning-acquire', 'running')
  const phases = trail.map((t) => t.phase)
  assert.equal(phases.indexOf('learning-acquire'), phases.indexOf('reflection') - 1)
  assert.equal(trail.find((t) => t.phase === 'learning-acquire').state, 'current')
  // everything before acquire reads done, not pending
  for (const t of trail) {
    if (t.phase === 'learning-acquire') break
    assert.equal(t.state, 'done', `${t.phase} should be done before acquire`)
  }
})

check('a normal run has exactly the protocol phase sequence', () => {
  assert.equal(PHASES.length, 7)
  assert.deepEqual(deriveTrail('execution-control', 'running').map((t) => t.phase), PHASES)
})

check('parallel branches collapse `none` to empty', () => {
  assert.deepEqual(parseState(RUNNING).branches, [])
  const md = RUNNING.replace('- none\n\n## Last Failure', '- Branch A (Steps 2,3): running\n\n## Last Failure')
  assert.equal(parseState(md).branches.length, 1)
})

console.log(`parse-state: ${n} checks passed`)
