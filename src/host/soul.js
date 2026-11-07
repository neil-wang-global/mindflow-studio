/**
 * Soul read/write.
 *
 * Soul is the ONE thing Studio edits directly instead of routing through a
 * session. It has a fixed eight-field shape, no cross-file consistency contract,
 * and the user asked for convenient maintenance, so a form that writes
 * `mind/soul/core.md` is the right tool.
 *
 * The writer reproduces `templates/mind/soul/core.md` byte-for-byte in shape:
 * `# Soul`, then one `## Field` + `- value` pair per field, separated by blank
 * lines. Anything the template does not declare is preserved under a trailing
 * section rather than silently dropped.
 */
import fs from 'node:fs'
import path from 'node:path'

export const SOUL_FIELDS = [
  'Identity',
  'Mission',
  'Values',
  'Taboos',
  'Methodology Preference',
  'Decision Style',
  'Aesthetic Preference',
  'Learning Policy',
]

const TO_BE_DEFINED = 'To be defined'

function soulPath(root) {
  return path.join(root, 'mind', 'soul', 'core.md')
}

/** Split into a Map of `## heading` → value text (multi-line joined by \n). */
function parseSoul(markdown) {
  const values = new Map()
  let current = null
  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    const h = /^##\s+(.*)$/.exec(line)
    if (h) {
      current = h[1].trim()
      if (!values.has(current)) values.set(current, [])
      continue
    }
    if (current) values.get(current).push(line)
  }
  const out = new Map()
  for (const [key, lines] of values) {
    const text = lines
      .join('\n')
      .replace(/^\s*[-*]\s?/gm, '')
      .trim()
    out.set(key, text)
  }
  return out
}

export function readSoul(root) {
  const file = soulPath(root)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return {
      ok: false,
      error: 'no soul file',
      path: file,
      fields: SOUL_FIELDS.map((name) => ({ name, value: '', placeholder: true })),
      configured: false,
    }
  }
  const parsed = parseSoul(raw)
  const fields = SOUL_FIELDS.map((name) => {
    const value = parsed.get(name) ?? ''
    return {
      name,
      value: value === TO_BE_DEFINED ? '' : value,
      placeholder: value === '' || value === TO_BE_DEFINED,
    }
  })
  // a Soul is configured once every field carries real content
  const configured = fields.every((f) => !f.placeholder)
  return { ok: true, path: file, fields, configured, raw, extra: [...parsed.keys()].filter((k) => !SOUL_FIELDS.includes(k)) }
}

export function writeSoul(root, body) {
  const file = soulPath(root)
  const incoming = body && typeof body.fields === 'object' ? body.fields : null
  if (!incoming) return { ok: false, error: 'body.fields is required' }

  const lines = ['# Soul', '']
  for (const name of SOUL_FIELDS) {
    const raw = incoming[name]
    const value = typeof raw === 'string' ? raw.trim() : ''
    lines.push(`## ${name}`)
    // keep the template's placeholder when the user left the field blank, so an
    // incomplete Soul is still recognisable as unconfigured by the protocol
    lines.push(`- ${value || TO_BE_DEFINED}`)
    lines.push('')
  }

  // preserve any non-standard sections the user added by hand
  let existingExtra = []
  try {
    const prev = parseSoul(fs.readFileSync(file, 'utf8'))
    existingExtra = [...prev.keys()].filter((k) => !SOUL_FIELDS.includes(k))
  } catch {
    /* first write */
  }
  if (existingExtra.length > 0 && body.rawExtra) {
    lines.push(String(body.rawExtra).trim())
    lines.push('')
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  // write via temp + rename so a crash never leaves a half-written Soul
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, lines.join('\n'), 'utf8')
  fs.renameSync(tmp, file)
  return { ok: true, path: file }
}
