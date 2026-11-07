/**
 * Parse a MindFlow `state.md` into structured facts.
 *
 * MindFlow keeps runtime state in Markdown rather than JSON so a human can read
 * and hand-edit it. Studio therefore parses `## Heading` + `- item` pairs with
 * the same leniency a human reader applies:
 *
 *   ## Current Phase
 *   - execution-control
 *
 * Rules, deliberately loose:
 *   - headings may carry a trailing `:`; matching is on the normalised key
 *   - a section runs until the next `##` heading
 *   - list items lose their leading marker
 *   - a field still holding the template placeholder counts as absent
 *
 * Nothing here guesses. A missing phase stays missing so the UI can say so
 * instead of inventing `recognition`.
 */

export const PHASES = [
  'learning-read',
  'recognition',
  'analysis',
  'planning',
  'execution-control',
  'reflection',
  'terminal-learning',
]

export const CONDITIONAL_PHASES = ['learning-acquire']

export const TERMINAL_PHASES = ['completed', 'cancelled']

export const OVERALL_STATUSES = ['running', 'blocked', 'failed', 'completed', 'cancelled']

/**
 * Values a freshly created state.md still carries verbatim from STATE-TEMPLATE.md.
 *
 * Only prose instructions belong here. Enum-ish values (`running`, `no`, `0`,
 * `not-applicable`) are REAL values in a valid state file — `running` is the
 * status a task legitimately holds while it executes — so treating them as
 * placeholders would blank out live state.
 */
const PLACEHOLDERS = new Set([
  'current task id',
  'absolute path of the resolved runtime root for this task (see `system.md §runtime layout`)',
  'active phases: `learning-read / recognition / analysis / planning / execution-control / learning-acquire / reflection / terminal-learning`',
  'pending — not yet planned',
])

function normHeading(raw) {
  return raw
    .trim()
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Split a markdown document into a Map of `normalised heading` → body lines. */
export function splitSections(markdown) {
  const sections = new Map()
  let current = null
  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    const m = /^##\s+(.*)$/.exec(line)
    if (m) {
      current = normHeading(m[1])
      if (!sections.has(current)) sections.set(current, [])
      continue
    }
    if (current) sections.get(current).push(line)
  }
  return sections
}

/** Trimmed content lines with list markers stripped. */
function contentLines(lines) {
  const out = []
  for (const raw of lines || []) {
    const line = raw.replace(/^\s*[-*]\s?/, '').trim()
    if (line) out.push(line)
  }
  return out
}

function firstValue(lines) {
  const items = contentLines(lines)
  if (items.length === 0) return null
  const value = items[0].replace(/^`|`$/g, '').trim()
  if (!value) return null
  if (PLACEHOLDERS.has(value.toLowerCase())) return null
  return value
}

/**
 * Parse `Step Status Map` entries (`Step 1: completed`).
 * Sorted numerically so `Step 10` does not land between `Step 1` and `Step 2`.
 */
export function parseStepStatusMap(lines) {
  const steps = []
  for (const line of contentLines(lines)) {
    const m = /^step\s+(\d+)\s*[:：-]\s*(.+)$/i.exec(line)
    if (!m) continue
    steps.push({
      index: Number(m[1]),
      status: m[2].replace(/`/g, '').trim().toLowerCase(),
    })
  }
  steps.sort((a, b) => a.index - b.index)
  return steps
}

/** Parse `Parallel Branch Status`; a lone `none` collapses to an empty array. */
export function parseBranches(lines) {
  const items = contentLines(lines)
  const real = items.filter((item) => item.toLowerCase() !== 'none')
  return real
}

/**
 * `Last Failure` uses `none` for "no failure yet", which is a real answer rather
 * than a missing field. Map it to null so the UI can stay quiet.
 */
function failureValue(lines) {
  const v = firstValue(lines)
  if (v === null) return null
  return v.toLowerCase() === 'none' ? null : v
}

function indexOf(phase) {
  const i = PHASES.indexOf(phase)
  if (i >= 0) return i
  // learning-acquire happens mid Execution Control, before Reflection
  const acquireAt = PHASES.indexOf('reflection')
  return CONDITIONAL_PHASES.includes(phase) ? acquireAt : -1
}

/**
 * Derive the ordered phase trail with a status per phase.
 * `learning-acquire` is only inserted when the task actually entered it, so an
 * ordinary run does not show a permanently grey box.
 */
export function deriveTrail(currentPhase, overallStatus) {
  const finished = TERMINAL_PHASES.includes(currentPhase) || overallStatus === 'completed'
  const currentIndex = indexOf(currentPhase)
  const trail = PHASES.map((phase) => {
    let state
    if (finished) state = 'done'
    else if (phase === currentPhase) state = 'current'
    else state = currentIndex >= 0 && indexOf(phase) < currentIndex ? 'done' : 'pending'
    return { phase, state }
  })
  if (!finished && CONDITIONAL_PHASES.includes(currentPhase)) {
    // slot it right before Reflection, matching where the protocol triggers it
    trail.splice(PHASES.indexOf('reflection'), 0, { phase: currentPhase, state: 'current' })
  }
  return trail
}

/**
 * Full parse. The raw markdown is intentionally not part of the result: callers
 * that need the text fetch it separately, keeping this object cheap enough to
 * push to the browser on every file change.
 */
export function parseState(markdown) {
  const s = splitSections(markdown)

  const rawPhase = firstValue(s.get('current phase'))
  const rawStatus = firstValue(s.get('overall status'))
  const retryRaw = firstValue(s.get('retry count'))

  const known = PHASES.includes(rawPhase) || CONDITIONAL_PHASES.includes(rawPhase) || TERMINAL_PHASES.includes(rawPhase)
  const phase = known ? rawPhase : null

  return {
    taskId: firstValue(s.get('task id')),
    runtimeRoot: firstValue(s.get('runtime root')),
    phase,
    // an unrecognised phase is surfaced verbatim so a hand-edited typo is visible
    phaseRaw: rawPhase,
    currentStep: firstValue(s.get('current step')),
    overallStatus: OVERALL_STATUSES.includes(rawStatus) ? rawStatus : null,
    overallStatusRaw: rawStatus,
    knowledgeOutcome: firstValue(s.get('knowledge outcome')),
    lastFailure: failureValue(s.get('last failure')),
    retryCount: retryRaw === null ? null : Number(retryRaw),
    readyForReflection: firstValue(s.get('ready for reflection')),
    steps: parseStepStatusMap(s.get('step status map')),
    branches: parseBranches(s.get('parallel branch status')),
    trail: deriveTrail(phase, rawStatus),
  }
}
