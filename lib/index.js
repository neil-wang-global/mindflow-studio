// generated from src/host/index.js by scripts/build-host.mjs
/**
 * MindFlow Studio — host half.
 *
 * Serves read-only facts about a MindFlow Runtime Root and starts or steers the
 * DSH session that runs a task. No state is duplicated: every answer is derived
 * from the files on disk at request time, so a task edited by hand in an editor
 * and a task run through the UI look identical to Studio.
 */
import { runtimeInfo, listTasks, readTask, readArtifact } from '../src/host/runtime-root.js'
import { readSoul, writeSoul } from '../src/host/soul.js'
import { listKnowledge } from '../src/host/knowledge.js'
import { listCapabilities } from '../src/host/capabilities.js'
import { sessionFor } from '../src/host/sessions.js'
import { createTaskLauncher, createInterjector } from '../src/host/task-launcher.js'
import { watchRuntime } from '../src/host/watch.js'
import { readPlan } from '../src/host/plan.js'

export const name = 'mindflow-studio'
export const inject = ['webServer', 'agents']
export const optional = ['workspaces', 'sessions', 'uiWorkspace']

export function apply(ctx, config = {}) {
  const ws = ctx.get('webServer')
  if (ws === undefined) return

  const root = () => runtimeInfo(config.runtimeRoot)

  /**
   * Whether a task's session is actually alive.
   *
   * `state.md` alone cannot answer this: a killed run leaves it at `running`
   * forever. The agent registry is the authority, so a task whose file says
   * `running` with no live agent is reported as stalled rather than running.
   */
  function liveness(taskId, info) {
    const sessionId = sessionFor(info.root, taskId)
    if (!sessionId) return { sessionId: null, known: false, alive: false }
    const agents = ctx.get('agents')
    if (!agents || typeof agents.get !== 'function') return { sessionId, known: false, alive: false }
    try {
      const agent = agents.get(sessionId)
      if (!agent) return { sessionId, known: true, alive: false, status: null }
      return { sessionId, known: true, alive: agent.status === 'running', status: agent.status ?? null }
    } catch {
      return { sessionId, known: false, alive: false }
    }
  }

  const launch = createTaskLauncher({ ctx, root })
  const interject = createInterjector({ ctx })

  /** One snapshot shared by the polling route and the SSE stream. */
  function tasksSnapshot() {
    const info = root()
    if (!info.exists) return { ok: true, runtime: info, tasks: [] }
    const tasks = listTasks(info.root).map((t) => ({ ...t, live: liveness(t.taskId, info) }))
    return { ok: true, runtime: info, tasks }
  }

  const routes = {
    'GET runtime': () => ({ ok: true, ...root() }),

    'GET tasks': () => tasksSnapshot(),

    'GET task': (q) => {
      const info = root()
      const task = readTask(info.root, q.id)
      if (!task.hasState) return { ok: false, error: `no state.md in task ${q.id}` }
      return { ok: true, task: { ...task, live: liveness(q.id, info) } }
    },

    'GET artifact': (q) => readArtifact(root().root, q.task, q.path),

    'GET plan': (q) => readPlan(root().root, q.task),

    'GET soul': () => readSoul(root().root),
    'POST soul': (q, body) => writeSoul(root().root, body),

    'GET knowledge': (q) => listKnowledge(root().root, q.scope || 'approved'),
    'GET capabilities': () => listCapabilities(root().root),

    'POST task.create': (q, body) => launch(body),
    'POST task.interject': (q, body) => interject(body),
  }

  function send(res, status, payload) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(payload))
  }

  // `WebServer` has no middleware chain: routes are registered by kind and path,
  // and ONE prefix route owns everything under /mindflow/. Registering a prefix
  // rather than one route per endpoint keeps the route table composition-level
  // and lets the handler dispatch on method + path, as the catalog does upstream.
  const register = typeof ws.register === 'function' ? ws.register.bind(ws) : null
  if (register === null) {
    ctx.logger?.warn?.('[mindflow-studio] webServer has no register(); HTTP surface not mounted')
    return
  }

  // Live updates. One watcher per runtime root feeds every connected panel;
  // a client that cannot hold the stream simply stops receiving pushes and the
  // panel keeps its own slow poll as a fallback.
  let watcher = null
  let watcherRoot = null

  function ensureWatcher() {
    const info = root()
    if (watcher && watcherRoot === info.root) return watcher
    if (watcher) watcher.close()
    watcherRoot = info.root
    watcher = watchRuntime({ root: info.root, snapshot: tasksSnapshot })
    return watcher
  }

  function streamEvents(req, res) {
    const watcher = ensureWatcher()
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // proxies that buffer would defeat the point of streaming
      'x-accel-buffering': 'no',
    })

    const send = (payload) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`)
      } catch {
        /* the socket is gone; the close handler below cleans up */
      }
    }

    send(tasksSnapshot())
    const unsubscribe = watcher.subscribe(send)

    // a comment line every 20s keeps intermediaries from closing an idle stream
    const keepAlive = setInterval(() => {
      try {
        res.write(': keep-alive\n\n')
      } catch {
        /* handled by close */
      }
    }, 20000)

    const cleanup = () => {
      clearInterval(keepAlive)
      unsubscribe()
    }
    req.on('close', cleanup)
    req.on('error', cleanup)
  }

  const dispose = register({
    kind: 'prefix',
    path: '/mindflow',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')

      // the event stream owns its response, so it bypasses the JSON dispatcher
      if (req.method === 'GET' && url.pathname.replace(/\/+$/, '') === '/mindflow/events') {
        return streamEvents(req, res)
      }

      // '/mindflow' and '/mindflow/x' both land here; normalise the remainder
      const rest = url.pathname.slice('/mindflow'.length).replace(/^\/+/, '')

      const key = `${req.method} ${rest}`
      const handler = routes[key]
      if (!handler) return send(res, 404, { ok: false, error: `no route ${key}` })

      const query = Object.fromEntries(url.searchParams.entries())
      try {
        let body = null
        if (req.method === 'POST') {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const text = Buffer.concat(chunks).toString('utf8')
          body = text ? JSON.parse(text) : {}
        }
        send(res, 200, await handler(query, body))
      } catch (err) {
        send(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  })

  return {
    root,
    liveness,
    dispose: () => {
      if (watcher) watcher.close()
      watcher = null
      dispose()
    },
  }
}
