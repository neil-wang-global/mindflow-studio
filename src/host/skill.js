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
 * The skill is kept once, in the shared skill store (`~/.cc-switch/skills`), and
 * every runtime that uses it links to that one copy. Studio reports presence
 * against the store rather than against any single runtime, and installs by
 * copying into the store and linking, so the runtimes cannot drift apart.
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
 * The shared skill store. Skills live here once and runtimes link to them, so a
 * skill found here is the canonical copy.
 */
function storeDir() {
  return path.join(os.homedir(), '.cc-switch', 'skills')
}

/**
 * Runtime skill directories, each scanned live at session start.
 *
 * DSH reads `~/.dsh/skills`; OpenCode reads `~/.config/opencode/skills`. Linking
 * the store into both is what makes one skill available everywhere.
 */
function runtimeSkillDirs() {
  const home = os.homedir()
  return [
    { runtime: 'DSH', dir: path.join(home, '.dsh', 'skills') },
    { runtime: 'OpenCode', dir: path.join(home, '.config', 'opencode', 'skills') },
  ]
}

/**
 * Every place a skill may be found, the store first.
 *
 * Order matters: the store is the canonical copy, so a skill found there is
 * reported as installed even if no runtime has linked it yet.
 */
function skillRoots() {
  return [storeDir(), ...runtimeSkillDirs().map((r) => r.dir)]
}

/** Where Studio keeps its own protocol clone, for reading the runtime tree. */
function studioSkillsDir() {
  return path.join(os.homedir(), '.mindflow', 'studio', 'skills')
}

function cloneDir() {
  return path.join(studioSkillsDir(), 'MindFlow')
}

/** The store entry Studio writes when installing. */
function storeEntry() {
  return path.join(storeDir(), SKILL_NAME)
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

  // Report the runtimes that use this skill, so the panel can show a half-linked
  // install rather than a bare "installed" that hides a runtime missing it.
  const links = runtimeSkillDirs().map(({ runtime, dir }) => {
    const entry = path.join(dir, SKILL_NAME)
    let linked = false
    try {
      linked = fs.statSync(path.join(entry, 'SKILL.md')).isFile()
    } catch {
      linked = false
    }
    return { runtime, dir, entry, linked }
  })

  if (found.installed) {
    return { ...found, canInstall: false, reason: null, links, needsLink: links.filter((l) => !l.linked) }
  }

  // An install needs the store to be writable; the runtimes can be created.
  let storeWritable = false
  try {
    fs.mkdirSync(storeDir(), { recursive: true })
    storeWritable = fs.statSync(storeDir()).isDirectory()
  } catch {
    storeWritable = false
  }

  return {
    ...found,
    canInstall: storeWritable,
    reason: storeWritable ? null : `cannot write to ${storeDir()}`,
    plannedRoot: storeWritable ? storeEntry() : null,
    source: REPO_URL,
    cloneDir: cloneDir(),
    links,
    needsLink: [],
  }
}

/** Copy a directory tree, skipping anything a vcs keeps. */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) copyTree(src, dst)
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(src), dst)
    else fs.copyFileSync(src, dst)
  }
}

/** Point one runtime's skill directory at the store entry. */
function linkInto(entry, target) {
  try {
    fs.mkdirSync(path.dirname(entry), { recursive: true })
    fs.rmSync(entry, { force: true, recursive: false })
    fs.symlinkSync(target, entry, 'dir')
    return null
  } catch (err) {
    return err.message
  }
}

/**
 * Install the skill: fetch it, keep one copy in the store, link every runtime.
 *
 * Idempotent. A second call refreshes the store copy and re-points the links, so
 * a half-finished install — store present but a runtime unlinked — repairs
 * itself rather than needing to be undone first.
 */
export async function installSkill() {
  const existing = findSkill()
  const alreadyInStore = existing.installed && existing.root === storeDir()

  if (!alreadyInStore) {
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
    if (!fs.existsSync(path.join(source, 'SYSTEM.md'))) {
      return { ok: false, error: `${REPO_SUBDIR}/SYSTEM.md is missing; the skill ships the protocol with it`, stage: 'verify' }
    }

    // copy rather than link into the store: the store is the canonical copy, and
    // a link back into a clone would tie it to this clone's lifetime
    try {
      fs.rmSync(storeEntry(), { recursive: true, force: true })
      copyTree(source, storeEntry())
    } catch (err) {
      return { ok: false, error: `could not write ${storeEntry()}: ${err.message}`, stage: 'store' }
    }
  } else {
    // already stored: refresh in place from the clone, so calling this again
    // updates rather than doing nothing
    const target = cloneDir()
    if (fs.existsSync(path.join(target, '.git'))) {
      const pulled = await run('git', ['-C', target, 'pull', '--ff-only', 'origin', 'main'], studioSkillsDir())
      if (pulled.ok) {
        const source = path.join(target, REPO_SUBDIR)
        if (fs.existsSync(path.join(source, 'SKILL.md'))) {
          try {
            fs.rmSync(storeEntry(), { recursive: true, force: true })
            copyTree(source, storeEntry())
          } catch (err) {
            return { ok: false, error: `could not refresh ${storeEntry()}: ${err.message}`, stage: 'store' }
          }
        }
      }
    }
  }

  // link every runtime that has (or can get) a skill directory
  const linked = []
  const failed = []
  for (const { runtime, dir } of runtimeSkillDirs()) {
    // only link where the runtime is actually in use; a missing runtime's config
    // directory is not Studio's to create
    if (!fs.existsSync(path.dirname(dir))) continue
    const err = linkInto(path.join(dir, SKILL_NAME), storeEntry())
    if (err === null) linked.push(runtime)
    else failed.push({ runtime, error: err })
  }

  const verified = findSkill()
  if (!verified.installed) {
    return { ok: false, error: 'store written but the skill is still not discoverable', stage: 'verify' }
  }
  return { ok: true, alreadyInstalled: alreadyInStore, ...verified, linked, failedLinks: failed }
}
