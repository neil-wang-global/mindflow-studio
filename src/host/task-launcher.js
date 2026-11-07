/**
 * Task launching.
 *
 * Studio does not implement MindFlow's protocol — it hands a task statement to
 * the `/mindflow` skill in a fresh DSH session and then reads the resulting
 * `state.md` for progress. One implementation of the protocol exists: the skill
 * plus the cloned repo.
 *
 * The form is deliberately small. The user asked for "a light form with only the
 * important things", so this carries the four fields that actually change the
 * run, composes them into prose, and leaves everything else to the skill.
 */
import { bindSession } from './sessions.js'

/**
 * Compose a task statement.
 *
 * A structured form is friendlier to fill, but MindFlow's `Recognition` reads a
 * natural task statement, so fields are rendered into prose rather than a
 * key/value dump. Empty fields are omitted entirely instead of producing
 * "Not specified" noise the agent has to ignore.
 */
export function composeTaskStatement(form) {
  const goal = String(form?.goal ?? '').trim()
  if (!goal) return { ok: false, error: 'goal is required' }

  const parts = [goal]

  const type = String(form?.taskType ?? '').trim()
  // delivery is the protocol default, so stating it adds nothing
  if (type && type !== 'delivery') parts.push(`Task type: ${type}.`)

  const sources = String(form?.sources ?? '').trim()
  if (sources) parts.push(`Materials and sources to draw on: ${sources}`)

  const deliverable = String(form?.deliverable ?? '').trim()
  if (deliverable) parts.push(`Expected deliverable: ${deliverable}`)

  const constraints = String(form?.constraints ?? '').trim()
  if (constraints) parts.push(`Constraints: ${constraints}`)

  return { ok: true, text: parts.join('\n\n') }
}

/**
 * Deliver a prompt into an existing session.
 *
 * `sessions.binding()` is undefined for a session created via
 * `connectWorkspace` until the scope is materialised, so the reference is held
 * through `sessions.using(id, {source}, fn)` — retain → await ready → act →
 * release. This is the pattern pomasa-studio uses for the same reason.
 */
async function intoSession(sessions, sessionId, action) {
  if (typeof sessions.using === 'function') {
    let done = false
    await sessions.using(sessionId, { source: 'mindflowStudio' }, async (ref) => {
      await ref.ready
      const sess = ref.binding && ref.binding.session
      if (!sess) throw new Error('session unavailable')
      await action(sess)
      done = true
    })
    return done
  }
  const binding = typeof sessions.binding === 'function' ? sessions.binding(sessionId) : null
  const sess = binding && binding.session
  if (!sess) return false
  await action(sess)
  return true
}

/**
 * Resolve (or create) the workspace DSH should run the task in.
 *
 * A task belongs to its Runtime Root, not to the protocol clone: every relative
 * path MindFlow writes resolves under the runtime root, so the session's cwd
 * must be that tree for the skill and the on-disk artifacts to agree.
 */
async function resolveWorkspace(workspaces, cwd) {
  const items = () => {
    try {
      const snap = typeof workspaces.list?.getSnapshot === 'function' ? workspaces.list.getSnapshot() : null
      return snap && Array.isArray(snap.items) ? snap.items : []
    } catch {
      return []
    }
  }
  const match = items().find((w) => w && String(w.path || w.cwd || '') === cwd)
  if (match) return match
  if (typeof workspaces.create === 'function') {
    const created = await workspaces.create({ path: cwd })
    if (created && (created.workspaceId || created.id)) return created
  }
  return null
}

/**
 * Start a task run.
 *
 * `deps` carries the live services so this module stays testable without a DSH
 * runtime: `{ ctx, root }` where `root()` returns the resolved runtime info.
 */
export function createTaskLauncher(deps) {
  const { ctx, root } = deps

  function service(n) {
    const s = ctx.get(n)
    return s === undefined ? null : s
  }

  return async function launch(body) {
    const form = body?.form ?? {}
    const composed = composeTaskStatement(form)
    if (!composed.ok) return composed

    const info = root()
    if (!info.exists) return { ok: false, error: `no runtime root at ${info.root} — run /mindflow once to create it` }
    if (!info.protocolExists) return { ok: false, error: `no MindFlow protocol at ${info.protocolRoot} — run /mindflow once to clone it` }

    const workspaces = service('workspaces') || service('uiWorkspace')
    const sessions = service('sessions')
    if (!workspaces || !sessions) return { ok: false, error: 'DSH workspace/session services unavailable' }

    const connect =
      typeof workspaces.connectWorkspace === 'function'
        ? workspaces.connectWorkspace.bind(workspaces)
        : typeof sessions.create === 'function'
          ? (wid) => sessions.create({ workspaceId: wid })
          : null
    if (!connect) return { ok: false, error: 'no way to create a session in this DSH build' }

    let workspace
    try {
      workspace = await resolveWorkspace(workspaces, info.root)
    } catch (err) {
      return { ok: false, error: `workspace unavailable: ${err?.message || err}` }
    }
    if (!workspace) return { ok: false, error: `could not open a DSH workspace for ${info.root}` }

    let sessionId
    try {
      const wid = workspace.workspaceId ?? workspace.id
      const created = await connect(wid)
      sessionId = created && typeof created === 'object' ? (created.id ?? created.sessionId) : created
    } catch (err) {
      return { ok: false, error: `could not create a session: ${err?.message || err}` }
    }
    if (!sessionId) return { ok: false, error: 'session service returned no session id' }

    // The skill owns runtime-root resolution, so the prompt names the tree once;
    // the /mindflow skill then follows SYSTEM.md for everything else.
    const prompt = `/mindflow ${composed.text}\n\nRuntime Root: ${info.root}`

    try {
      const delivered = await intoSession(sessions, sessionId, async (sess) => {
        if (typeof sess.prompt !== 'function') throw new Error('session has no prompt channel')
        await sess.prompt([{ type: 'text', text: prompt }], 'queue')
      })
      if (!delivered) return { ok: false, error: 'session was created but could not be prompted' }
    } catch (err) {
      return { ok: false, error: `could not start the task: ${err?.message || err}` }
    }

    const taskId = provisionalTaskId(form)
    bindSession(info.root, taskId, sessionId)
    return { ok: true, sessionId, taskId, statement: composed.text, workspace: workspace.title ?? null }
  }
}

/**
 * The task id belongs to the agent: it chooses `tasks/{task-id}/` per
 * `CONTRIBUTING.md`. Studio seeds a provisional key from the goal so the run is
 * addressable immediately; the panel reconciles to the real id once `state.md`
 * appears.
 */
export function provisionalTaskId(form) {
  const slug = String(form?.goal ?? 'task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${stamp}-${slug || 'task'}`
}

/** Send a follow-up question into a running task's session. */
export function createInterjector(deps) {
  const { ctx } = deps
  return async function interject(body) {
    const sessionId = String(body?.sessionId ?? '').trim()
    const text = String(body?.text ?? '').trim()
    if (!sessionId) return { ok: false, error: 'sessionId is required' }
    if (!text) return { ok: false, error: 'text is required' }

    const sessions = ctx.get('sessions')
    if (sessions === undefined) return { ok: false, error: 'session service unavailable' }

    try {
      const delivered = await intoSession(sessions, sessionId, async (sess) => {
        if (typeof sess.prompt !== 'function') throw new Error('session has no prompt channel')
        await sess.prompt([{ type: 'text', text }], 'queue')
      })
      return delivered ? { ok: true, sessionId } : { ok: false, error: 'session not reachable' }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  }
}
