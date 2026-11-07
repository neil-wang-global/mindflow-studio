/**
 * File watching for the Runtime Root.
 *
 * Polling every task directory on a timer is what the first version did: it
 * works, but the panel only reacts up to a poll interval late, and the cost grows
 * with the number of tasks. MindFlow writes a handful of small files per task
 * though, so a single recursive `fs.watch` per interesting subtree is cheap and
 * gives near-zero latency.
 *
 * `fs.watch` is not a reliable event source in general (coalescing, duplicate
 * events, platform quirks), so this is a *trigger*, not a source of truth: on any
 * change we re-read the state from disk and send what changed. A missed event
 * therefore delays an update but never corrupts it, and a slow safety poll covers
 * the case where the watcher goes silent.
 */
import fs from 'node:fs'
import path from 'node:path'

const DEBOUNCE_MS = 60
const SAFETY_POLL_MS = 5000

/**
 * @param {object} opts
 * @param {string} opts.root resolved Runtime Root
 * @param {() => unknown} opts.snapshot builds the payload the client consumes
 */
export function watchRuntime({ root, snapshot }) {
  const watchers = []
  const subscribers = new Set()
  let debounce = null
  let poll = null
  let closed = false
  let lastSerialized = null

  /**
   * Build the current payload and hand it to every subscriber.
   *
   * De-duplication compares against the payload *last delivered*, not the last
   * one built: with no subscribers there is nothing to compare against, and
   * marking a payload as delivered would swallow the change for a client that
   * connects a moment later.
   */
  function emit(force = false) {
    if (closed) return null
    let payload
    try {
      payload = snapshot()
    } catch {
      return null
    }
    const serialized = JSON.stringify(payload)

    if (subscribers.size === 0) {
      // keep the baseline current so a new subscriber is not forced a duplicate
      if (force) lastSerialized = serialized
      return payload
    }

    // the watcher fires more than once per logical write; skip identical states
    if (!force && serialized === lastSerialized) return null
    lastSerialized = serialized

    for (const fn of subscribers) {
      try {
        fn(payload)
      } catch {
        /* a broken client must not stop the others */
      }
    }
    return payload
  }

  function schedule() {
    if (closed || debounce) return
    debounce = setTimeout(() => {
      debounce = null
      emit()
    }, DEBOUNCE_MS)
  }

  function watchDir(dir) {
    let handle
    try {
      handle = fs.watch(dir, { recursive: true, persistent: false }, schedule)
    } catch {
      // recursive watch is unsupported on some platforms; the safety poll covers it
      return false
    }
    handle.on('error', () => {
      /* a replaced directory can error; the poll re-establishes state */
    })
    watchers.push(handle)
    return true
  }

  // tasks/ carries every task artifact; mind/ carries Soul and the knowledge base
  const anyRecursive = ['tasks', 'mind', 'capabilities'].map((sub) => watchDir(path.join(root, sub))).some(Boolean)

  // Without a working watcher the safety poll becomes the only trigger, so make
  // it as quick as polling ever was rather than leaving the panel stale.
  poll = setInterval(schedule, anyRecursive ? SAFETY_POLL_MS : 1000)

  /**
   * Add a subscriber and hand it the current payload immediately: a client that
   * connects after the last change would otherwise wait for the next one.
   */
  function subscribe(fn) {
    subscribers.add(fn)
    let payload = null
    try {
      payload = snapshot()
    } catch {
      payload = null
    }
    if (payload !== null) {
      lastSerialized = JSON.stringify(payload)
      try {
        fn(payload)
      } catch {
        /* the caller's own error; do not fail subscription */
      }
    }
    return () => subscribers.delete(fn)
  }

  function close() {
    closed = true
    if (debounce) clearTimeout(debounce)
    if (poll) clearInterval(poll)
    for (const w of watchers) {
      try {
        w.close()
      } catch {
        /* already closed */
      }
    }
    watchers.length = 0
    subscribers.clear()
  }

  return { subscribe, emit, close, watching: anyRecursive }
}
