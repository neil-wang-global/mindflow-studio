/**
 * Task session binding.
 *
 * A MindFlow task is executed by one DSH session running `/mindflow <task>`.
 * Studio keeps the mapping `taskId → sessionId` in
 * `{runtime}/.studio/sessions.json`.
 *
 * That file lives under the Runtime Root but OUTSIDE any directory the MindFlow
 * protocol defines, so it cannot be mistaken for a protocol artifact and cannot
 * corrupt `state.md`. If it goes missing the only loss is "which session showed
 * this task", which can be rebuilt by starting a new run.
 */
import fs from 'node:fs'
import path from 'node:path'

function storePath(root) {
  return path.join(root, '.studio', 'sessions.json')
}

export function readBindings(root) {
  try {
    const raw = fs.readFileSync(storePath(root), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeBindings(root, data) {
  const file = storePath(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

export function bindSession(root, taskId, sessionId) {
  const data = readBindings(root)
  data[taskId] = { sessionId, boundAt: new Date().toISOString() }
  writeBindings(root, data)
  return data[taskId]
}

export function unbindSession(root, taskId) {
  const data = readBindings(root)
  delete data[taskId]
  writeBindings(root, data)
}

export function sessionFor(root, taskId) {
  return readBindings(root)[taskId]?.sessionId ?? null
}
