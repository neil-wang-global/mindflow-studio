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
export function humanize(value) {
  return String(value ?? '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function createMarkdownRenderer(React) {
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
