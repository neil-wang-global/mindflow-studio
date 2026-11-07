// generated from src/client/panel.js by scripts/bundle-client.mjs
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

    const API = '/mindflow'
    const POLL_MS = 1500

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

    function TaskDetail({ task }) {
      if (!task) {
        return h('div', { style: S.empty }, 'Select a task on the left, or create one to start a MindFlow run.')
      }
      const st = task.state || {}
      // the host already attached liveness to the task; reading it here removes a
      // prop that was easy to forget to pass
      const status = statusOf(task, task.live)

      const row = (label, value) =>
        h(
          'div',
          { style: { display: 'flex', gap: 10, padding: '5px 0', fontSize: 12 } },
          h('span', { style: { width: 96, flex: '0 0 96px', color: 'var(--text-secondary, #71717a)' } }, label),
          h('span', { style: { minWidth: 0, wordBreak: 'break-word' } }, value),
        )

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        h(
          'div',
          { style: { padding: '12px 16px', borderBottom: '1px solid var(--border-default, #e4e4e7)' } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
            h('strong', { style: { fontSize: 14 } }, task.taskId),
            badge(status.text, status.tone),
          ),
          h(PhaseTrail, { trail: st.trail, phaseRaw: st.phaseRaw }),
        ),
        h(
          'div',
          { style: { padding: '10px 16px', overflowY: 'auto', flex: 1, minHeight: 0 } },
          row('Runtime Root', st.runtimeRoot || '—'),
          row('Current Step', st.currentStep || '—'),
          row('Knowledge', st.knowledgeOutcome || '—'),
          row('Last Failure', st.lastFailure || 'none'),
          st.retryCount ? row('Retries', String(st.retryCount)) : null,
          st.steps && st.steps.length > 0
            ? h(
                'div',
                { style: { marginTop: 12 } },
                h('div', { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)', marginBottom: 6 } }, 'Steps'),
                h(
                  'div',
                  { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
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
          task.artifacts && task.artifacts.length > 0
            ? h(
                'div',
                { style: { marginTop: 14 } },
                h('div', { style: { fontSize: 12, color: 'var(--text-secondary, #71717a)', marginBottom: 6 } }, `Artifacts (${task.artifacts.length})`),
                h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
                  task.artifacts.map((a) =>
                    h('div', { key: a.path, style: { fontSize: 12, fontFamily: 'var(--font-mono, ui-monospace, monospace)' } }, a.path),
                  ),
                ),
              )
            : null,
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
        let timer = null

        async function tick() {
          try {
            const data = await getJson('tasks')
            if (cancelled) return
            setRuntime(data.runtime || null)
            setTasks(data.tasks || [])
            setError(null)
          } catch (err) {
            if (!cancelled) setError(String(err.message || err))
          } finally {
            if (!cancelled) setLoading(false)
          }
        }

        tick()
        timer = window.setInterval(tick, POLL_MS)
        return () => {
          cancelled = true
          if (timer) window.clearInterval(timer)
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
        body = h(TaskDetail, { task: current })
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

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      const disposers = [
        slots.inject('main', () =>
          slots.register({ name: 'main', key: 'mindflow-studio', id: 'mindflow-studio', order: 62 }, Panel),
        ),
        slots.inject('sidebar.panellist', () =>
          slots.register({ name: 'sidebar.panellist', id: 'mindflow-studio', order: 62, label: 'MindFlow Studio' }, icon),
        ),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    }

    return { inject: ['slots'], apply }
  },
})
