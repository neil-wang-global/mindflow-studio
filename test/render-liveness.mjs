import React from 'react'
import TR from 'react-test-renderer'
const { act } = TR
let mod = null
globalThis.window = {
  __ModuleLoader__: { load: ({ factory }) => { mod = factory((n) => { if (n==='react') return React; throw new Error(n) }) } },
  setInterval: () => 0, clearInterval: () => {},
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// silence react's act() warning: this harness drives updates itself
const realError = console.error
console.error = (...a) => { if (String(a[0]).includes('act(')) return; realError(...a) }

function makeTask(overallStatus, live) {
  return {
    ok: true,
    runtime: { root: '/r', source:'default', exists:true, protocolRoot:'/p', protocolExists:true, soulExists:true },
    tasks: [{
      taskId: 't1', hasState: true,
      state: { taskId:'t1', runtimeRoot:'/r', phase:'execution-control', phaseRaw:'execution-control',
        currentStep:'Step 1', overallStatus, overallStatusRaw: overallStatus,
        knowledgeOutcome:null, lastFailure:null, retryCount:0, steps:[], branches:[],
        trail:[{phase:'execution-control',state:'current'}] },
      artifacts: [], live,
    }],
  }
}

await import('/Users/neil/Workspace/mine_craft/mindflow-studio/src/client/panel.js')
let Panel = null
mod.apply({ get:(n)=> n==='slots' ? { inject:(s,f)=>{f();return()=>{}}, register:(o,c)=>{ if(o.name==='main') Panel=c; return ()=>{} } } : undefined })

async function render(data) {
  globalThis.fetch = async () => ({ ok:true, json: async () => data })
  let tree
  await act(async () => { tree = TR.create(React.createElement(Panel)); await new Promise(r=>setTimeout(r,20)) })
  const texts = []
  ;(function walk(n){ if(n==null) return; if(typeof n==='string'){texts.push(n);return} if(Array.isArray(n)){n.forEach(walk);return} if(n.children) n.children.forEach(walk) })(tree.toJSON())
  tree.unmount()
  return texts.join(' | ')
}

// 核心用例：文件说 running，但会话已死 -> 必须显示 Stalled 而非 Running
const dead = await render(makeTask('running', { sessionId:'s', known:true, alive:false, status:'idle' }))
console.log('场景1 (file=running, agent dead):')
console.log('  显示 Stalled:', dead.includes('Stalled'), '| 误显示 Running:', dead.includes('Running'))

const alive = await render(makeTask('running', { sessionId:'s', known:true, alive:true, status:'running' }))
console.log('场景2 (file=running, agent alive):')
console.log('  显示 Running:', alive.includes('Running'), '| 误显示 Stalled:', alive.includes('Stalled'))

const done = await render(makeTask('completed', { sessionId:'s', known:true, alive:false, status:'idle' }))
console.log('场景3 (file=completed):')
console.log('  显示 Completed:', done.includes('Completed'), '| 误显示 Stalled:', done.includes('Stalled'))

const blocked = await render(makeTask('blocked', { sessionId:'s', known:true, alive:true, status:'running' }))
console.log('场景4 (file=blocked, agent running):')
console.log('  显示 Blocked:', blocked.includes('Blocked'))
