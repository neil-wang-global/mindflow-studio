/**
 * Host entry builder.
 *
 * `lib/index.js` is generated so the source of truth is `src/host/index.js`.
 * The first version of this plugin kept a hand-written `lib/index.js` whose
 * relative imports pointed at `lib/` while its dependencies lived in `src/host/`
 * — the plugin then failed to load and DSH skipped it silently, with no panel
 * and a 404 on every route. Generating the entry removes that class of mistake:
 * the import specifiers are rewritten here, in one place, and can be checked.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const srcFile = path.join(root, 'src', 'host', 'index.js')
const outFile = path.join(root, 'lib', 'index.js')

let code = fs.readFileSync(srcFile, 'utf8')

// Every sibling module stays under src/host/, so lib/index.js reaches back for it.
code = code.replace(/from '\.\/([a-z-]+\.js)'/g, "from '../src/host/$1'")

// Fail loudly rather than shipping an entry that cannot resolve its imports.
const specifiers = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1])
for (const spec of specifiers) {
  if (!spec.startsWith('.')) continue // bare specifier: resolved by node
  const target = path.resolve(root, 'lib', spec)
  if (!fs.existsSync(target)) {
    throw new Error(`lib/index.js imports ${spec}, which does not resolve to ${target}`)
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, `// generated from src/host/index.js by scripts/build-host.mjs\n${code}`, 'utf8')
console.log(`host entry: lib/index.js (${specifiers.length} imports verified)`)
