// generated from src/client/*.js by scripts/bundle-client.mjs
/**
 * MindFlow Studio — client half.
 *
 * Registers one sidebar panel (`sidebar.panellist`) plus its body (`main`),
 * exactly like the built-in panels. Everything shown here comes from the host
 * route surface under `/mindflow/`; this module holds no state of its own beyond
 * what the user is currently looking at.
 *
 * Design constraint that shapes the whole file: `state.md` is a plain Markdown
 * file a human may edit at any moment, so the UI treats every field as possibly
 * missing and never fills a gap with a plausible-looking default.
 */
window.__ModuleLoader__.load({
  id: 'mindflow-studio',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // ─── markdown.js ───────────────────────────────────────────
    /**
     * Minimal Markdown renderer for artifact preview.
     *
     * MindFlow artifacts are Markdown written by an agent, so the renderer must be
     * safe by construction. Rather than pulling in a full parser plus a sanitizer,
     * this builds React elements directly from a small block/inline subset: there is
     * no `dangerouslySetInnerHTML` anywhere, so raw HTML in an artifact renders as
     * text instead of executing.
     *
     * Covered: headings, paragraphs, unordered/ordered lists (one nesting level),
     * fenced code, blockquotes, tables, horizontal rules, and inline code / bold /
     * italic / links.
     */
    
    function renderInline(text, keyBase) {
      const nodes = []
      let rest = text
      let i = 0
      // token order matters: inline code first, so its contents are never re-parsed
      const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/
    
      while (rest.length > 0) {
        const m = pattern.exec(rest)
        if (!m) {
          nodes.push(rest)
          break
        }
        if (m.index > 0) nodes.push(rest.slice(0, m.index))
        const token = m[0]
        const key = `${keyBase}-${i++}`
    
        if (token.startsWith('`')) {
          nodes.push({ code: token.slice(1, -1), key })
        } else if (token.startsWith('**')) {
          nodes.push({ strong: token.slice(2, -2), key })
        } else if (token.startsWith('*')) {
          nodes.push({ em: token.slice(1, -1), key })
        } else {
          const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
          // only http(s) links become anchors; anything else stays plain text
          if (link && /^https?:\/\//i.test(link[2])) nodes.push({ href: link[2], label: link[1], key })
          else nodes.push(token)
        }
        rest = rest.slice(m.index + token.length)
      }
      return nodes
    }
    
    function inlineToReact(React, nodes, baseKey, styles) {
      return nodes.map((node, idx) => {
        const key = `${baseKey}-${idx}`
        if (typeof node === 'string') return node
        if (node.code !== undefined) return React.createElement('code', { key, style: styles.code }, node.code)
        if (node.strong !== undefined) return React.createElement('strong', { key }, node.strong)
        if (node.em !== undefined) return React.createElement('em', { key }, node.em)
        if (node.href) {
          return React.createElement(
            'a',
            { key, href: node.href, target: '_blank', rel: 'noreferrer noopener', style: styles.link },
            node.label,
          )
        }
        return String(node)
      })
    }
    
    /**
     * Humanise a phase or field name for display: `execution-control` →
     * `Execution Control`, `kb-concept-a` → `Kb Concept A`.
     */
    function humanize(value) {
      return String(value ?? '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    }
    
    function createMarkdownRenderer(React) {
      const h = React.createElement
    
      const styles = {
        code: {
          fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
          fontSize: '0.92em',
          background: 'var(--bg-tertiary, #f4f4f5)',
          padding: '1px 4px',
          borderRadius: 3,
        },
        link: { color: 'var(--accent-strong, #1d4ed8)', textDecoration: 'underline' },
        h1: { fontSize: 18, fontWeight: 600, margin: '16px 0 8px' },
        h2: { fontSize: 15, fontWeight: 600, margin: '14px 0 6px' },
        h3: { fontSize: 13, fontWeight: 600, margin: '12px 0 4px' },
        hN: { fontSize: 12, fontWeight: 600, margin: '10px 0 4px' },
        p: { margin: '0 0 8px', lineHeight: 1.65 },
        li: { margin: '0 0 3px', lineHeight: 1.6 },
        quote: {
          margin: '0 0 8px',
          paddingLeft: 10,
          borderLeft: '3px solid var(--border-default, #e4e4e7)',
          color: 'var(--text-secondary, #71717a)',
        },
        pre: {
          margin: '0 0 10px',
          padding: '8px 10px',
          borderRadius: 6,
          background: 'var(--bg-tertiary, #f4f4f5)',
          overflowX: 'auto',
          fontSize: 11.5,
          lineHeight: 1.55,
          fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        },
        table: { borderCollapse: 'collapse', fontSize: 12, margin: '0 0 10px', width: '100%' },
        th: { border: '1px solid var(--border-default, #e4e4e7)', padding: '4px 8px', textAlign: 'left', background: 'var(--bg-tertiary, #f4f4f5)' },
        td: { border: '1px solid var(--border-default, #e4e4e7)', padding: '4px 8px', verticalAlign: 'top' },
        hr: { border: 'none', borderTop: '1px solid var(--border-default, #e4e4e7)', margin: '12px 0' },
      }
    
      const headingStyle = (level) => (level === 1 ? styles.h1 : level === 2 ? styles.h2 : level === 3 ? styles.h3 : styles.hN)
    
      /** Split a table row into cells, tolerating leading/trailing pipes. */
      const cells = (line) =>
        line
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
    
      const isDivider = (line) => /^\|?[\s:-]+\|[\s:|-]*$/.test(line.trim()) && line.includes('-')
    
      return function renderMarkdown(markdown) {
        const lines = String(markdown ?? '').split(/\r?\n/)
        const blocks = []
        let i = 0
        let key = 0
        const nextKey = () => `b${key++}`
    
        while (i < lines.length) {
          const line = lines[i]
    
          // fenced code
          if (/^\s*```/.test(line)) {
            const body = []
            i++
            while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++])
            i++ // closing fence
            blocks.push(h('pre', { key: nextKey(), style: styles.pre }, body.join('\n')))
            continue
          }
    
          if (!line.trim()) {
            i++
            continue
          }
    
          // heading
          const heading = /^(#{1,6})\s+(.*)$/.exec(line)
          if (heading) {
            const level = heading[1].length
            blocks.push(
              h(`h${level}`, { key: nextKey(), style: headingStyle(level) }, inlineToReact(React, renderInline(heading[2], nextKey()), nextKey(), styles)),
            )
            i++
            continue
          }
    
          // horizontal rule
          if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
            blocks.push(h('hr', { key: nextKey(), style: styles.hr }))
            i++
            continue
          }
    
          // table: a header row followed by a divider row
          if (line.includes('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
            const head = cells(line)
            i += 2
            const rows = []
            while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
              rows.push(cells(lines[i]))
              i++
            }
            blocks.push(
              h(
                'table',
                { key: nextKey(), style: styles.table },
                h('thead', null, h('tr', null, head.map((c, ci) => h('th', { key: ci, style: styles.th }, inlineToReact(React, renderInline(c, `${nextKey()}-${ci}`), nextKey(), styles))))),
                h(
                  'tbody',
                  null,
                  rows.map((row, ri) =>
                    h('tr', { key: ri }, row.map((c, ci) => h('td', { key: ci, style: styles.td }, inlineToReact(React, renderInline(c, `${nextKey()}-${ri}-${ci}`), nextKey(), styles)))),
                  ),
                ),
              ),
            )
            continue
          }
    
          // blockquote
          if (/^\s*>\s?/.test(line)) {
            const body = []
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
              body.push(lines[i].replace(/^\s*>\s?/, ''))
              i++
            }
            blocks.push(h('blockquote', { key: nextKey(), style: styles.quote }, inlineToReact(React, renderInline(body.join(' '), nextKey()), nextKey(), styles)))
            continue
          }
    
          // lists (a single nesting level is enough for these artifacts)
          const isBullet = (l) => /^\s*[-*+]\s+/.test(l)
          const isOrdered = (l) => /^\s*\d+[.)]\s+/.test(l)
          if (isBullet(line) || isOrdered(line)) {
            const ordered = isOrdered(line)
            const items = []
            while (i < lines.length && (isBullet(lines[i]) || isOrdered(lines[i]))) {
              const text = lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
              items.push(text)
              i++
            }
            const listProps = { key: nextKey(), style: { margin: '0 0 8px', paddingLeft: 20 } }
            blocks.push(
              h(
                ordered ? 'ol' : 'ul',
                listProps,
                items.map((item, idx) =>
                  h('li', { key: idx, style: styles.li }, inlineToReact(React, renderInline(item, `li${idx}`), nextKey(), styles)),
                ),
              ),
            )
            continue
          }
    
          // paragraph: consume until a blank line or a block starter
          const para = []
          while (
            i < lines.length &&
            lines[i].trim() &&
            !/^(#{1,6})\s+/.test(lines[i]) &&
            !/^\s*```/.test(lines[i]) &&
            !isBullet(lines[i]) &&
            !isOrdered(lines[i]) &&
            !/^\s*>\s?/.test(lines[i])
          ) {
            para.push(lines[i])
            i++
          }
          blocks.push(h('p', { key: nextKey(), style: styles.p }, inlineToReact(React, renderInline(para.join(' '), nextKey()), nextKey(), styles)))
        }
    
        return blocks
      }
    }
    

    // ─── native-seat.js ───────────────────────────────────────────
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
    function undockConversation(el = null) {
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
    function openHostSession(sessions, sessionId) {
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
    
    function restoreSelection(sessions, saved) {
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
    function createNativeSeat(React, h) {
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
    

    const API = '/mindflow'

    /**
     * Host services, resolved once in `apply`. The panel cannot reach the plugin
     * context directly, so this is the handoff point; keeping it module-scoped
     * also means the native seat can re-read it on every render.
     */
    const host = { sessions: null, useLive: null }

    /** The seat component, created once with our React instance. */
    let NativeSeat = null

    const PHASE_LABELS = {
      'learning-read': 'Learning',
      recognition: 'Recognition',
      analysis: 'Analysis',
      planning: 'Planning',
      'execution-control': 'Execution',
      'learning-acquire': 'Acquire',
      reflection: 'Reflection',
      'terminal-learning': 'Learning',
      completed: 'Done',
      cancelled: 'Cancelled',
    }

    async function getJson(path) {
      const res = await fetch(`${API}/${path}`, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return res.json()
    }

    async function postJson(path, body) {
      const res = await fetch(`${API}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return res.json()
    }

    /** 16px stroke glyph matching the sidebar's panel-icon weight. */
    function icon() {
      return h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        [
          // a mind flowing through stages: three linked nodes on a path
          h('circle', { key: 'a', cx: 3.1, cy: 8, r: 1.6 }),
          h('circle', { key: 'b', cx: 8, cy: 4.2, r: 1.6 }),
          h('circle', { key: 'c', cx: 12.9, cy: 8, r: 1.6 }),
          h('path', { key: 'l1', d: 'M4.4 7 6.7 5.3' }),
          h('path', { key: 'l2', d: 'M9.3 5.3 11.6 7' }),
          h('path', { key: 'l3', d: 'M8 5.8v3.2' }),
          h('circle', { key: 'd', cx: 8, cy: 11.6, r: 1.3 }),
        ],
      )
    }

    const S = {
      root: {
        display: 'flex',
        height: '100%',
        minHeight: 0,
        fontSize: 13,
        color: 'var(--text-primary, #18181b)',
        background: 'var(--bg-primary, #fafafa)',
      },
      nav: {
        width: 236,
        flex: '0 0 236px',
        borderRight: '1px solid var(--border-default, #e4e4e7)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--bg-secondary, #fff)',
      },
      navHead: {
        padding: '10px 12px',
        borderBottom: '1px solid var(--border-default, #e4e4e7)',
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary, #71717a)',
      },
      navList: { overflowY: 'auto', flex: 1, minHeight: 0, padding: 6 },
      main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
      empty: {
        margin: 'auto',
        padding: 24,
        maxWidth: 420,
        textAlign: 'center',
        color: 'var(--text-secondary, #71717a)',
        lineHeight: 1.7,
      },
    }

    function badge(text, tone) {
      const tones = {
        live: { bg: 'var(--accent-subtle, #eff6ff)', fg: 'var(--accent-strong, #1d4ed8)' },
        done: { bg: 'var(--success-subtle, #f0fdf4)', fg: 'var(--success-strong, #15803d)' },
        warn: { bg: 'var(--warning-subtle, #fffbeb)', fg: 'var(--warning-strong, #b45309)' },
        bad: { bg: 'var(--danger-subtle, #fef2f2)', fg: 'var(--danger-strong, #b91c1c)' },
        idle: { bg: 'var(--bg-tertiary, #f4f4f5)', fg: 'var(--text-secondary, #71717a)' },
      }
      const t = tones[tone] || tones.idle
      return h(
        'span',
        {
          style: {
            background: t.bg,
            color: t.fg,
            borderRadius: 4,
            padding: '1px 6px',
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: 'nowrap',
          },
        },
        text,
      )
    }

    /**
     * A task's own `Overall Status` is a claim, not a fact: a killed run leaves
     * `running` in the file forever. The host reports whether the bound DSH
     * session is alive; when the file says running and nothing is alive we show
     * "stalled" so the panel never implies progress that is not happening.
     */
    function statusOf(task, live) {
      const file = task.state?.overallStatus
      if (file === 'completed') return { text: 'Completed', tone: 'done' }
      if (file === 'failed') return { text: 'Failed', tone: 'bad' }
      if (file === 'blocked') return { text: 'Blocked', tone: 'warn' }
      if (file === 'cancelled') return { text: 'Cancelled', tone: 'idle' }
      if (file === 'running') {
        if (live && live.known && !live.alive) return { text: 'Stalled', tone: 'warn' }
        return { text: 'Running', tone: 'live' }
      }
      return { text: file || 'No state', tone: 'idle' }
    }

    function PhaseTrail({ trail, phaseRaw }) {
      if (!trail || trail.length === 0) {
        return h('div', { style: { color: 'var(--text-secondary, #71717a)', fontSize: 12 } }, 'Phase trail unavailable — state.md has no recognised phase')
      }
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', rowGap: 6 } },
        trail.map((entry, i) =>
          h(
            'div',
            { key: `${entry.phase}-${i}`, style: { display: 'flex', alignItems: 'center' } },
            h(
              'div',
              {
                title: entry.phase,
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 9px',
                  borderRadius: 999,
                  fontSize: 12,
                  border: '1px solid',
                  borderColor:
                    entry.state === 'current'
                      ? 'var(--accent-strong, #1d4ed8)'
                      : 'var(--border-default, #e4e4e7)',
                  background:
                    entry.state === 'current'
                      ? 'var(--accent-subtle, #eff6ff)'
                      : entry.state === 'done'
                        ? 'var(--bg-secondary, #fff)'
                        : 'transparent',
                  color:
                    entry.state === 'pending'
                      ? 'var(--text-tertiary, #a1a1aa)'
                      : entry.state === 'current'
                        ? 'var(--accent-strong, #1d4ed8)'
                        : 'var(--text-primary, #18181b)',
                  fontWeight: entry.state === 'current' ? 600 : 400,
                },
              },
              h('span', {
                style: {
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background:
                    entry.state === 'done'
                      ? 'var(--success-strong, #15803d)'
                      : entry.state === 'current'
                        ? 'var(--accent-strong, #1d4ed8)'
                        : 'var(--border-strong, #d4d4d8)',
                },
              }),
              PHASE_LABELS[entry.phase] || entry.phase,
            ),
            i < trail.length - 1
              ? h('span', {
                  key: 'sep',
                  style: { width: 10, height: 1, background: 'var(--border-default, #e4e4e7)', display: 'block' },
                })
              : null,
          ),
        ),
      )
    }

    // ── artifact preview ───────────────────────────────────────────────────

    function ArtifactPane({ task, selected, onSelect }) {
      const [content, setContent] = React.useState(null)
      const [error, setError] = React.useState(null)
      const renderMarkdown = React.useMemo(() => createMarkdownRenderer(React), [])

      React.useEffect(() => {
        if (!selected) {
          setContent(null)
          setError(null)
          return undefined
        }
        let cancelled = false
        setError(null)
        getJson(`artifact?task=${encodeURIComponent(task.taskId)}&path=${encodeURIComponent(selected)}`)
          .then((res) => {
            if (cancelled) return
            if (res.ok) setContent(res)
            else {
              setContent(null)
              setError(res.error || 'cannot read this file')
            }
          })
          .catch((err) => {
            if (!cancelled) setError(String(err.message || err))
          })
        return () => {
          cancelled = true
        }
      }, [task.taskId, selected])

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        h(
          'div',
          { style: { padding: '8px 12px', borderBottom: '1px solid var(--border-default, #e4e4e7)', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #71717a)' } },
          `Artifacts (${task.artifacts.length})`,
        ),
        h(
          'div',
          { style: { overflowY: 'auto', flex: '0 0 40%', minHeight: 60, borderBottom: '1px solid var(--border-default, #e4e4e7)' } },
          task.artifacts.map((a) =>
            h(
              'button',
              {
                key: a.path,
                onClick: () => onSelect(selected === a.path ? null : a.path),
                title: a.path,
                style: {
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 12px',
                  border: 'none',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 11.5,
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  background: selected === a.path ? 'var(--bg-tertiary, #f4f4f5)' : 'transparent',
                  color: 'inherit',
                  fontWeight: selected === a.path ? 600 : 400,
                  wordBreak: 'break-all',
                },
              },
              a.path,
            ),
          ),
        ),
        h(
          'div',
          { style: { overflowY: 'auto', flex: 1, minHeight: 0, padding: '10px 14px' } },
          error
            ? h('div', { style: { fontSize: 12, color: 'var(--danger-strong, #b91c1c)' } }, error)
            : !selected
              ? h('div', { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)' } }, 'Select a file to preview it.')
              : !content
                ? h('div', { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)' } }, 'Loading…')
                : content.kind === 'markdown'
                  ? h('div', { style: { fontSize: 12.5 } }, renderMarkdown(content.content))
                  : h(
                      'pre',
                      {
                        style: {
                          margin: 0,
                          fontSize: 11.5,
                          lineHeight: 1.55,
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        },
                      },
                      content.content,
                    ),
        ),
      )
    }

    // ── plan ───────────────────────────────────────────────────────────────

    /**
     * The Plan is the Task's central artifact: it defines the Steps, what each
     * calls, and whether they may overlap. `state.md` only records how far each
     * Step got, so showing the Plan is what makes the progress readable.
     */
    function PlanPane({ task, steps }) {
      const [plan, setPlan] = React.useState(null)

      React.useEffect(() => {
        let cancelled = false
        setPlan(null)
        getJson(`plan?task=${encodeURIComponent(task.taskId)}`)
          .then((res) => {
            if (!cancelled && res.ok) setPlan(res)
          })
          .catch(() => {
            /* the Plan is optional at this point of a run */
          })
        return () => {
          cancelled = true
        }
      }, [task.taskId])

      const statusOfStep = (index) => {
        const found = (steps || []).find((s) => s.index === index)
        return found ? found.status : 'pending'
      }

      const tone = (status) =>
        status === 'completed'
          ? 'done'
          : status === 'running'
            ? 'live'
            : status === 'failed' || status === 'blocked'
              ? 'bad'
              : 'idle'

      if (!plan) {
        return h('div', { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)' } }, 'Loading plan…')
      }

      if (!plan.exists || !plan.steps || plan.steps.length === 0) {
        return h(
          'div',
          { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)', lineHeight: 1.7, maxWidth: 460 } },
          'No plan.md yet. Planning writes it after Recognition and Analysis, or a compact-mode task folds it into analysis-plan.md.',
        )
      }

      return h(
        'div',
        null,
        plan.objective
          ? h('div', { style: { fontSize: 12.5, lineHeight: 1.6, marginBottom: 10 } }, plan.objective)
          : null,
        plan.parallel
          ? h('div', { style: { marginBottom: 8 } }, badge('Parallel steps', 'warn'))
          : null,
        plan.steps.map((step) => {
          const status = statusOfStep(step.index)
          return h(
            'div',
            {
              key: step.index,
              style: {
                padding: '8px 10px',
                marginBottom: 6,
                borderRadius: 6,
                border: '1px solid var(--border-default, #e4e4e7)',
                background: 'var(--bg-secondary, #fff)',
              },
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' } },
              h('span', { style: { fontSize: 12, fontWeight: 600 } }, `Step ${step.index}`),
              badge(status, tone(status)),
              step.capability ? h('span', { style: { fontSize: 11, color: 'var(--text-secondary, #71717a)', fontFamily: 'var(--font-mono, ui-monospace, monospace)' } }, String(step.capability)) : null,
              step.dispatchMode && !/^sequential$/i.test(String(step.dispatchMode))
                ? badge(String(step.dispatchMode), 'warn')
                : null,
            ),
            step.instructions ? h('div', { style: { fontSize: 11.5, color: 'var(--text-secondary, #71717a)', lineHeight: 1.5 } }, String(step.instructions)) : null,
          )
        }),
      )
    }

    // ── task detail ────────────────────────────────────────────────────────

    function TaskDetail({ task, sessionId }) {
      const [tab, setTab] = React.useState('plan')
      const [artifact, setArtifact] = React.useState(null)

      if (!task) {
        return h('div', { style: S.empty }, 'Select a task on the left, or create one to start a MindFlow run.')
      }

      const st = task.state || {}
      const status = statusOf(task, task.live)

      const row = (label, value) =>
        h(
          'div',
          { style: { display: 'flex', gap: 10, padding: '3px 0', fontSize: 12 } },
          h('span', { style: { width: 100, flex: '0 0 100px', color: 'var(--text-secondary, #71717a)' } }, label),
          h('span', { style: { minWidth: 0, wordBreak: 'break-word' } }, value),
        )

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        // header: identity, status, phase trail
        h(
          'div',
          { style: { padding: '10px 16px', borderBottom: '1px solid var(--border-default, #e4e4e7)' } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
            h('strong', { style: { fontSize: 14 } }, task.taskId),
            badge(status.text, status.tone),
            task.live && task.live.sessionId ? badge('session', 'idle') : null,
          ),
          h(PhaseTrail, { trail: st.trail, phaseRaw: st.phaseRaw }),
        ),
        // body: left = plan/artifacts, right = talk
        h(
          'div',
          { style: { display: 'flex', flex: 1, minHeight: 0 } },
          h(
            'div',
            { style: { flex: '0 0 44%', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--border-default, #e4e4e7)' } },
            h(
              'div',
              { style: { display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--border-default, #e4e4e7)' } },
              ...[
                ['plan', 'Plan'],
                ['artifacts', 'Artifacts'],
                ['state', 'State'],
              ].map(([key, label]) =>
                h(
                  'button',
                  {
                    key,
                    onClick: () => setTab(key),
                    style: {
                      padding: '3px 10px',
                      fontSize: 11.5,
                      borderRadius: 6,
                      cursor: 'pointer',
                      font: 'inherit',
                      border: '1px solid',
                      borderColor: tab === key ? 'var(--border-strong, #d4d4d8)' : 'transparent',
                      background: tab === key ? 'var(--bg-tertiary, #f4f4f5)' : 'transparent',
                      color: 'inherit',
                      fontWeight: tab === key ? 600 : 400,
                    },
                  },
                  label,
                ),
              ),
            ),
            h(
              'div',
              { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } },
              tab === 'plan'
                ? h('div', { style: { padding: '10px 14px', overflowY: 'auto', flex: 1, minHeight: 0 } }, h(PlanPane, { task, steps: st.steps }))
                : tab === 'artifacts'
                  ? h(ArtifactPane, { task, selected: artifact, onSelect: setArtifact })
                  : h(
                      'div',
                      { style: { padding: '10px 14px', overflowY: 'auto', flex: 1, minHeight: 0 } },
                      row('Runtime Root', st.runtimeRoot || '—'),
                      row('Current Step', st.currentStep || '—'),
                      row('Knowledge', st.knowledgeOutcome || '—'),
                      row('Last Failure', st.lastFailure || 'none'),
                      st.retryCount ? row('Retries', String(st.retryCount)) : null,
                      st.steps && st.steps.length > 0
                        ? h(
                            'div',
                            { style: { marginTop: 10 } },
                            h('div', { style: { fontSize: 11.5, color: 'var(--text-secondary, #71717a)', marginBottom: 6 } }, 'Step Status Map'),
                            h(
                              'div',
                              { style: { display: 'flex', flexWrap: 'wrap', gap: 5 } },
                              st.steps.map((s) =>
                                h(
                                  'span',
                                  {
                                    key: s.index,
                                    style: {
                                      fontSize: 11,
                                      padding: '2px 7px',
                                      borderRadius: 4,
                                      border: '1px solid var(--border-default, #e4e4e7)',
                                      background:
                                        s.status === 'completed'
                                          ? 'var(--success-subtle, #f0fdf4)'
                                          : s.status === 'running'
                                            ? 'var(--accent-subtle, #eff6ff)'
                                            : s.status === 'failed' || s.status === 'blocked'
                                              ? 'var(--danger-subtle, #fef2f2)'
                                              : 'transparent',
                                    },
                                  },
                                  `Step ${s.index}: ${s.status}`,
                                ),
                              ),
                            ),
                          )
                        : null,
                    ),
            ),
          ),
          // right: the task's own DSH conversation, docked rather than rebuilt
          h(
            'div',
            { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 } },
            h(
              'div',
              { style: { padding: '8px 12px', borderBottom: '1px solid var(--border-default, #e4e4e7)', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary, #71717a)' } },
              'Conversation',
            ),
            !sessionId
              ? h(
                  'div',
                  { style: { padding: 16, fontSize: 12, color: 'var(--text-secondary, #71717a)', lineHeight: 1.7 } },
                  'This task has no bound session yet. Start it from New task, or run /mindflow for it.',
                )
              : h(NativeSeat, { sessions: host.sessions, sessionId, active: true }),
          ),
        ),
      )
    }

    // ── shared small pieces ────────────────────────────────────────────────

    const SECTION = {
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-default, #e4e4e7)',
    }

    const H2 = { fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-secondary, #71717a)', margin: '0 0 8px' }

    const INPUT = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '6px 8px',
      fontSize: 12,
      fontFamily: 'inherit',
      color: 'inherit',
      background: 'var(--bg-primary, #fafafa)',
      border: '1px solid var(--border-default, #e4e4e7)',
      borderRadius: 6,
      resize: 'vertical',
    }

    function Btn({ children, onClick, disabled, tone = 'default', style }) {
      const tones = {
        default: { background: 'var(--bg-secondary, #fff)', color: 'inherit', border: '1px solid var(--border-default, #e4e4e7)' },
        primary: { background: 'var(--accent-strong, #1d4ed8)', color: '#fff', border: '1px solid transparent' },
      }
      const t = tones[tone] ?? tones.default
      return h(
        'button',
        {
          onClick,
          disabled,
          style: {
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 6,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.55 : 1,
            font: 'inherit',
            ...t,
            ...style,
          },
        },
        children,
      )
    }

    function Field({ label, hint, children }) {
      return h(
        'label',
        { style: { display: 'block', marginBottom: 10 } },
        h('div', { style: { fontSize: 12, fontWeight: 500, marginBottom: 4 } }, label),
        hint ? h('div', { style: { fontSize: 11, color: 'var(--text-secondary, #71717a)', marginBottom: 4 } }, hint) : null,
        children,
      )
    }

    // ── New task form ──────────────────────────────────────────────────────

    const TASK_TYPES = [
      { value: 'delivery', label: 'Delivery', hint: 'produces a concrete artifact' },
      { value: 'learning', label: 'Learning', hint: 'produces knowledge; acquisition expected' },
      { value: 'mixed', label: 'Mixed', hint: 'both artifact and learning' },
    ]

    function NewTaskView({ onCreated }) {
      const [goal, setGoal] = React.useState('')
      const [taskType, setTaskType] = React.useState('delivery')
      const [sources, setSources] = React.useState('')
      const [deliverable, setDeliverable] = React.useState('')
      const [constraints, setConstraints] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)

      async function submit() {
        setBusy(true)
        setError(null)
        try {
          const res = await postJson('task.create', {
            form: { goal, taskType, sources, deliverable, constraints },
          })
          if (!res.ok) {
            setError(res.error || 'could not create the task')
          } else {
            setGoal('')
            setSources('')
            setDeliverable('')
            setConstraints('')
            onCreated?.()
          }
        } catch (err) {
          setError(String(err.message || err))
        } finally {
          setBusy(false)
        }
      }

      return h(
        'div',
        { style: { padding: 16, overflowY: 'auto', maxWidth: 640 } },
        h('h2', { style: H2 }, 'New task'),
        h(
          'div',
          { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)', marginBottom: 14, lineHeight: 1.6 } },
          'The form becomes a task statement. Run under the Runtime Root.',
        ),
        h(
          Field,
          { label: 'Goal', hint: 'Required. What this task must achieve.' },
          h('textarea', {
            value: goal,
            onChange: (e) => setGoal(e.target.value),
            rows: 3,
            style: INPUT,
            placeholder: 'e.g. Analyse how competitors price their tiers and where our gaps are',
          }),
        ),
        h(
          Field,
          { label: 'Task type' },
          h(
            'div',
            { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            TASK_TYPES.map((t) =>
              h(
                'button',
                {
                  key: t.value,
                  onClick: () => setTaskType(t.value),
                  title: t.hint,
                  style: {
                    padding: '4px 10px',
                    fontSize: 12,
                    borderRadius: 999,
                    cursor: 'pointer',
                    font: 'inherit',
                    border: '1px solid',
                    borderColor: taskType === t.value ? 'var(--accent-strong, #1d4ed8)' : 'var(--border-default, #e4e4e7)',
                    background: taskType === t.value ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
                    color: taskType === t.value ? 'var(--accent-strong, #1d4ed8)' : 'inherit',
                  },
                },
                t.label,
              ),
            ),
          ),
        ),
        h(
          Field,
          { label: 'Materials and sources', hint: 'Optional' },
          h('textarea', { value: sources, onChange: (e) => setSources(e.target.value), rows: 2, style: INPUT }),
        ),
        h(
          Field,
          { label: 'Expected deliverable', hint: 'Optional' },
          h('input', { value: deliverable, onChange: (e) => setDeliverable(e.target.value), style: INPUT }),
        ),
        h(
          Field,
          { label: 'Constraints', hint: 'Optional' },
          h('textarea', { value: constraints, onChange: (e) => setConstraints(e.target.value), rows: 2, style: INPUT }),
        ),
        error
          ? h('div', { style: { color: 'var(--danger-strong, #b91c1c)', fontSize: 12, marginBottom: 10 } }, error)
          : null,
        h(Btn, { onClick: submit, disabled: busy || !goal.trim(), tone: 'primary' }, busy ? 'Starting…' : 'Create and run'),
      )
    }

    // ── Soul form ──────────────────────────────────────────────────────────

    function SoulView() {
      const [data, setData] = React.useState(null)
      const [values, setValues] = React.useState({})
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState(null)
      const [error, setError] = React.useState(null)

      const load = React.useCallback(async () => {
        try {
          const d = await getJson('soul')
          setData(d)
          if (d.fields) {
            setValues(Object.fromEntries(d.fields.map((f) => [f.name, f.value])))
          }
        } catch (err) {
          setError(String(err.message || err))
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      async function save() {
        setBusy(true)
        setNote(null)
        setError(null)
        try {
          const res = await postJson('soul', { fields: values })
          if (res.ok) {
            setNote('Saved')
            await load()
          } else {
            setError(res.error || 'save failed')
          }
        } catch (err) {
          setError(String(err.message || err))
        } finally {
          setBusy(false)
        }
      }

      if (error && !data) return h('div', { style: S.empty }, error)
      if (!data) return h('div', { style: S.empty }, 'Loading Soul…')

      const dirty = data.fields.some((f) => (values[f.name] ?? '') !== f.value)

      return h(
        'div',
        { style: { padding: 16, overflowY: 'auto', maxWidth: 680 } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
          h('h2', { style: { ...H2, margin: 0 } }, 'Soul'),
          badge(data.configured ? 'Configured' : 'Not configured', data.configured ? 'done' : 'warn'),
        ),
        h(
          'div',
          { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)', margin: '6px 0 14px', lineHeight: 1.6 } },
          data.ok
            ? 'The highest constraint layer. Written directly to the Runtime Root; every MindFlow module reloads it on entry.'
            : 'No Soul file yet. Saving here creates it in the Runtime Root.',
        ),
        data.fields.map((f) =>
          h(
            Field,
            { key: f.name, label: f.name },
            h('textarea', {
              value: values[f.name] ?? '',
              onChange: (e) => setValues({ ...values, [f.name]: e.target.value }),
              rows: f.name === 'Values' || f.name === 'Taboos' ? 3 : 2,
              style: { ...INPUT, fontFamily: 'inherit' },
              placeholder: 'To be defined',
            }),
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 } },
          h(Btn, { onClick: save, disabled: busy || !dirty, tone: 'primary' }, busy ? 'Saving…' : dirty ? 'Save' : 'Saved'),
          note ? h('span', { style: { fontSize: 12, color: 'var(--success-strong, #15803d)' } }, note) : null,
          error ? h('span', { style: { fontSize: 12, color: 'var(--danger-strong, #b91c1c)' } }, error) : null,
        ),
        h(
          'div',
          { style: { marginTop: 14, fontSize: 11, color: 'var(--text-tertiary, #a1a1aa)', lineHeight: 1.6 } },
          'Empty fields are written as “To be defined” so MindFlow still sees an unconfigured Soul.',
        ),
      )
    }

    // ── Knowledge view ─────────────────────────────────────────────────────

    const TYPE_LABELS = { concept: 'Concept', method: 'Method', domain: 'Domain', self: 'Self', unknown: 'Unclassified' }

    function KnowledgeView() {
      const [scope, setScope] = React.useState('approved')
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)

      React.useEffect(() => {
        let cancelled = false
        getJson(`knowledge?scope=${encodeURIComponent(scope)}`)
          .then((d) => {
            if (!cancelled) {
              setData(d)
              setError(null)
            }
          })
          .catch((err) => {
            if (!cancelled) setError(String(err.message || err))
          })
        return () => {
          cancelled = true
        }
      }, [scope])

      if (error) return h('div', { style: S.empty }, error)
      if (!data) return h('div', { style: S.empty }, 'Loading knowledge…')

      const scopes = data.scopes || ['approved', 'drafts', 'archived']

      return h(
        'div',
        { style: { padding: 16, overflowY: 'auto' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
          h('h2', { style: { ...H2, margin: 0 } }, 'Knowledge'),
          h('span', { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)' } }, `${data.total ?? 0} entries`),
        ),
        h(
          'div',
          { style: { display: 'flex', gap: 6, marginBottom: 14 } },
          scopes.map((s) =>
            h(
              'button',
              {
                key: s,
                onClick: () => setScope(s),
                style: {
                  padding: '4px 10px',
                  fontSize: 12,
                  borderRadius: 999,
                  cursor: 'pointer',
                  font: 'inherit',
                  border: '1px solid',
                  borderColor: scope === s ? 'var(--accent-strong, #1d4ed8)' : 'var(--border-default, #e4e4e7)',
                  background: scope === s ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
                  color: scope === s ? 'var(--accent-strong, #1d4ed8)' : 'inherit',
                },
              },
              s,
            ),
          ),
        ),
        data.total === 0
          ? h(
              'div',
              { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)', lineHeight: 1.7 } },
              scope === 'approved'
                ? 'No approved knowledge yet. Entries appear here after a task promotes them through review.'
                : `No entries in ${scope}.`,
            )
          : (data.groups || []).map((g) =>
              h(
                'div',
                { key: g.type, style: { marginBottom: 18 } },
                h(
                  'div',
                  { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 } },
                  TYPE_LABELS[g.type] || g.type,
                  h('span', { style: { fontWeight: 400, color: 'var(--text-secondary, #71717a)', marginLeft: 6 } }, `${g.entries.length}`),
                ),
                g.entries.map((e) =>
                  h(
                    'div',
                    {
                      key: e.file,
                      style: {
                        padding: '8px 10px',
                        marginBottom: 6,
                        borderRadius: 6,
                        border: '1px solid var(--border-default, #e4e4e7)',
                        background: 'var(--bg-secondary, #fff)',
                      },
                    },
                    h('div', { style: { fontSize: 12, fontWeight: 500, marginBottom: 2 } }, e.title),
                    e.summary ? h('div', { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)', lineHeight: 1.5 } }, e.summary) : null,
                    h(
                      'div',
                      { style: { fontSize: 11, color: 'var(--text-tertiary, #a1a1aa)', marginTop: 4, fontFamily: 'var(--font-mono, ui-monospace, monospace)' } },
                      e.file,
                      e.sourceTask ? ` · ${e.sourceTask}` : '',
                    ),
                  ),
                ),
              ),
            ),
      )
    }

    // ── Capability view ────────────────────────────────────────────────────

    function CapabilitiesView() {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)

      React.useEffect(() => {
        let cancelled = false
        getJson('capabilities')
          .then((d) => {
            if (!cancelled) {
              setData(d)
              setError(null)
            }
          })
          .catch((err) => {
            if (!cancelled) setError(String(err.message || err))
          })
        return () => {
          cancelled = true
        }
      }, [])

      if (error) return h('div', { style: S.empty }, error)
      if (!data) return h('div', { style: S.empty }, 'Loading capabilities…')

      return h(
        'div',
        { style: { padding: 16, overflowY: 'auto' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
          h('h2', { style: { ...H2, margin: 0 } }, 'Capabilities'),
          h('span', { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)' } }, `${data.total ?? 0} defined`),
        ),
        data.total === 0
          ? h(
              'div',
              { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)', lineHeight: 1.7, maxWidth: 460 } },
              'No capability definitions yet. That is the normal bootstrap state: a Step’s Capability label is a classification identifier until a cap-*.md file exists.',
            )
          : (data.groups || []).map((g) =>
              h(
                'div',
                { key: g.key, style: { marginBottom: 18 } },
                h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 } }, g.label),
                g.entries.map((e) =>
                  h(
                    'div',
                    {
                      key: e.file,
                      style: {
                        padding: '8px 10px',
                        marginBottom: 6,
                        borderRadius: 6,
                        border: '1px solid var(--border-default, #e4e4e7)',
                        background: 'var(--bg-secondary, #fff)',
                      },
                    },
                    h(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
                      h('span', { style: { fontSize: 12, fontWeight: 500 } }, e.title),
                      ...(e.updates || []).map((u) => badge(u.status, u.status === 'applied' ? 'done' : 'warn')),
                    ),
                    e.purpose ? h('div', { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)', lineHeight: 1.5 } }, e.purpose) : null,
                    h('div', { style: { fontSize: 11, color: 'var(--text-tertiary, #a1a1aa)', marginTop: 4, fontFamily: 'var(--font-mono, ui-monospace, monospace)' } }, e.file),
                  ),
                ),
              ),
            ),
      )
    }

    // ── Workbench shell ────────────────────────────────────────────────────

    const VIEWS = [
      { key: 'tasks', label: 'Tasks' },
      { key: 'new', label: 'New task' },
      { key: 'soul', label: 'Soul' },
      { key: 'knowledge', label: 'Knowledge' },
      { key: 'capabilities', label: 'Capabilities' },
    ]

    function Panel() {
      const [view, setView] = React.useState('tasks')
      const [runtime, setRuntime] = React.useState(null)
      const [tasks, setTasks] = React.useState([])
      const [selected, setSelected] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [reloadKey, setReloadKey] = React.useState(0)

      React.useEffect(() => {
        let cancelled = false
        let stream = null
        let poll = null

        const apply = (data) => {
          if (cancelled || !data) return
          setRuntime(data.runtime || null)
          setTasks(data.tasks || [])
          setError(null)
          setLoading(false)
        }

        // Push first. `state.md` changes are what the panel shows, so waiting a
        // poll interval to notice them is exactly the lag this avoids.
        if (typeof window.EventSource === 'function') {
          stream = new window.EventSource(`${API}/events`)
          stream.onmessage = (event) => {
            try {
              apply(JSON.parse(event.data))
            } catch {
              /* a partial frame is followed by a complete one */
            }
          }
          // A dropped stream should not leave the panel frozen: fall back to a
          // slow poll so the user still sees progress, just less promptly.
          stream.onerror = () => {
            if (poll !== null) return
            poll = window.setInterval(async () => {
              try {
                apply(await getJson('tasks'))
              } catch {
                /* keep the last good snapshot */
              }
            }, 4000)
          }
        } else {
          poll = window.setInterval(async () => {
            try {
              apply(await getJson('tasks'))
            } catch (err) {
              if (!cancelled) setError(String(err.message || err))
            }
          }, 1500)
        }

        // one immediate read so the first paint is not empty
        getJson('tasks')
          .then(apply)
          .catch((err) => {
            if (!cancelled) {
              setError(String(err.message || err))
              setLoading(false)
            }
          })

        return () => {
          cancelled = true
          if (stream) stream.close()
          if (poll !== null) window.clearInterval(poll)
        }
      }, [reloadKey])

      const current = tasks.find((t) => t.taskId === selected) || (tasks.length > 0 ? tasks[0] : null)

      const navRow = (v) =>
        h(
          'button',
          {
            key: v.key,
            onClick: () => setView(v.key),
            style: {
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 10px',
              marginBottom: 1,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 12,
              background: view === v.key ? 'var(--bg-tertiary, #f4f4f5)' : 'transparent',
              color: 'inherit',
              fontWeight: view === v.key ? 600 : 400,
            },
          },
          v.label,
        )

      let body
      if (view === 'new') {
        body = h(NewTaskView, {
          onCreated: () => {
            setView('tasks')
            setReloadKey((k) => k + 1)
          },
        })
      } else if (view === 'soul') {
        body = h(SoulView)
      } else if (view === 'knowledge') {
        body = h(KnowledgeView)
      } else if (view === 'capabilities') {
        body = h(CapabilitiesView)
      } else {
        body = h(TaskDetail, { task: current, sessionId: current && current.live ? current.live.sessionId : null })
      }

      // The task list belongs beside the task detail, not behind a second click:
      // switching between running tasks is the most frequent action here.
      const taskList =
        view !== 'tasks'
          ? null
          : h(
              'div',
              { style: { borderTop: '1px solid var(--border-default, #e4e4e7)', marginTop: 6, paddingTop: 6, overflowY: 'auto', flex: 1, minHeight: 0 } },
              tasks.length === 0
                ? h(
                    'div',
                    { style: { padding: '4px 10px', fontSize: 11, color: 'var(--text-secondary, #71717a)', lineHeight: 1.6 } },
                    runtime && !runtime.exists
                      ? `No runtime root yet at ${runtime.root}. Run /mindflow once to create it.`
                      : 'No tasks yet.',
                  )
                : tasks.map((t) => {
                    const st = statusOf(t, t.live)
                    const active = current && current.taskId === t.taskId
                    return h(
                      'button',
                      {
                        key: t.taskId,
                        onClick: () => setSelected(t.taskId),
                        style: {
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 10px',
                          marginBottom: 1,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: active ? 'var(--bg-tertiary, #f4f4f5)' : 'transparent',
                          color: 'inherit',
                          font: 'inherit',
                        },
                      },
                      h('div', { style: { fontSize: 12, fontWeight: active ? 600 : 400, wordBreak: 'break-all' } }, t.taskId),
                      h(
                        'div',
                        { style: { fontSize: 11, color: 'var(--text-secondary, #71717a)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
                        badge(st.text, st.tone),
                        h('span', null, PHASE_LABELS[t.state?.phase] || t.state?.phase || '—'),
                      ),
                    )
                  }),
            )

      return h(
        'div',
        { style: S.root },
        h(
          'div',
          { style: S.nav },
          h('div', { style: S.navHead }, 'MindFlow Studio'),
          h('div', { style: { padding: 6 } }, VIEWS.map(navRow)),
          taskList,
          h(
            'div',
            { style: { borderTop: '1px solid var(--border-default, #e4e4e7)', padding: '8px 12px', fontSize: 10, color: 'var(--text-tertiary, #a1a1aa)', lineHeight: 1.5, wordBreak: 'break-all' } },
            runtime ? runtime.root : '',
          ),
        ),
        h('div', { style: S.main }, body),
      )
    }

    /** Service lookup tolerant of the gated access some hosts use for ctx. */
    function service(ctx, name) {
      if (!ctx) return null
      try {
        if (ctx[name]) return ctx[name]
      } catch {
        /* gated property access */
      }
      if (typeof ctx.get === 'function') {
        try {
          return ctx.get(name) ?? null
        } catch {
          return null
        }
      }
      return null
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      // The seat needs the host's session service to switch which conversation
      // the docked surface shows.
      host.sessions = service(ctx, 'sessions')
      NativeSeat = createNativeSeat(React, h)

      const disposers = [
        slots.inject('main', () =>
          slots.register({ name: 'main', key: 'mindflow-studio', id: 'mindflow-studio', order: 62 }, Panel),
        ),
        slots.inject('sidebar.panellist', () =>
          slots.register({ name: 'sidebar.panellist', id: 'mindflow-studio', order: 62, label: 'MindFlow Studio' }, icon),
        ),
      ]
      return () => {
        // the docked conversation is the host's element, still positioned over our
        // panel box; leaving it there would cover the rest of the app
        undockConversation()
        for (const dispose of disposers) dispose()
      }
    }

    return { inject: ['slots'], apply }
  },
})
