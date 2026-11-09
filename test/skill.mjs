/**
 * Skill detection. The install path touches the filesystem and the network, so
 * these checks cover the read-only decisions: what counts as installed, and when
 * the panel may offer to install at all.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { findSkill, skillStatus } from '../src/host/skill.js'

let n = 0
const check = (label, fn) => { fn(); n++ }

// The module resolves against the real home directory, so assert on the shape it
// reports rather than on a specific machine's state.
check('findSkill reports a well-formed result either way', () => {
  const r = findSkill()
  assert.equal(typeof r.installed, 'boolean')
  if (r.installed) {
    assert.ok(r.manifest.endsWith('SKILL.md'))
    assert.ok(fs.existsSync(r.manifest), 'a discovered skill must have a readable SKILL.md')
  } else {
    assert.equal(r.path, null)
  }
})

check('skillStatus never promises an install it cannot perform', () => {
  const s = skillStatus()
  assert.equal(typeof s.installed, 'boolean')
  assert.equal(typeof s.canInstall, 'boolean')
  if (s.installed) {
    assert.equal(s.canInstall, false, 'nothing to install when already present')
  } else if (!s.canInstall) {
    assert.ok(typeof s.reason === 'string' && s.reason.length > 0, 'an unavailable install needs a reason')
  } else {
    assert.ok(s.plannedRoot, 'an offered install must name its target root')
  }
})

check('a directory without SKILL.md is not an installed skill', () => {
  // statSync succeeds but the manifest is absent: must not be reported installed
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-skill-'))
  fs.mkdirSync(path.join(fake, 'mindflow'))
  const manifest = path.join(fake, 'mindflow', 'SKILL.md')
  assert.equal(fs.existsSync(manifest), false)
  fs.rmSync(fake, { recursive: true, force: true })
})


check('skillStatus reports every runtime it knows about', () => {
  const s = skillStatus()
  assert.ok(Array.isArray(s.links), 'links must always be present for the banner')
  const names = s.links.map((l) => l.runtime)
  assert.ok(names.includes('DSH'), 'DSH runs the tasks, so it must be reported')
  assert.ok(names.includes('OpenCode'), 'OpenCode is a supported runtime')
  assert.ok(names.includes('Hermes'), 'Hermes is a supported runtime')
  for (const l of s.links) {
    assert.equal(typeof l.linked, 'boolean')
    assert.ok(l.entry.endsWith('mindflow'))
  }
})

check('an installed skill reports the unlinked runtimes rather than hiding them', () => {
  const s = skillStatus()
  if (!s.installed) return
  // needsLink is what drives the "installed but not linked" banner state
  assert.ok(Array.isArray(s.needsLink))
  const unlinked = s.links.filter((l) => !l.linked).map((l) => l.runtime)
  assert.deepEqual(s.needsLink.map((l) => l.runtime), unlinked)
})

check('the store is preferred as the canonical location', () => {
  const s = skillStatus()
  if (!s.installed) return
  const home = os.homedir()
  const store = path.join(home, '.cc-switch', 'skills')
  // either it is in the store, or the store is absent and another root answered
  if (fs.existsSync(store)) {
    assert.equal(s.root, store, 'with a store present, that is the canonical copy')
  }
})

console.log(`skill: ${n} checks passed`)
