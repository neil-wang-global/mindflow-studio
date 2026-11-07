import React from 'react'
import TR from 'react-test-renderer'
const { act } = TR
let mod = null
globalThis.window = {
  __ModuleLoader__: { load: ({ factory }) => { mod = factory((n)=>{ if(n==='react') return React; throw new Error(n) }) } },
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
await import('../lib/client.js')
let Panel=null
mod.apply({ get:(n)=> n==='slots' ? { inject:(s,f)=>{f();return()=>{}}, register:(o,c)=>{ if(o.name==='main') Panel=c; return ()=>{} } } : undefined })

const FIX = {
  '/mindflow/tasks': { ok:true, runtime:{root:'/r',exists:true,protocolRoot:'/p',protocolExists:true,soulExists:true}, tasks:[{taskId:'t1',hasState:true,state:{taskId:'t1',runtimeRoot:'/r',phase:'analysis',phaseRaw:'analysis',overallStatus:'running',steps:[],branches:[],trail:[{phase:'analysis',state:'current'}]},artifacts:[],live:{known:true,alive:true}}] },
  '/mindflow/soul': { ok:true, configured:false, fields:[
    {name:'Identity',value:'务实的研究者',placeholder:false},{name:'Mission',value:'',placeholder:true},
    {name:'Values',value:'',placeholder:true},{name:'Taboos',value:'',placeholder:true},
    {name:'Methodology Preference',value:'',placeholder:true},{name:'Decision Style',value:'',placeholder:true},
    {name:'Aesthetic Preference',value:'',placeholder:true},{name:'Learning Policy',value:'',placeholder:true}] },
  '/mindflow/knowledge': { ok:true, scope:'approved', scopes:['approved','drafts','archived'], total:2, indexPresent:true, groups:[
    {type:'concept',entries:[{file:'kb-concept-a.md',title:'有界上下文',summary:'界定模型一致性边界',sourceTask:'20261107-x'}]},
    {type:'method',entries:[{file:'kb-method-b.md',title:'结构化评审',summary:'发布前走检查清单',sourceTask:null}]}] },
  '/mindflow/capabilities': { ok:true, total:1, groups:[{key:'with-pending-update',label:'Pending change',entries:[{file:'cap-research.md',title:'Research',purpose:'调研并产出结构化摘要',updates:[{file:'cu-x.md',status:'proposed'}]}]}] },
}

async function render(viewLabel) {
  globalThis.fetch = async (url) => {
    const path = typeof url === 'string' ? url.split('?')[0] : ''
    return { ok:true, json: async () => FIX[path] ?? { ok:false } }
  }
  let tree
  await act(async () => { tree = TR.create(React.createElement(Panel)); await new Promise(r=>setTimeout(r,20)) })
  // 点击导航项
  const findBtn = (labelText) => {
    const found = []
    ;(function walk(n){ if(!n||typeof n!=='object') return; if(Array.isArray(n)){n.forEach(walk);return}
      if(n.type==='button' && n.children && n.children.some(c=>c===labelText)) found.push(n)
      if(n.children) n.children.forEach(walk) })(tree.toJSON())
    return found[0]
  }
  const btn = findBtn(viewLabel)
  if (btn) await act(async () => { btn.props.onClick(); await new Promise(r=>setTimeout(r,20)) })
  const texts=[]
  ;(function walk(n){ if(n==null)return; if(typeof n==='string'){texts.push(n);return} if(Array.isArray(n)){n.forEach(walk);return} if(n.children)n.children.forEach(walk) })(tree.toJSON())
  const t = texts.join(' | ')
  // textarea/input values are props, not text nodes: collect them so form views
  // can be asserted on what the user would actually see in the field
  const fieldValues = []
  ;(function walk(n){ if(!n||typeof n!=='object') return; if(Array.isArray(n)){n.forEach(walk);return}
    if((n.type==='textarea'||n.type==='input') && n.props && typeof n.props.value==='string') fieldValues.push(n.props.value)
    if(n.children)n.children.forEach(walk) })(tree.toJSON())
  tree.unmount()
  return { t, clicked: !!btn, fields: fieldValues }
}

let r = await render('Tasks')
console.log('Tasks 视图:', r.t.includes('t1')?'✅ 任务显示':'❌', '| 状态:', r.t.includes('Running')?'✅':'❌')

r = await render('Soul')
console.log('Soul 视图:', r.clicked?'✅ 可切换':'❌ 找不到入口')
console.log('  字段完整:', ['Identity','Mission','Values','Taboos','Methodology Preference','Decision Style','Aesthetic Preference','Learning Policy'].every(x=>r.t.includes(x))?'✅':'❌')
console.log('  显示已填值:', r.fields.includes('务实的研究者')?'✅':'❌')
console.log('  未配置徽标:', r.t.includes('Not configured')?'✅':'❌')

r = await render('Knowledge')
console.log('Knowledge 视图:', r.clicked?'✅':'❌')
console.log('  按 Type 分组:', r.t.includes('Concept')&&r.t.includes('Method')?'✅':'❌')
console.log('  条目内容:', r.t.includes('有界上下文')?'✅':'❌')
console.log('  scope 切换:', r.t.includes('approved')&&r.t.includes('drafts')?'✅':'❌')

r = await render('Capabilities')
console.log('Capabilities 视图:', r.clicked?'✅':'❌')
console.log('  Pending change 分组:', r.t.includes('Pending change')?'✅':'❌')
console.log('  能力条目:', r.t.includes('Research')&&r.t.includes('调研并产出结构化摘要')?'✅':'❌')
console.log('  cu 状态徽标:', r.t.includes('proposed')?'✅':'❌')

r = await render('New task')
console.log('New task 视图:', r.clicked?'✅':'❌')
console.log('  表单字段:', ['Goal','Task type','Materials and sources','Expected deliverable','Constraints'].every(x=>r.t.includes(x))?'✅':'❌')
console.log('  类型选项:', r.t.includes('Delivery')&&r.t.includes('Learning')&&r.t.includes('Mixed')?'✅':'❌')
