/**
 * Soul is the one file Studio writes directly, so its round-trip must be exact:
 * what the form shows must be what the protocol reads back, and a field left
 * blank must stay recognisable as unconfigured rather than becoming "empty".
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { readSoul, writeSoul, SOUL_FIELDS } from '../src/host/soul.js'

let n = 0
const check = (label, fn) => {
  fn()
  n++
}

const fresh = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-soul-'))
  fs.mkdirSync(path.join(root, 'mind', 'soul'), { recursive: true })
  return root
}

const TEMPLATE = `# Soul

## Identity
- To be defined

## Mission
- To be defined

## Values
- To be defined

## Taboos
- To be defined

## Methodology Preference
- To be defined

## Decision Style
- To be defined

## Aesthetic Preference
- To be defined

## Learning Policy
- To be defined
`

check('a missing Soul reads as unconfigured with all eight fields', () => {
  const root = fresh()
  const s = readSoul(root)
  assert.equal(s.ok, false)
  assert.equal(s.configured, false)
  assert.equal(s.fields.length, 8)
  assert.ok(s.fields.every((f) => f.placeholder))
  fs.rmSync(root, { recursive: true, force: true })
})

check('the untouched template reads as unconfigured', () => {
  const root = fresh()
  fs.writeFileSync(path.join(root, 'mind', 'soul', 'core.md'), TEMPLATE)
  const s = readSoul(root)
  assert.equal(s.configured, false)
  assert.ok(s.fields.every((f) => f.placeholder))
  fs.rmSync(root, { recursive: true, force: true })
})

check('saving two fields leaves the other six as placeholders', () => {
  const root = fresh()
  fs.writeFileSync(path.join(root, 'mind', 'soul', 'core.md'), TEMPLATE)
  const fields = Object.fromEntries(SOUL_FIELDS.map((f) => [f, '']))
  fields.Identity = 'A pragmatic researcher'
  fields.Mission = 'Turn raw material into reusable knowledge'
  assert.equal(writeSoul(root, { fields }).ok, true)

  const s = readSoul(root)
  assert.equal(s.fields.find((f) => f.name === 'Identity').value, 'A pragmatic researcher')
  assert.deepEqual(
    s.fields.filter((f) => f.placeholder).map((f) => f.name),
    ['Values', 'Taboos', 'Methodology Preference', 'Decision Style', 'Aesthetic Preference', 'Learning Policy'],
  )
  // still unconfigured: the protocol needs every field before Soul applies
  assert.equal(s.configured, false)
  fs.rmSync(root, { recursive: true, force: true })
})

check('filling every field marks the Soul configured', () => {
  const root = fresh()
  const fields = Object.fromEntries(SOUL_FIELDS.map((f) => [f, 'value']))
  writeSoul(root, { fields })
  assert.equal(readSoul(root).configured, true)
  fs.rmSync(root, { recursive: true, force: true })
})

check('written file keeps the protocol heading shape', () => {
  const root = fresh()
  const fields = Object.fromEntries(SOUL_FIELDS.map((f) => [f, 'value']))
  writeSoul(root, { fields })
  const text = fs.readFileSync(path.join(root, 'mind', 'soul', 'core.md'), 'utf8')
  assert.ok(text.startsWith('# Soul\n'))
  for (const name of SOUL_FIELDS) assert.ok(text.includes(`## ${name}\n- value`), `missing section ${name}`)
  fs.rmSync(root, { recursive: true, force: true })
})

check('a multiline value survives the round trip', () => {
  const root = fresh()
  const fields = Object.fromEntries(SOUL_FIELDS.map((f) => [f, 'value']))
  fields.Values = 'Evidence first\nReversible choices first'
  writeSoul(root, { fields })
  assert.equal(readSoul(root).fields.find((f) => f.name === 'Values').value, 'Evidence first\nReversible choices first')
  fs.rmSync(root, { recursive: true, force: true })
})

check('saving without fields is refused rather than blanking the file', () => {
  const root = fresh()
  fs.writeFileSync(path.join(root, 'mind', 'soul', 'core.md'), TEMPLATE)
  assert.equal(writeSoul(root, {}).ok, false)
  assert.equal(writeSoul(root, null).ok, false)
  // and the original file is untouched
  assert.equal(fs.readFileSync(path.join(root, 'mind', 'soul', 'core.md'), 'utf8'), TEMPLATE)
  fs.rmSync(root, { recursive: true, force: true })
})

console.log(`soul: ${n} checks passed`)
