/**
 * Capability listing — READ ONLY.
 *
 * Studio shows what capabilities exist. It does NOT invent a rating field:
 * `cap-{name}.md` has no `Status` in the protocol's template, so grouping
 * capabilities "by status" would mean reading a field that does not exist.
 *
 * What the protocol actually provides:
 *   - `capabilities/cap-{name}.md`        the capability definition (no status)
 *   - `mind/learning/capability-updates/cu-*.md`  change records carrying
 *     `Status: proposed / approved / applied` — this is where capability
 *     lifecycle genuinely lives
 *
 * So the list groups by what each capability genuinely has:
 *   - definition state: `defined` (has cap-*.md) vs `label-only` (referenced by
 *     a Step but never written — the protocol's normal bootstrap state)
 *   - pending change: whether an open `cu-*.md` targets it
 *
 * This mirrors `capabilities/README.md §Bootstrap`: a label with no definition
 * file is a classification identifier, not a broken capability.
 */
import fs from 'node:fs'
import path from 'node:path'

export const UPDATE_STATUSES = ['applied', 'approved', 'proposed']

function capDir(root) {
  return path.join(root, 'capabilities')
}

function cuDir(root) {
  return path.join(root, 'mind', 'learning', 'capability-updates')
}

function readIfExists(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

function sections(markdown) {
  const out = new Map()
  let key = null
  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    const h = /^##\s+(.*)$/.exec(line)
    if (h) {
      key = h[1].trim().toLowerCase()
      out.set(key, [])
      continue
    }
    if (key) out.get(key).push(line)
  }
  const values = new Map()
  for (const [k, lines] of out) {
    values.set(
      k,
      lines
        .join('\n')
        .replace(/^\s*[-*]\s?/gm, '')
        .trim(),
    )
  }
  return values
}

function firstHeading(markdown) {
  const m = /^#\s+(.*)$/m.exec(String(markdown ?? ''))
  return m ? m[1].trim() : null
}

/**
 * Templates explain each heading with prose ("the one core purpose of this
 * capability"). Those lines are instructions, not content; rendering them as a
 * capability's purpose would misrepresent it.
 */
const TEMPLATE_COMMENTARY = /^(the |when this|when that|required input|optional input|input format|one file defines|what |which |how to|whether |common failure)/i

function bullets(text) {
  if (!text) return []
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s?/, '').trim())
    .filter(Boolean)
    .filter((l) => !TEMPLATE_COMMENTARY.test(l))
}

function entryFromFile(dir, name) {
  const raw = readIfExists(path.join(dir, name))
  if (raw === null) return null
  const s = sections(raw)
  return {
    file: name,
    name: name.replace(/^cap-/, '').replace(/\.md$/, ''),
    title: firstHeading(raw) || name,
    purpose: bullets(s.get('purpose'))[0] || '',
    useWhen: bullets(s.get('use when')),
    inputs: bullets(s.get('inputs')),
  }
}

/** Open `cu-*.md` records, keyed by the capability they target. */
function readCapabilityUpdates(root) {
  const dir = cuDir(root)
  let files
  try {
    files = fs.readdirSync(dir).filter((n) => n.startsWith('cu-') && n.endsWith('.md'))
  } catch {
    return new Map()
  }
  const byTarget = new Map()
  for (const name of files) {
    const s = sections(readIfExists(path.join(dir, name)) || '')
    const status = (s.get('status') || '').split('\n')[0].trim().toLowerCase()
    if (!UPDATE_STATUSES.includes(status)) continue
    const target = (s.get('target capability file') || '').split('\n')[0].trim()
    if (!target) continue
    const capability = target.replace(/^.*cap-/, '').replace(/\.md$/, '')
    if (!byTarget.has(capability)) byTarget.set(capability, [])
    byTarget.get(capability).push({ file: name, status })
  }
  return byTarget
}

export function listCapabilities(root) {
  const dir = capDir(root)
  let files = []
  try {
    files = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith('cap-') && n.endsWith('.md'))
      .filter((n) => !n.includes('EXAMPLE') && !n.includes('TEMPLATE'))
  } catch {
    // bootstrap state: no capabilities/ until the first cap-*.md is created
    return { ok: true, root: dir, total: 0, groups: [] }
  }

  const updates = readCapabilityUpdates(root)
  const entries = files.map((n) => entryFromFile(dir, n)).filter(Boolean).map((e) => ({
    ...e,
    updates: updates.get(e.name) || [],
  }))

  // group by what the protocol actually expresses, not by an invented rating
  const groups = [
    { key: 'with-pending-update', label: 'Pending change', entries: entries.filter((e) => e.updates.length > 0) },
    { key: 'defined', label: 'Defined', entries: entries.filter((e) => e.updates.length === 0) },
  ].filter((g) => g.entries.length > 0)

  return { ok: true, root: dir, total: entries.length, groups }
}
