/**
 * Host-side filesystem behaviour: runtime-root resolution order, task scanning,
 * artifact containment. The containment check matters — a crafted path must not
 * let the panel read files outside the runtime.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { resolveRuntimeRoot, runtimeInfo, listTasks, readTask, readArtifact, isValidTaskId } from '../src/host/runtime-root.js'

let n = 0
const check = (label, fn) => {
  fn()
  n++
}

function makeRuntime() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-host-'))
  const task = path.join(root, 'tasks', '20261107-demo')
  fs.mkdirSync(path.join(task, '_output'), { recursive: true })
  fs.mkdirSync(path.join(task, 'cache'), { recursive: true })
  fs.writeFileSync(
    path.join(task, 'state.md'),
    `# Task State\n\n## Task ID\n- 20261107-demo\n\n## Current Phase\n- analysis\n\n## Overall Status\n- running\n`,
  )
  fs.writeFileSync(path.join(task, '_output', 'out.md'), '# Out')
  fs.writeFileSync(path.join(task, 'cache', 'mid.md'), '# Mid')
  return { root, task }
}

check('env var wins over the default', () => {
  const saved = process.env.MINDFLOW_RUNTIME_ROOT
  process.env.MINDFLOW_RUNTIME_ROOT = '/tmp/from-env'
  const r = resolveRuntimeRoot()
  assert.equal(r.root, path.resolve('/tmp/from-env'))
  assert.equal(r.source, 'env')
  if (saved === undefined) delete process.env.MINDFLOW_RUNTIME_ROOT
  else process.env.MINDFLOW_RUNTIME_ROOT = saved
})

check('explicit path is honoured when the env var is unset', () => {
  const saved = process.env.MINDFLOW_RUNTIME_ROOT
  delete process.env.MINDFLOW_RUNTIME_ROOT
  const r = resolveRuntimeRoot('/tmp/from-caller')
  assert.equal(r.root, path.resolve('/tmp/from-caller'))
  assert.equal(r.source, 'explicit')
  if (saved !== undefined) process.env.MINDFLOW_RUNTIME_ROOT = saved
})

check('default falls back to <protocolRoot>/runtime', () => {
  const saved = process.env.MINDFLOW_RUNTIME_ROOT
  delete process.env.MINDFLOW_RUNTIME_ROOT
  const r = resolveRuntimeRoot()
  assert.equal(r.source, 'default')
  assert.equal(path.basename(r.root), 'runtime')
  if (saved !== undefined) process.env.MINDFLOW_RUNTIME_ROOT = saved
})

check('tasks are listed newest first with parsed state', () => {
  const { root } = makeRuntime()
  const tasks = listTasks(root)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].taskId, '20261107-demo')
  assert.equal(tasks[0].state.phase, 'analysis')
  assert.equal(tasks[0].hasState, true)
  fs.rmSync(root, { recursive: true, force: true })
})

check('artifacts list every file but never state.md itself', () => {
  const { root } = makeRuntime()
  const t = readTask(root, '20261107-demo')
  const paths = t.artifacts.map((a) => a.path).sort()
  assert.deepEqual(paths, ['_output/out.md', 'cache/mid.md'])
  assert.ok(!paths.includes('state.md'))
  fs.rmSync(root, { recursive: true, force: true })
})

check('a missing state.md is reported, not fabricated', () => {
  const { root } = makeRuntime()
  fs.rmSync(path.join(root, 'tasks', '20261107-demo', 'state.md'))
  const t = readTask(root, '20261107-demo')
  assert.equal(t.hasState, false)
  assert.equal(t.state, null)
  fs.rmSync(root, { recursive: true, force: true })
})

check('artifact reads outside the task directory are refused', () => {
  const { root } = makeRuntime()
  for (const evil of ['../../etc/passwd', '../../../etc/passwd', '/etc/passwd']) {
    const r = readArtifact(root, '20261107-demo', evil)
    assert.equal(r.ok, false, `must refuse ${evil}`)
  }
  fs.rmSync(root, { recursive: true, force: true })
})

check('a normal artifact reads back', () => {
  const { root } = makeRuntime()
  const r = readArtifact(root, '20261107-demo', '_output/out.md')
  assert.equal(r.ok, true)
  assert.equal(r.content, '# Out')
  fs.rmSync(root, { recursive: true, force: true })
})

check('runtimeInfo reports absence instead of throwing', () => {
  const saved = process.env.MINDFLOW_RUNTIME_ROOT
  process.env.MINDFLOW_RUNTIME_ROOT = '/tmp/definitely-does-not-exist-mf'
  const info = runtimeInfo()
  assert.equal(info.exists, false)
  assert.equal(info.source, 'env')
  if (saved === undefined) delete process.env.MINDFLOW_RUNTIME_ROOT
  else process.env.MINDFLOW_RUNTIME_ROOT = saved
})

check('a task id must be a single directory name', () => {
  for (const bad of ['../etc', '../../x', 'a/b', 'a\\b', '', '.', '..', null, undefined, 42]) {
    assert.equal(isValidTaskId(bad), false, `must reject ${JSON.stringify(bad)}`)
  }
  for (const good of ['20261107-demo', 't1', 'a-b_c.d']) {
    assert.equal(isValidTaskId(good), true, `must accept ${good}`)
  }
})

check('a traversing task id cannot read outside the runtime', () => {
  const { root } = makeRuntime()
  // Without the task-id guard this resolves to a base outside `tasks/`, and the
  // containment check that only compares against that base would agree.
  for (const evil of ['../..', '../../../../etc', 'a/../../..']) {
    const r = readArtifact(root, evil, 'passwd')
    assert.equal(r.ok, false, `must refuse task id ${evil}`)
  }
  fs.rmSync(root, { recursive: true, force: true })
})

console.log(`host: ${n} checks passed`)
