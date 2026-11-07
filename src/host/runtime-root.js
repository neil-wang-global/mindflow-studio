/**
 * Runtime Root resolution and task scanning.
 *
 * Mirrors `SYSTEM.md §Runtime Layout` exactly. Getting this wrong is the one
 * failure that silently reads the wrong tree, so the order and the defaults are
 * duplicated here on purpose rather than inferred from the repo.
 *
 *   1. MINDFLOW_RUNTIME_ROOT
 *   2. <protocolRoot>/runtime
 *   3. an explicit path supplied by the caller
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseState } from '../shared/parse-state.js'

/** Where the MindFlow protocol clone lives, per the /mindflow skill. */
export function protocolRoot() {
  return path.join(os.homedir(), '.mindflow', 'MindFlow')
}

export function resolveRuntimeRoot(explicit) {
  const fromEnv = process.env.MINDFLOW_RUNTIME_ROOT
  if (fromEnv && fromEnv.trim()) return { root: path.resolve(fromEnv.trim()), source: 'env' }
  if (explicit && String(explicit).trim()) return { root: path.resolve(String(explicit).trim()), source: 'explicit' }
  return { root: path.join(protocolRoot(), 'runtime'), source: 'default' }
}

function statSafe(p) {
  try {
    return fs.statSync(p)
  } catch {
    return null
  }
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/** Directory names under `tasks/`, newest first by mtime. */
function listTaskDirs(root) {
  const tasksDir = path.join(root, 'tasks')
  let entries
  try {
    entries = fs.readdirSync(tasksDir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => {
      const dir = path.join(tasksDir, e.name)
      const st = statSafe(dir)
      return { name: e.name, dir, mtime: st ? st.mtimeMs : 0 }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

/** Every markdown artifact directly under a task dir, plus _output/ and cache/. */
function listArtifacts(taskDir) {
  const out = []
  const walk = (dir, prefix) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const abs = path.join(dir, e.name)
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) walk(abs, rel)
      else if (e.isFile()) {
        const st = statSafe(abs)
        out.push({ path: rel, size: st ? st.size : 0, mtime: st ? st.mtimeMs : 0 })
      }
    }
  }
  walk(taskDir, '')
  // state.md is the summary panel's source, not a browsable artifact
  return out.filter((a) => a.path !== 'state.md')
}

/**
 * One task as the UI needs it. `live` is filled in by the caller when it can
 * reach the DSH agent registry; when it cannot, the UI must not claim the task
 * is running.
 */
export function readTask(root, name) {
  const dir = path.join(root, 'tasks', name)
  const statePath = path.join(dir, 'state.md')
  const raw = readText(statePath)
  const st = statSafe(statePath)
  const parsed = raw ? parseState(raw) : null
  return {
    taskId: name,
    dir,
    hasState: raw !== null,
    stateMtime: st ? st.mtimeMs : 0,
    state: parsed,
    artifacts: parsed ? listArtifacts(dir) : [],
  }
}

export function listTasks(root) {
  return listTaskDirs(root).map((d) => readTask(root, d.name))
}

/** Refuse to ship a huge file to the browser; the panel can still show its size. */
const MAX_ARTIFACT_BYTES = 512 * 1024

/**
 * Read one artifact for the preview pane.
 *
 * Containment is checked on the resolved path, so a crafted `relPath` cannot
 * walk out of the task directory. The kind is reported so the viewer can pick a
 * renderer instead of guessing from the text.
 */
export function readArtifact(root, taskId, relPath) {
  const base = path.join(root, 'tasks', taskId)
  const abs = path.resolve(base, relPath)
  if (abs !== base && !abs.startsWith(base + path.sep)) return { ok: false, error: 'path escapes task directory' }

  const st = statSafe(abs)
  if (st === null || !st.isFile()) return { ok: false, error: 'not a file' }
  if (st.size > MAX_ARTIFACT_BYTES) {
    return { ok: false, error: `file is ${Math.round(st.size / 1024)}KB, above the ${MAX_ARTIFACT_BYTES / 1024}KB preview limit` }
  }

  const text = readText(abs)
  if (text === null) return { ok: false, error: 'not readable' }

  const ext = path.extname(abs).toLowerCase()
  const kind = ext === '.md' ? 'markdown' : ext === '.json' ? 'json' : 'text'
  return { ok: true, path: relPath, kind, bytes: st.size, content: text }
}

export function runtimeInfo(explicit) {
  const { root, source } = resolveRuntimeRoot(explicit)
  const st = statSafe(root)
  return {
    root,
    source,
    exists: st !== null && st.isDirectory(),
    protocolRoot: protocolRoot(),
    protocolExists: statSafe(path.join(protocolRoot(), 'SYSTEM.md')) !== null,
    soulExists: statSafe(path.join(root, 'mind', 'soul', 'core.md')) !== null,
  }
}
