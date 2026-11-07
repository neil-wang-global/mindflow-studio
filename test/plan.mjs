/**
 * `plan.md` parsing. The protocol does not fix the Plan's inner headings the way
 * it fixes `state.md`, so these cases pin the tolerance: canonical fields must be
 * picked up, and an unfamiliar Plan must still yield its Steps.
 */
import assert from 'node:assert/strict'
import { parsePlan } from '../src/host/plan.js'

let n = 0
const check = (label, fn) => { fn(); n++ }

const PLAN = `# Plan

## Task ID
- 20261107-demo

## Plan Objective
- Produce a short deliverable proving the runtime separation works

## Steps

### Step 1
- Capability: cap-research
- Learning: terminal-only
- Dispatch Mode: sequential
- Inputs: task-profile.md
- Completion Criteria: _output/report.md exists
- Failure Policy: retry

### Step 2
- Capability: cap-write
- Dispatch Mode: subagent
- Parallel Group: group-a
- Outputs: _output/draft.md
`

check('objective is read from the Plan', () => {
  const p = parsePlan(PLAN)
  assert.equal(p.objective, 'Produce a short deliverable proving the runtime separation works')
})

check('every Step is found in numeric order', () => {
  const p = parsePlan(PLAN)
  assert.deepEqual(p.steps.map((s) => s.index), [1, 2])
})

check('canonical per-Step fields are picked up', () => {
  const [first, second] = parsePlan(PLAN).steps
  assert.equal(first.capability, 'cap-research')
  assert.equal(first.learning, 'terminal-only')
  assert.equal(first.dispatchMode, 'sequential')
  assert.equal(first.failurePolicy, 'retry')
  assert.equal(second.capability, 'cap-write')
  assert.equal(second.parallelGroup, 'group-a')
})

check('a non-sequential dispatch marks the Plan as parallel', () => {
  assert.equal(parsePlan(PLAN).parallel, true)
  const serial = PLAN.replace('- Dispatch Mode: subagent', '- Dispatch Mode: sequential')
  assert.equal(parsePlan(serial).parallel, false)
})

check('a Plan with no Steps is reported as empty, not an error', () => {
  const p = parsePlan('# Plan\n\n## Plan Objective\n- something\n')
  assert.deepEqual(p.steps, [])
  assert.equal(p.mode, 'compact-or-unwritten')
})

check('Step numbering sorts numerically, not lexically', () => {
  const many = ['### Step 10', '### Step 2', '### Step 1']
    .map((h) => `${h}\n- Capability: cap-x\n`)
    .join('\n')
  assert.deepEqual(parsePlan(many).steps.map((s) => s.index), [1, 2, 10])
})

check('an unrecognised Step field does not break the parse', () => {
  const odd = '### Step 1\n- Capability: cap-a\n- Some Future Field: whatever\n- Learning: optional\n'
  const [step] = parsePlan(odd).steps
  assert.equal(step.capability, 'cap-a')
  assert.equal(step.learning, 'optional')
})

console.log(`plan: ${n} checks passed`)
