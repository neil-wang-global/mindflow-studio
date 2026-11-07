import React from 'react'
import TR from 'react-test-renderer'
const { act } = TR

let mod = null
globalThis.window = {
  __ModuleLoader__: { load: ({ factory }) => { mod = factory((n) => { if (n === 'react') return React; throw new Error(n) }) } },
  setInterval: () => 0, clearInterval: () => {},
  // the native seat docks the host conversation root; without a document it
  // no-ops, but it still registers window listeners
  addEventListener: () => {}, removeEventListener: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  EventSource: undefined,
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// silence react's act() warning: this harness drives updates itself
const realError = console.error
console.error = (...a) => { if (String(a[0]).includes('act(')) return; realError(...a) }

const TASKS = {
  ok: true,
  runtime: { root: '/Users/neil/.mindflow/MindFlow/runtime', source: 'default', exists: true, protocolRoot: '/p', protocolExists: true, soulExists: true },
  tasks: [{
    taskId: '20261107-demo-task', hasState: true,
    state: {
      taskId: '20261107-demo-task', runtimeRoot: '/Users/neil/.mindflow/MindFlow/runtime',
      phase: 'execution-control', phaseRaw: 'execution-control', currentStep: 'Step 2',
      overallStatus: 'running', overallStatusRaw: 'running',
      knowledgeOutcome: null, lastFailure: null, retryCount: 0,
      steps: [{index:1,status:'completed'},{index:2,status:'running'},{index:3,status:'pending'}],
      branches: [],
      trail: [
        {phase:'learning-read',state:'done'},{phase:'recognition',state:'done'},
        {phase:'analysis',state:'done'},{phase:'planning',state:'done'},
        {phase:'execution-control',state:'current'},{phase:'reflection',state:'pending'},
        {phase:'terminal-learning',state:'pending'},
      ],
    },
    artifacts: [{path:'_output/report.md',size:10,mtime:1}],
    live: { sessionId: 'sess-1', known: true, alive: true, status: 'running' },
  }],
}
const SKILL = { ok: true, installed: true, path: '/fake/skills/mindflow', canInstall: false }

const PLAN = {
  ok: true,
  exists: true,
  taskId: '20261107-demo-task',
  objective: 'produce the deliverable',
  steps: [{ index: 1, capability: 'cap-verification', dispatchMode: 'sequential', instructions: 'write the deliverable' }],
}

globalThis.fetch = async (url) => {
  const path = String(url).split('?')[0]
  if (path.endsWith('/mindflow/skill')) return { ok: true, json: async () => SKILL }
  return { ok: true, json: async () => (path.endsWith('/mindflow/plan') ? PLAN : TASKS) }
}

await import('../lib/client.js')
let Panel = null
mod.apply({ get: (n) => n === 'slots' ? {
  inject: (s,f)=>{f();return ()=>{}},
  register: (o,c)=>{ if(o.name==='main') Panel=c; return ()=>{} },
} : undefined })

let tree
await act(async () => {
  tree = TR.create(React.createElement(Panel))
  await new Promise(r => setTimeout(r, 20))
})
const json = JSON.stringify(tree.toJSON())
console.log('渲染长度:', json.length)

// 收集所有文本
const texts = []
;(function walk(node) {
  if (node == null) return
  if (typeof node === 'string') { texts.push(node); return }
  if (Array.isArray(node)) { node.forEach(walk); return }
  if (node.children) node.children.forEach(walk)
})(tree.toJSON())
const joined = texts.join(' | ')

const checks = {
  '任务ID': joined.includes('20261107-demo-task'),
  '阶段 Execution': joined.includes('Execution'),
  '状态 Running': joined.includes('Running'),
  'Runtime Root 路径': joined.includes('/Users/neil/.mindflow/MindFlow/runtime'),
  'Plan 展示 Step 状态': joined.includes('Step 1') && joined.includes('completed'),
  'Plan 展示 Capability': joined.includes('cap-verification'),
  'Conversation 区就位': joined.includes('Conversation'),
  '导航齐全': ['Soul','Knowledge','Capabilities'].every(x=>joined.includes(x)),
  '脱离 loading': !joined.includes('Loading MindFlow'),
}
for (const [k,v] of Object.entries(checks)) console.log(` ${v?'✅':'❌'} ${k}`)
