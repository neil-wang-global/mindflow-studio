/**
 * Knowledge base listing — READ ONLY.
 *
 * Studio displays what knowledge exists and groups it by the `Type` field the
 * protocol already defines (`concept / method / domain / self`). It does not add
 * a rating field and does not edit entries: `INDEX.md` and `kb-*.md` carry a
 * consistency contract that only the learning pipeline may change.
 *
 * Three scopes mirror the protocol's three directories:
 *   approved/ — the only formal knowledge area
 *   drafts/   — pending review
 *   archived/ — superseded or rejected
 */
import fs from 'node:fs'
import path from 'node:path'

export const KNOWLEDGE_TYPES = ['concept', 'method', 'domain', 'self']

const SCOPES = ['approved', 'drafts', 'archived']

function kbDir(root, scope) {
  return path.join(root, 'mind', 'learning', 'knowledge-base', scope)
}

function readIfExists(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/** Pull `## Heading` → first content line pairs, enough for card metadata. */
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
    const text = lines
      .join('\n')
      .replace(/^\s*[-*]\s?/gm, '')
      .trim()
    values.set(k, text)
  }
  return values
}

/**
 * The protocol's `kb-*.md` template uses the generic `# Knowledge Base Entry`
 * heading for every entry, so the heading carries no identity. Prefer a
 * hand-written title, fall back to a humanised slug from the file name.
 */
function titleOf(markdown, file) {
  const m = /^#\s+(.*)$/m.exec(String(markdown ?? ''))
  const heading = m ? m[1].trim() : null
  const generic = !heading || /^(knowledge base entry|approved knowledge|knowledge entry)$/i.test(heading)
  if (!generic) return heading
  return file
    .replace(/^kb-/, '')
    .replace(/^(concept|method|domain|self)-/, '')
    .replace(/\.md$/, '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * `INDEX.md` is `| File | Type | Summary |` rows. It is the authoritative index
 * while it exists; scanning the directory is the fallback for a workspace whose
 * index was never built or was hand-edited.
 */
function parseIndex(markdown) {
  const rows = []
  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    const cells = trimmed.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    if (cells.length < 3) continue
    if (/^-+$/.test(cells[0].replace(/:/g, '-'))) continue
    if (cells[0].toLowerCase() === 'file') continue
    rows.push({ file: cells[0], type: cells[1].toLowerCase(), summary: cells[2] })
  }
  return rows
}

function entryFromFile(dir, name) {
  const raw = readIfExists(path.join(dir, name))
  if (raw === null) return null
  const s = sections(raw)
  const type = (s.get('type') ?? '').toLowerCase().trim()
  // `Summary` carries editorial rules below the actual one-line summary, so the
  // first line is the summary and the rest is template commentary.
  const summaryLines = (s.get('summary') || '').split('\n').map((l) => l.trim()).filter(Boolean)
  // `Source Lineage` is a nested list; the task id lives on a `Task ID:` line.
  const lineage = s.get('source lineage') || ''
  const taskMatch = /Task ID:\s*(.+)/.exec(lineage)
  return {
    file: name,
    title: titleOf(raw, name),
    type: KNOWLEDGE_TYPES.includes(type) ? type : 'unknown',
    summary: summaryLines[0] || '',
    sourceTask: taskMatch ? taskMatch[1].trim() : null,
    reviewStatus: (s.get('review status') || '').split('\n')[0] || null,
  }
}

export function listKnowledge(root, scope = 'approved') {
  const dir = kbDir(root, scope)
  const indexRaw = readIfExists(path.join(dir, 'INDEX.md'))
  const indexRows = indexRaw ? parseIndex(indexRaw) : []

  let files = []
  try {
    files = fs.readdirSync(dir).filter((n) => n.endsWith('.md') && n !== 'INDEX.md' && n !== 'README.md' && n !== 'TEMPLATE.md')
  } catch {
    // An uninitialised runtime root has no knowledge-base/ yet. That is the normal
    // state before any task runs, not an error, so report an empty set.
    return { ok: true, scope, scopes: SCOPES, root: dir, indexPresent: false, total: 0, groups: [] }
  }

  const entries = files.map((n) => entryFromFile(dir, n)).filter(Boolean)

  // prefer the index's summary, but never let a stale index hide a file on disk
  for (const entry of entries) {
    const row = indexRows.find((r) => r.file === entry.file)
    if (row) {
      if (row.summary) entry.summary = entry.summary || row.summary
      if (entry.type === 'unknown' && KNOWLEDGE_TYPES.includes(row.type)) entry.type = row.type
    }
  }

  const groups = ['concept', 'method', 'domain', 'self', 'unknown'].map((type) => ({
    type,
    entries: entries.filter((e) => e.type === type),
  })).filter((g) => g.entries.length > 0)

  return {
    ok: true,
    scope,
    scopes: SCOPES,
    root: dir,
    indexPresent: indexRaw !== null,
    total: entries.length,
    groups,
  }
}
