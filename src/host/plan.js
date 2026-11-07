/**
 * Plan reading.
 *
 * `plan.md` is the formal output of Planning and it is what actually defines how
 * a task runs: which Steps exist, what each calls, whether they may run in
 * parallel. `state.md §Step Status Map` only says how far each Step got.
 *
 * MindFlow does not fix the Plan's inner heading names the way it fixes
 * `state.md`, so this reader is deliberately tolerant: it keys on the Step
 * headings and picks up whichever of the canonical fields appear under each.
 * Anything it does not recognise is still returned as raw text, so the panel can
 * show an unusual Plan instead of rendering nothing.
 */

import fs from 'node:fs'

const STEP_HEADING = /^###\s+Step\s+(\d+)\s*$/i

/**
 * Fields the Planning template defines per Step, in the order they read best.
 * Matching is case-insensitive and tolerant of the trailing colon the template
 * uses (`Capability: cap-research`).
 */
const STEP_FIELDS = [
  'Capability',
  'Learning',
  'Dispatch Mode',
  'Parallel Group',
  'Synchronization Point',
  'Merge Owner',
  'Output Isolation',
  'Inputs',
  'Constraints',
  'Instructions',
  'Outputs',
  'Publish To Sources',
  'Completion Criteria',
  'Failure Policy',
]

function fieldKey(line) {
  const m = /^\s*[-*]?\s*([A-Za-z][A-Za-z /()]+?)\s*[:：]\s*(.*)$/.exec(line)
  return m ? { key: m[1].trim(), value: m[2].trim() } : null
}

function stripBullet(line) {
  return line.replace(/^\s*[-*]\s?/, '').trim()
}

/** Split the document on level-2 headings, keeping the text before the first. */
function sections(markdown) {
  const out = []
  let current = { heading: null, lines: [] }
  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    const h2 = /^##\s+(.*)$/.exec(line)
    if (h2) {
      out.push(current)
      current = { heading: h2[1].trim(), lines: [] }
      continue
    }
    current.lines.push(line)
  }
  out.push(current)
  return out
}

/**
 * Parse one Step block. Values may be a single line (`Capability: cap-x`) or an
 * indented list; `Inputs`/`Outputs` are usually the latter.
 */
function parseStepLines(lines) {
  const fields = new Map()
  let currentField = null
  for (const raw of lines) {
    if (!raw.trim()) continue
    const f = fieldKey(raw)
    if (f) {
      currentField = f.key
      fields.set(currentField, [f.value].filter(Boolean))
      continue
    }
    const item = stripBullet(raw)
    if (!item) continue
    if (currentField) fields.get(currentField).push(item)
    // text before any recognised field is dropped: it is template prose
  }

  const pick = (name) => {
    for (const [key, values] of fields) {
      if (key.toLowerCase().replace(/\s+/g, ' ') === name.toLowerCase()) {
        return values.length === 1 ? values[0] : values
      }
    }
    return null
  }

  return {
    capability: pick('Capability'),
    learning: pick('Learning'),
    dispatchMode: pick('Dispatch Mode'),
    parallelGroup: pick('Parallel Group'),
    synchronizationPoint: pick('Synchronization Point'),
    mergeOwner: pick('Merge Owner'),
    inputs: pick('Inputs'),
    outputs: pick('Outputs'),
    failurePolicy: pick('Failure Policy'),
    completionCriteria: pick('Completion Criteria'),
    instructions: pick('Instructions'),
    publishToSources: pick('Publish To Sources'),
  }
}

/**
 * Read `plan.md` for one task.
 *
 * A missing or not-yet-written Plan is a normal state (the task may still be in
 * Recognition), so it is reported as `exists: false` rather than an error.
 */
export function readPlan(root, taskId) {
  const file = `${root}/tasks/${taskId}/plan.md`
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return { ok: true, exists: false, taskId, steps: [] }
  }
  return { ok: true, exists: true, taskId, ...parsePlan(text) }
}

/**
 * Parse Plan text. Exported separately so the shape can be tested without
 * touching the filesystem.
 */
export function parsePlan(markdown) {
  const parts = sections(markdown)

  const objectiveSection = parts.find((p) => p.heading && /objective/i.test(p.heading))
  const objective = objectiveSection
    ? objectiveSection.lines.map(stripBullet).filter(Boolean).join(' ')
    : null

  // Steps live either as `### Step N` inside the document, or as `### Step N`
  // under a `## Steps` section; both reduce to the same heading scan.
  const steps = []
  let active = null
  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    const m = STEP_HEADING.exec(line.trim())
    if (m) {
      if (active) steps.push({ ...active, fields: parseStepLines(active.lines) })
      active = { index: Number(m[1]), lines: [] }
      continue
    }
    // a level-2 heading closes the current step
    if (/^##\s+/.test(line) && active) {
      steps.push({ ...active, fields: parseStepLines(active.lines) })
      active = null
      continue
    }
    if (active) active.lines.push(line)
  }
  if (active) steps.push({ ...active, fields: parseStepLines(active.lines) })

  const normalized = steps
    .map((s) => ({ index: s.index, ...s.fields }))
    .sort((a, b) => a.index - b.index)

  // A compact-mode task replaces analysis.md and plan.md with analysis-plan.md
  return {
    objective,
    mode: normalized.length > 0 ? 'standard' : 'compact-or-unwritten',
    steps: normalized,
    parallel: normalized.some((s) => s.dispatchMode && !/^sequential$/i.test(String(s.dispatchMode))),
  }
}
