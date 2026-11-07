/**
 * File watching. The watcher is a *trigger*, so the contract worth pinning is
 * that a real file change produces a payload and that an unchanged tree does not
 * spam subscribers.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { watchRuntime } from '../src/host/watch.js'

let n = 0
const check = async (label, fn) => { await fn(); n++ }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function withRuntime(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-watch-'))
  const task = path.join(root, 'tasks', 't1')
  fs.mkdirSync(task, { recursive: true })
  fs.writeFileSync(path.join(task, 'state.md'), '# Task State\n\n## Current Phase\n- recognition\n')
  try {
    await fn(root, task)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

await check('a state.md rewrite reaches subscribers', async () => {
  await withRuntime(async (root, task) => {
    const seen = []
    const watcher = watchRuntime({
      root,
      snapshot: () => ({ phase: fs.readFileSync(path.join(task, 'state.md'), 'utf8').match(/## Current Phase\n- (\w[\w-]*)/)?.[1] ?? null }),
    })
    watcher.subscribe((p) => seen.push(p))

    fs.writeFileSync(path.join(task, 'state.md'), '# Task State\n\n## Current Phase\n- planning\n')
    await sleep(400)
    watcher.close()

    assert.ok(seen.some((p) => p.phase === 'planning'), `expected a planning payload, got ${JSON.stringify(seen)}`)
  })
})

await check('subscribing delivers the current state once, then duplicates are suppressed', async () => {
  await withRuntime(async (root) => {
    const seen = []
    const watcher = watchRuntime({ root, snapshot: () => ({ constant: true }) })
    watcher.subscribe((p) => seen.push(p))

    // subscribing hands over the current payload so a late client is not blind
    assert.equal(seen.length, 1, 'subscribe should deliver the current payload')

    // an unchanged tree must not re-notify on every watcher tick
    watcher.emit()
    watcher.emit()
    await sleep(200)
    watcher.close()
    assert.equal(seen.length, 1, `duplicates should be suppressed, got ${seen.length}`)
  })
})

await check('close() stops delivery', async () => {
  await withRuntime(async (root, task) => {
    const seen = []
    const watcher = watchRuntime({ root, snapshot: () => ({ at: Date.now() }) })
    watcher.subscribe((p) => seen.push(p))
    watcher.close()
    const before = seen.length

    fs.writeFileSync(path.join(task, 'state.md'), 'changed')
    await sleep(300)
    assert.equal(seen.length, before, 'no delivery after close()')
  })
})

await check('a subscriber that throws does not stop the others', async () => {
  await withRuntime(async (root) => {
    const seen = []
    const watcher = watchRuntime({ root, snapshot: () => ({ v: 1 }) })
    watcher.subscribe(() => {
      throw new Error('broken client')
    })
    let delivered = 0
    watcher.subscribe(() => { delivered++ })
    watcher.emit(true)
    await sleep(100)
    watcher.close()
    assert.equal(delivered, 2, 'the healthy subscriber still receives both payloads')
  })
})

console.log(`watch: ${n} checks passed`)
