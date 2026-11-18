import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile('public/engineering/version-check.js','utf8');
const signature=source.slice(source.indexOf('  function versionsFrom('),source.indexOf('  const running ='));
function doc({scripts=['app.js?v=1'],links=['app.css?v=1'],styles=['body{color:black}']}={}){
 return {querySelectorAll:selector=>selector==='script[src]'?scripts.map(src=>({getAttribute:()=>src})):selector.startsWith('head link')?links.map(href=>({getAttribute:()=>href})):styles.map(textContent=>({textContent}))};
}
const ctx=vm.createContext({});vm.runInContext(signature,ctx);const base=ctx.versionsFrom(doc());
assert.equal(base,ctx.versionsFrom(doc()));
assert.notEqual(base,ctx.versionsFrom(doc({styles:['body{color:navy}']})),'inline CSS-only release must change the signature');
assert.notEqual(base,ctx.versionsFrom(doc({links:['app.css?v=2']})),'external CSS version change must be detected');
assert.notEqual(base,ctx.versionsFrom(doc({scripts:['other.js?v=1']})),'asset rename with same token must be detected');
assert.equal(base,ctx.versionsFrom(doc({scripts:['app.js?v=1','runtime.js']})),'non-versioned runtime imports do not generate false alerts');
const a=doc({scripts:['b.js?v=2','a.js?v=1']}),b=doc({scripts:['a.js?v=1','b.js?v=2']});
assert.equal(ctx.versionsFrom(a),ctx.versionsFrom(b));
// Execute the whole watcher: same HTML/offline gives no notification; a CSS change does.
let latest=doc(),offline=false,timer,announced=0;
const live=doc();live.hidden=false;live.getElementById=()=>null;live.addEventListener=()=>{};
live.createElement=()=>({setAttribute(){},classList:{add(){},remove(){}},querySelector:()=>({addEventListener(){}})});
live.head={appendChild(){}};live.body={appendChild(){announced++;}};
const runtime=vm.createContext({document:live,DOMParser:class{parseFromString(){return latest;}},fetch:async()=>{if(offline)throw Error('offline');return {ok:true,text:async()=>''};},setTimeout:fn=>{timer=fn;},setInterval(){},requestAnimationFrame:fn=>fn(),location:{reload(){}}});
vm.runInContext(source,runtime);await timer();assert.equal(announced,0);
offline=true;await timer();assert.equal(announced,0);offline=false;
latest=doc({styles:['body{color:navy}']});await timer();assert.equal(announced,1);
await timer();assert.equal(announced,1,'notify once per open page');
console.log('PASS version watcher: inline CSS, versioned stylesheet, script identity, stable order, offline and duplicate notification guards');
// Status is announced by both the toolbar and footer without a blocking overlay.
const shared=await readFile('public/engineering/shared-workspace.js','utf8');
const helper=shared.slice(shared.indexOf('function workspaceSaveStatus('),shared.indexOf('function closeWorkspaceGate()'));
const nodes=Object.fromEntries(['savehint','workspaceSaveStatus'].map(id=>[id,{setAttribute(k,v){this[k]=v;}}]));
const status=vm.createContext({window:{},document:{getElementById:id=>nodes[id]}});vm.runInContext(helper,status);
status.workspaceSaveStatus('جارٍ الحفظ',true);assert.ok(Object.values(nodes).every(n=>n.textContent==='جارٍ الحفظ'&&n['aria-busy']==='true'));
status.workspaceSaveStatus('تم الحفظ',false);assert.equal(status.window.NITAQ_SHARED_SAVING,false);
