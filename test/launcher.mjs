/**
 * The form-to-statement composer and task-id seeding. These decide what the
 * agent actually receives, so the shape is pinned here: empty fields must not
 * leak "Not specified" noise, and a missing goal must fail before any session is
 * created.
 */
import assert from 'node:assert/strict'
import { composeTaskStatement, provisionalTaskId } from '../src/host/task-launcher.js'

let n = 0
const check = (label, fn) => {
  fn()
  n++
}

check('a bare goal becomes the statement unchanged', () => {
  const r = composeTaskStatement({ goal: 'Analyse competitor pricing' })
  assert.equal(r.ok, true)
  assert.equal(r.text, 'Analyse competitor pricing')
})

check('a missing or blank goal is refused', () => {
  for (const goal of [undefined, '', '   ']) {
    const r = composeTaskStatement({ goal })
    assert.equal(r.ok, false)
  }
})

check('delivery is the protocol default and adds no line', () => {
  const withType = composeTaskStatement({ goal: 'g', taskType: 'delivery' })
  const withOut = composeTaskStatement({ goal: 'g' })
  assert.equal(withType.text, withOut.text)
})

check('a non-default task type is stated', () => {
  const r = composeTaskStatement({ goal: 'g', taskType: 'learning' })
  assert.ok(r.text.includes('Task type: learning'))
})

check('every optional field, when present, reaches the statement', () => {
  const r = composeTaskStatement({
    goal: 'Write a report',
    sources: 'internal data, public filings',
    deliverable: 'Markdown report',
    constraints: 'under 2000 words',
  })
  assert.ok(r.text.includes('internal data, public filings'))
  assert.ok(r.text.includes('Markdown report'))
  assert.ok(r.text.includes('under 2000 words'))
})

check('empty optional fields produce no placeholder noise', () => {
  const r = composeTaskStatement({ goal: 'g', sources: '', deliverable: '   ', constraints: '' })
  assert.equal(r.text, 'g')
  assert.ok(!/Not specified|undefined|null/.test(r.text))
})

check('the provisional task id follows the protocol YYYYMMDD-short-name shape', () => {
  const id = provisionalTaskId({ goal: 'Analyse competitor pricing' })
  assert.match(id, /^\d{8}-[a-z0-9-]+$/, id)
})

check('a goal with no latin characters still yields a usable id', () => {
  const id = provisionalTaskId({ goal: '分析竞品定价' })
  assert.match(id, /^\d{8}-task$/, id)
})

check('a very long goal is truncated', () => {
  const id = provisionalTaskId({ goal: 'a'.repeat(200) })
  assert.ok(id.length <= 8 + 1 + 24, id)
})

console.log(`launcher: ${n} checks passed`)
