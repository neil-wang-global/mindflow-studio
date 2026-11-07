/**
 * The client half ships as a plain `window.__ModuleLoader__.load({...})` script,
 * the same shape every other DSH client plugin uses. No bundler runtime is
 * needed: the file is already a single self-contained module that receives React
 * through the loader's `require`.
 *
 * This script exists so `npm run build:client` is a real step (it validates the
 * wrapper) rather than a no-op that silently drifts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const src = path.join(root, 'src', 'client', 'panel.js')
const outDir = path.join(root, 'lib')
const out = path.join(outDir, 'client.js')

const code = fs.readFileSync(src, 'utf8')

// Guard the three things a DSH client plugin must get right.
if (!code.includes('window.__ModuleLoader__.load(')) {
  throw new Error('client plugin must call window.__ModuleLoader__.load')
}
if (!/id:\s*'mindflow-studio'/.test(code)) {
  throw new Error("client plugin id must be 'mindflow-studio'")
}
if (!code.includes("inject: ['slots']")) {
  throw new Error("client plugin must inject the 'slots' service")
}

fs.mkdirSync(outDir, { recursive: true })
// banner keeps the built file obviously generated
fs.writeFileSync(out, `// generated from src/client/panel.js by scripts/bundle-client.mjs\n${code}`, 'utf8')
console.log(`client bundle: ${path.relative(root, out)} (${code.length} bytes)`)
