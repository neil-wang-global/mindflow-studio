/**
 * Markdown renderer. Artifacts are agent-written, so two properties matter:
 * the common block shapes render as the expected elements, and no path produces
 * raw HTML — the renderer builds React elements and never sets innerHTML.
 */
import assert from 'node:assert/strict'

let mod = null
globalThis.window = {
  __ModuleLoader__: {
    load: ({ factory }) => {
      mod = factory((name) => {
        if (name === 'react') throw new Error('markdown.js must not need react at load time')
        throw new Error(name)
      })
    },
  },
}

await import('../src/client/markdown.js')

// the bundle exposes these through the factory scope, so drive it directly
const src = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../src/client/markdown.js', import.meta.url), 'utf8'),
)

let n = 0
const check = (label, fn) => { fn(); n++ }

// Build a tiny React stand-in that records the element tree as plain objects.
const fakeReact = {
  createElement: (type, props, ...children) => ({
    type,
    props: props || {},
    children: children.flat().filter((c) => c !== null && c !== undefined),
  }),
}

const factory = new Function('React', `${src.replace(/^export\s+/gm, '')}\nreturn createMarkdownRenderer(React)`)
const render = factory(fakeReact)

const collect = (node) => {
  if (node === null || node === undefined) return []
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(collect)
  return [node, ...collect(node.children || [])]
}
const textOf = (tree) => collect(tree).filter((x) => typeof x === 'string').join('')
const typesOf = (tree) => collect(tree).filter((x) => typeof x === 'object' && x.type).map((x) => x.type)

check('headings map to h1..h6', () => {
  const t = render('# Title\n\n## Section\n\n### Sub')
  assert.deepEqual(typesOf(t).filter((x) => /^h\d$/.test(x)), ['h1', 'h2', 'h3'])
  assert.ok(textOf(t).includes('Title'))
})

check('an unordered list renders as ul/li', () => {
  const t = render('- one\n- two')
  assert.ok(typesOf(t).includes('ul'))
  assert.equal(typesOf(t).filter((x) => x === 'li').length, 2)
})

check('an ordered list renders as ol', () => {
  const t = render('1. first\n2. second')
  assert.ok(typesOf(t).includes('ol'))
})

check('a fenced code block becomes one pre, not paragraphs', () => {
  const t = render('```\nconst a = 1\nconst b = 2\n```')
  const pres = collect(t).filter((x) => typeof x === 'object' && x.type === 'pre')
  assert.equal(pres.length, 1)
  assert.ok(textOf(pres[0]).includes('const a = 1'))
})

check('a table renders with a header row and cells', () => {
  const t = render('| A | B |\n|---|---|\n| 1 | 2 |')
  assert.ok(typesOf(t).includes('table'))
  assert.equal(typesOf(t).filter((x) => x === 'th').length, 2)
  assert.equal(typesOf(t).filter((x) => x === 'td').length, 2)
})

check('inline code, bold and italic become elements', () => {
  const t = render('mix `code` and **bold** and *italic*')
  const kinds = typesOf(t)
  assert.ok(kinds.includes('code'))
  assert.ok(kinds.includes('strong'))
  assert.ok(kinds.includes('em'))
})

check('a bullet inside a paragraph is not swallowed by it', () => {
  const t = render('A paragraph.\n\n- item one\n- item two')
  assert.ok(typesOf(t).includes('p'))
  assert.ok(typesOf(t).includes('ul'))
})

check('raw HTML in an artifact is inert text, never markup', () => {
  const t = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')
  // no element type comes from the input; everything stays a string
  const kinds = typesOf(t)
  assert.ok(!kinds.includes('script'))
  assert.ok(!kinds.includes('img'))
  assert.ok(textOf(t).includes('<script>alert(1)</script>'))
})

check('an unsafe link scheme does not become an anchor', () => {
  const t = render('[click](javascript:alert(1))')
  const anchors = collect(t).filter((x) => typeof x === 'object' && x.type === 'a')
  assert.equal(anchors.length, 0)
})

check('a normal http link becomes an anchor', () => {
  const t = render('[site](https://example.com)')
  const anchors = collect(t).filter((x) => typeof x === 'object' && x.type === 'a')
  assert.equal(anchors.length, 1)
  assert.equal(anchors[0].props.href, 'https://example.com')
  assert.equal(anchors[0].props.rel, 'noreferrer noopener')
})

check('empty input renders nothing instead of throwing', () => {
  assert.deepEqual(render(''), [])
  assert.deepEqual(render(null), [])
})

console.log(`markdown: ${n} checks passed`)
