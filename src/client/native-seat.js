/**
 * Native conversation seat.
 *
 * DSH already renders a full conversation surface — streaming output, thinking
 * rows, tool cards, the composer. Re-implementing that inside the panel would
 * mean duplicating all of it and drifting from the host's behaviour.
 *
 * Instead we DOCK the host's existing conversation element: measure the seat
 * box in our panel and position the host root over it with `position: fixed`.
 * The element is never moved in the React tree (no `appendChild`), so React
 * keeps owning it; we only override its inline box for as long as the panel is
 * open, then put the original inline styles back.
 *
 * The conversation shown is the task's own session, so whatever the user types
 * is a normal turn of that session — the same channel the agent already reads.
 */

const HOST_ROOT_ATTR = 'data-mfstudio-docked'

const SAVED_PROPS = [
  'position',
  'top',
  'left',
  'width',
  'height',
  'zIndex',
  'margin',
  'pointerEvents',
  'visibility',
  'boxSizing',
  'right',
  'bottom',
]

/** The host conversation surface, per DSH's own data attribute. */
function findConversationRoot() {
  if (typeof document === 'undefined') return null
  const scroll = document.querySelector('[data-conversation-scroll]')
  if (!scroll || !scroll.parentElement) return null
  return scroll.parentElement
}

function captureInline(el) {
  const saved = {}
  for (const prop of SAVED_PROPS) saved[prop] = el.style[prop]
  return saved
}

function restoreInline(el, saved) {
  if (!el || !saved) return
  for (const prop of SAVED_PROPS) el.style[prop] = saved[prop]
  el.removeAttribute(HOST_ROOT_ATTR)
}

/**
 * Original inline styles per docked element.
 *
 * Keyed by element rather than held as a single "last docked" pair: two panels
 * can be mounted at once (two workspaces, or a remount racing an unmount), and a
 * single slot would let the second dock restore the first element's styles and
 * leave the host conversation at the wrong position. A WeakMap lets an
 * unmounted element be collected without an explicit cleanup.
 */
const dockedStyles = new WeakMap()

function dockTo(el, rect) {
  if (!el || !rect || rect.width < 1 || rect.height < 1) return
  if (!dockedStyles.has(el)) dockedStyles.set(el, captureInline(el))
  el.setAttribute(HOST_ROOT_ATTR, '')
  el.style.boxSizing = 'border-box'
  el.style.position = 'fixed'
  el.style.top = `${Math.round(rect.top)}px`
  el.style.left = `${Math.round(rect.left)}px`
  el.style.width = `${Math.round(rect.width)}px`
  el.style.height = `${Math.round(rect.height)}px`
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.margin = '0'
  el.style.zIndex = '60'
  el.style.pointerEvents = 'auto'
  el.style.visibility = 'visible'
}

/**
 * Restore one docked element, or every docked element when called without one.
 *
 * The panel passes its own element so a closing panel can never un-dock the
 * conversation a still-open panel is showing.
 */
export function undockConversation(el = null) {
  if (el) {
    const saved = dockedStyles.get(el)
    if (saved) {
      restoreInline(el, saved)
      dockedStyles.delete(el)
    }
    return
  }
  // fallback: nothing tracks a full registry, so look for what we marked
  if (typeof document !== 'undefined') {
    for (const node of document.querySelectorAll(`[${HOST_ROOT_ATTR}]`)) {
      const saved = dockedStyles.get(node)
      if (saved) {
        restoreInline(node, saved)
        dockedStyles.delete(node)
      }
    }
  }
}

/** Ask the host to show a session. Missing APIs are skipped, not thrown at. */
export function openHostSession(sessions, sessionId) {
  if (!sessions || !sessionId) return false
  try {
    if (typeof sessions.open === 'function') {
      sessions.open(sessionId)
      return true
    }
  } catch {
    /* the host may refuse a session it no longer tracks */
  }
  return false
}

/** Remember and restore the user's own session selection around the panel. */
function snapshotSelection(sessions) {
  if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== 'function') return null
  try {
    const snap = sessions.list.getSnapshot()
    return { sessionId: snap.current, address: snap.currentAddress }
  } catch {
    return null
  }
}

export function restoreSelection(sessions, saved) {
  if (!sessions || !saved) return
  try {
    if (saved.sessionId && typeof sessions.open === 'function') sessions.open(saved.sessionId)
  } catch {
    /* best effort */
  }
}

/**
 * Seats the host conversation over a placeholder box.
 *
 * `bind.sessionId` selects which conversation to show. While inactive (panel
 * closed, or a view that has no session) the host root is restored and the user
 * is put back on the session they were reading.
 */
export function createNativeSeat(React, h) {
  return function NativeSeat({ sessions, sessionId, active }) {
    const seatRef = React.useRef(null)
    // which host element this seat is currently docking
    const dockedRef = React.useRef(null)

    // remember the user's own selection once, so closing restores it
    const savedRef = React.useRef(null)
    React.useEffect(() => {
      if (active && !savedRef.current) savedRef.current = snapshotSelection(sessions)
      if (!active && savedRef.current) {
        restoreSelection(sessions, savedRef.current)
        savedRef.current = null
      }
    }, [active, sessions])

    // point the host at this task's session while the seat is live
    React.useEffect(() => {
      if (!active || !sessionId) return undefined
      openHostSession(sessions, sessionId)
      return undefined
    }, [active, sessionId, sessions])

    React.useLayoutEffect(() => {
      if (!active || !sessionId) {
        undockConversation(dockedRef.current)
        dockedRef.current = null
        return undefined
      }

      let cancelled = false
      let ro = null
      let mo = null
      let raf = 0

      const update = () => {
        if (cancelled || !seatRef.current) return
        const root = findConversationRoot()
        if (!root) return
        dockedRef.current = root
        dockTo(root, seatRef.current.getBoundingClientRect())
      }

      // rAF-coalesced: scroll and resize both fire in bursts, and a dock that
      // lags one frame reads as jitter against the panel edge
      const schedule = () => {
        if (raf) return
        raf = window.requestAnimationFrame(() => {
          raf = 0
          update()
        })
      }

      const attach = () => {
        update()
        if (seatRef.current && typeof ResizeObserver === 'function') {
          ro = new ResizeObserver(schedule)
          ro.observe(seatRef.current)
        }
        window.addEventListener('scroll', schedule, true)
        window.addEventListener('resize', schedule)
      }

      if (findConversationRoot()) {
        attach()
      } else if (typeof MutationObserver === 'function') {
        // the host may not have mounted its conversation yet
        mo = new MutationObserver(() => {
          if (findConversationRoot()) {
            mo.disconnect()
            mo = null
            attach()
          }
        })
        mo.observe(document.body, { childList: true, subtree: true })
      }

      return () => {
        cancelled = true
        if (raf) window.cancelAnimationFrame(raf)
        if (ro) ro.disconnect()
        if (mo) mo.disconnect()
        window.removeEventListener('scroll', schedule, true)
        window.removeEventListener('resize', schedule)
        // only the element this seat docked; another open panel keeps its own
        undockConversation(dockedRef.current)
        dockedRef.current = null
      }
    }, [active, sessionId])

    if (!active || !sessionId) return null

    return h('div', {
      ref: seatRef,
      'data-native-seat': '',
      style: { position: 'relative', flex: 1, minHeight: 0, width: '100%' },
    })
  }
}
