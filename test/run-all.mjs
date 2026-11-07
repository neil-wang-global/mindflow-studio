/**
 * Suite entry: every check exits non-zero on failure so `npm test` is meaningful.
 * The render checks import the real client bundle through a React mock, so they
 * catch component wiring bugs (a status badge reading the wrong prop, a view that
 * never mounts) that a syntax check would sail past.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const suites = ['parse-state.mjs', 'host.mjs', 'soul.mjs', 'launcher.mjs', 'render-tasks.mjs', 'render-liveness.mjs', 'render-views.mjs']

let failed = 0
for (const name of suites) {
  const file = path.join(here, name)
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { stdio: 'inherit', env: { ...process.env, NODE_PATH: path.resolve(here, '..', 'node_modules') } })
    child.on('exit', resolve)
  })
  if (code !== 0) {
    console.error(`✗ ${name}`)
    failed++
  } else {
    console.log(`✓ ${name}`)
  }
}
if (failed > 0) {
  console.error(`\n${failed} suite(s) failed`)
  process.exit(1)
}
console.log(`\nall ${suites.length} suites passed`)
