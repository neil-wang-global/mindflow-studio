/**
 * Skill presence and installation.
 *
 * Studio runs each task by prompting a DSH session with `/mindflow`. If that
 * skill is not installed, the session does not know the command and the user
 * sees a run that goes nowhere — with no hint about why.
 *
 * So Studio reports whether the skill is present, and can install it on the
 * user's explicit request. It never installs on its own: a plugin that silently
 * writes into the skill directory would be doing something the user cannot see
 * or attribute.
 *
 * Installation is a shallow clone into a Studio-owned directory plus one
 * symlink into a discovered skill root. A clone keeps the skill updatable with
 * `git pull`, and the symlink is what the runtime actually scans, so the layout
 * matches how every other skill on this machine is installed.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'

const SKILL_NAME = 'mindflow'
// The skill ships inside the protocol repository, so one clone provides both the
// skill and the protocol it executes — which also means the skill's own "find
// the protocol beside me" rule resolves to this clone.
const REPO_URL = 'https://github.com/neil-wang-global/MindFlow.git'
const REPO_SUBDIR = path.join('skills', SKILL_NAME)

/**
 * Roots the DSH runtime scans for skills, most preferred first.
 *
 * `~/.dsh/skills` is DSH's own home; `~/.agents/skills` is the cross-runtime
 * alias. Both are scanned live, so an install here takes effect without a
 * restart.
 */
function skillRoots() {
  const home = os.homedir()
  return [path.join(home, '.dsh', 'skills'), path.join(home, '.agents', 'skills')]
}

/** Where Studio keeps its own clone, separate from the user's other checkouts. */
function studioSkillsDir() {
  return path.join(os.homedir(), '.mindflow', 'studio', 'skills')
}

function cloneDir() {
  return path.join(studioSkillsDir(), 'MindFlow')
}

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: 120000 }, (err, stdout, stderr) => {
      resolve({ ok: err === null, stdout: stdout ?? '', stderr: stderr ?? '', error: err ? String(err.message || err) : null })
    })
  })
}

/**
 * Locate an installed copy.
 *
 * A symlink is followed on purpose: the common install is a link to a clone, and
 * the meaningful answer is whether `SKILL.md` is reachable through it.
 */
export function findSkill() {
  for (const root of skillRoots()) {
    const entry = path.join(root, SKILL_NAME)
    let stat
    try {
      stat = fs.statSync(entry)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    const manifest = path.join(entry, 'SKILL.md')
    if (!fs.existsSync(manifest)) continue
    let target = null
    try {
      target = fs.realpathSync(entry)
    } catch {
      target = null
    }
    return { installed: true, root, path: entry, target, manifest }
  }
  return { installed: false, root: null, path: null, target: null, manifest: null }
}

/** What the panel needs to render the state and decide what to offer. */
export function skillStatus() {
  const found = findSkill()
  if (found.installed) return { ...found, canInstall: false, reason: null }

  // An install is only attempted where a skill root already exists or can be
  // created; otherwise the button would promise something it cannot do.
  const roots = skillRoots()
  const writable = roots.filter((r) => {
    try {
      if (fs.existsSync(r)) return fs.statSync(r).isDirectory()
      fs.mkdirSync(r, { recursive: true })
      return true
    } catch {
      return false
    }
  })

  return {
    ...found,
    canInstall: writable.length > 0,
    reason: writable.length > 0 ? null : 'no writable skill directory found',
    plannedRoot: writable[0] ?? null,
    source: REPO_URL,
    cloneDir: cloneDir(),
  }
}

/**
 * Install the skill.
 *
 * Idempotent: a second call finds the existing clone, fast-forwards it, and
 * re-points the symlink. Failure reports the underlying command output rather
 * than a generic message, because `git` and `ln` failures are specific.
 */
export async function installSkill() {
  const existing = findSkill()
  if (existing.installed) return { ok: true, alreadyInstalled: true, ...existing }

  const target = cloneDir()
  fs.mkdirSync(studioSkillsDir(), { recursive: true })

  if (!fs.existsSync(path.join(target, '.git'))) {
    // shallow: the skill lives in one commit's tree, and a full history only
    // slows the first run down
    const cloned = await run('git', ['clone', '--depth', '1', REPO_URL, target], studioSkillsDir())
    if (!cloned.ok) {
      return { ok: false, error: `git clone failed: ${cloned.stderr.trim() || cloned.error}`, stage: 'clone' }
    }
  } else {
    const pulled = await run('git', ['-C', target, 'pull', '--ff-only', 'origin', 'main'], studioSkillsDir())
    if (!pulled.ok) {
      // a diverged clone is the user's to resolve; report it instead of nuking it
      return { ok: false, error: `git pull failed: ${pulled.stderr.trim() || pulled.error}`, stage: 'pull' }
    }
  }

  const source = path.join(target, REPO_SUBDIR)
  if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
    return { ok: false, error: `clone succeeded but ${REPO_SUBDIR}/SKILL.md is missing`, stage: 'verify' }
  }

  const roots = skillRoots()
  let linkRoot = null
  for (const root of roots) {
    try {
      fs.mkdirSync(root, { recursive: true })
      linkRoot = root
      break
    } catch {
      /* try the next root */
    }
  }
  if (linkRoot === null) return { ok: false, error: 'no writable skill directory', stage: 'link' }

  const linkPath = path.join(linkRoot, SKILL_NAME)
  try {
    // replace a stale or broken entry rather than failing on EEXIST
    try {
      fs.rmSync(linkPath, { force: true, recursive: false })
    } catch {
      /* nothing to replace */
    }
    fs.symlinkSync(source, linkPath, 'dir')
  } catch (err) {
    return { ok: false, error: `could not link into ${linkRoot}: ${err.message}`, stage: 'link' }
  }

  const verified = findSkill()
  if (!verified.installed) {
    return { ok: false, error: 'link created but the skill is still not discoverable', stage: 'verify' }
  }
  return { ok: true, alreadyInstalled: false, ...verified }
}
