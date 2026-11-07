/**
 * Client bundle builder.
 *
 * A DSH client plugin must arrive as one `window.__ModuleLoader__.load({...})`
 * script. The sources are split by concern (panel / markdown / native seat) for
 * readability, so they are concatenated here: each module's `export ` keyword is
 * dropped and its top-level declarations share the factory scope, which is what
 * lets `panel.js` call `createMarkdownRenderer` and `createNativeSeat` directly.
 *
 * The build fails loudly on the two mistakes that otherwise surface only as a
 * silently missing panel: a source that keeps a top-level `export`, or an output
 * that never calls the loader.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const clientDir = path.join(root, 'src', 'client')
const outFile = path.join(root, 'lib', 'client.js')

// order matters only in that every helper is declared before it is called
const SOURCES = ['markdown.js', 'native-seat.js', 'panel.js']

function stripModuleSyntax(name, code) {
  if (/^\s*(import\s|\s*export\s)/m.test(code) && name !== 'panel.js') {
    // drop `export ` prefixes, refuse real import statements
    if (/^\s*import\s/m.test(code)) throw new Error(`${name} must not use import; modules share the factory scope`)
    return code.replace(/^export\s+/gm, '')
  }
  return code
}

const parts = []
for (const name of SOURCES) {
  const file = path.join(clientDir, name)
  const code = fs.readFileSync(file, 'utf8')
  if (name === 'panel.js') {
    // panel.js is the loader entry itself and is emitted last, unwrapped
    if (!code.includes('window.__ModuleLoader__.load(')) throw new Error('panel.js must call window.__ModuleLoader__.load')
    if (!/id:\s*'mindflow-studio'/.test(code)) throw new Error("client plugin id must be 'mindflow-studio'")
    parts.push({ name, code })
    continue
  }
  parts.push({ name, code: stripModuleSyntax(name, code) })
}

// The shared modules must be declared INSIDE the factory so they close over the
// same React instance the loader hands the panel.
const panel = parts[parts.length - 1].code
const helpers = parts.slice(0, -1)

const marker = '    const h = React.createElement\n'
if (!panel.includes(marker)) throw new Error('panel.js no longer declares `const h = React.createElement`')
if (!panel.includes("inject: ['slots']")) throw new Error("client plugin must inject the 'slots' service")

const indented = helpers
  .map(({ name, code }) => `    // ─── ${name} ───────────────────────────────────────────\n${code.replace(/^/gm, '    ')}`)
  .join('\n\n')

// helpers land right after React is available, before the panel body uses them
const merged = panel.replace(marker, `${marker}\n${indented}\n`)

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, `// generated from src/client/*.js by scripts/bundle-client.mjs\n${merged}`, 'utf8')
console.log(`client bundle: ${path.relative(root, outFile)} (${merged.length} bytes, ${SOURCES.length} sources)`)
