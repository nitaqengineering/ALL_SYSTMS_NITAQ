// Runs the real saveSharedWorkspace from the shipped frontend against a mocked Supabase client.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await readFile('public/engineering/shared-workspace.js','utf8');
const start=source.indexOf('async function saveSharedWorkspace()');
const end=source.indexOf('\nwriteDb=function',start);
assert.ok(start>0&&end>start,'saveSharedWorkspace not found');
const body=source.slice(start,end);
const missing={code:'PGRST202',message:'Could not find the function public.nitaq_engineering_workspace_save_v2(p_changes, p_operation, p_settings_after, p_settings_before) in the schema cache',details:''};
const changes=n=>Array.from({length:n},(_,i)=>({id:'p'+i,before:null,after:{id:'p'+i}}));
async function run(count,v2,v1){
 const calls=[],gates=[];
 const state={sharedWorkspaceBusy:false,sharedWorkspaceActor:'actor',sharedWorkspace:{marker:'before'},sharedWorkspaceRevision:1,saveWarning:'',
  sharedWorkspacePending:{request:{p_operation:'00000000-0000-4000-8000-000000000001',p_changes:changes(count),p_settings_before:null,p_settings_after:null},after:{marker:'after'}}};
 const client={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},rpc:async(name,args)=>{calls.push({name,args});const reply=name.endsWith('_v2')?v2:v1;if(reply instanceof Error)throw reply;return reply;}};
 const ctx=vm.createContext({console,Error,JSON,...state,loadAccountingCloudClient:async()=>client,workspaceGate:(message,actions=[])=>gates.push({message,actions:actions.map(a=>a[0])}),closeWorkspaceGate(){},
  downloadWorkspaceDraft(){},refreshSharedWorkspace:async()=>{},startSharedWorkspace:async()=>{},renderKeepingFocus(){},toast(){},document:{getElementById:()=>({})}});
 // Top-level `let` state lives in the script scope; declare it there so the function mutates it.
 vm.runInContext('var sharedWorkspaceBusy,sharedWorkspaceActor,sharedWorkspace,sharedWorkspaceRevision,saveWarning,sharedWorkspacePending;',ctx);
 for(const [key,value] of Object.entries(state))ctx[key]=value;
 vm.runInContext(body,ctx);
 await vm.runInContext('saveSharedWorkspace()',ctx);
 return {calls,gates,saved:ctx.sharedWorkspace.marker==='after',pending:ctx.sharedWorkspacePending,revision:ctx.sharedWorkspaceRevision};
}
const names=r=>r.calls.map(c=>c.name.slice(-2)).join(',');
// v2 present: v1 is never used.
let r=await run(3,{data:{result:'saved',revision:9}},{data:{result:'saved',revision:1}});
assert.equal(names(r),'v2');assert.ok(r.saved);assert.equal(r.revision,9);
// v2 confirmed missing, 100 projects: one v1 call with the identical request, saved.
r=await run(100,{error:missing,status:404},{data:{result:'saved',revision:7}});
assert.equal(names(r),'v2,v1');assert.deepEqual(r.calls[1].args,r.calls[0].args);assert.equal(r.calls[1].args.p_changes.length,100);assert.ok(r.saved);assert.equal(r.pending,null);
// v2 confirmed missing, 101 projects: refused before any v1 call; nothing saved, draft kept for download.
r=await run(101,{error:missing,status:404},{data:{result:'saved'}});
assert.equal(names(r),'v2');assert.ok(!r.saved);assert.ok(r.pending);assert.ok(r.gates.at(-1).actions.includes('تنزيل تعديلاتك'));
// Permission, validation and a 404 that does not name save_v2 stay visible; no fallback.
for(const error of [{code:'42501',message:'Workspace edit denied'},{code:'22023',message:'Permit prerequisites are incomplete'},{code:'PGRST202',message:'Could not find the function public.other_function in the schema cache'}]){
 r=await run(2,{error,status:error.code==='PGRST202'?404:403},{data:{result:'saved'}});
 assert.equal(names(r),'v2',error.code);assert.ok(!r.saved);assert.ok(r.pending);
}
r=await run(2,{error:{code:'42501',message:'x'},status:403},{data:{result:'saved'}});
assert.match(r.gates.at(-1).message,/لا يملك صلاحية/);
// Conflict from v2 is shown as a conflict; no fallback.
r=await run(2,{data:{result:'conflict',project:'109'}},{data:{result:'saved'}});
assert.equal(names(r),'v2');assert.ok(!r.saved);assert.match(r.gates.at(-1).message,/109/);
// Network failure and server errors stay "unconfirmed": pending request kept for an identical retry.
for(const v2 of [new Error('Failed to fetch'),{error:{message:'upstream'},status:503}]){
 r=await run(2,v2,{data:{result:'saved'}});
 assert.equal(names(r),'v2');assert.ok(!r.saved);assert.ok(r.pending);assert.ok(r.gates.at(-1).actions.includes('إعادة تأكيد الحفظ'));
}
// Fallback results are handled like v2 results: conflict, denial and a lost reply are all surfaced.
r=await run(5,{error:missing,status:404},{data:{result:'conflict',project:'109'}});
assert.equal(names(r),'v2,v1');assert.ok(!r.saved);assert.match(r.gates.at(-1).message,/109/);
r=await run(5,{error:missing,status:404},{error:{code:'42501',message:'Project edit denied'},status:403});
assert.ok(!r.saved);assert.match(r.gates.at(-1).message,/لا يملك صلاحية/);
r=await run(5,{error:missing,status:404},new Error('Failed to fetch'));
assert.ok(!r.saved);assert.ok(r.pending);assert.equal(r.pending.request.p_operation,'00000000-0000-4000-8000-000000000001');
r=await run(5,{error:missing,status:404},{data:{result:'already_saved'}});
assert.ok(r.saved);
// Pre-save comparison: cached baseline text must give exactly the same request as a full comparison.
{
 const a=source.indexOf('const workspaceBaselineText'),b=source.indexOf('async function saveSharedWorkspace()');
 assert.ok(a>0&&b>a,'workspaceRequest not found');
 const ctx=vm.createContext({JSON,Map,Set,WeakMap,crypto:{randomUUID:()=>'op'},workspaceSettings:state=>{const {projects,...rest}=state;return rest;}});
 vm.runInContext('var sharedWorkspace;'+source.slice(a,b),ctx);
 const base={custom:{},municipalities:[],projects:Array.from({length:50},(_,i)=>({id:'p'+i,name:'n'+i,stages:{design:{status:'REQ'}}}))};
 const request=after=>{ctx.after=after;return JSON.parse(vm.runInContext('JSON.stringify(workspaceRequest(after))',ctx));};
 ctx.sharedWorkspace=base;
 const same=JSON.parse(JSON.stringify(base));assert.equal(request(same).p_changes.length,0);assert.equal(request(same).p_settings_after,null);
 const next=JSON.parse(JSON.stringify(base));next.projects[7].name='changed';next.projects.push({id:'new',name:'x',stages:{}});next.projects.splice(3,1);
 for(let round=0;round<2;round++){const r=request(next);assert.deepEqual(r.p_changes.map(c=>c.id).sort(),['new','p3','p7']);assert.equal(r.p_changes.find(c=>c.id==='p3').after,null);assert.equal(r.p_changes.find(c=>c.id==='new').before,null);assert.equal(r.p_changes.find(c=>c.id==='p7').before.name,'n7');}
 // After a save the baseline object is replaced; the cache must not return stale text.
 ctx.sharedWorkspace=next;assert.equal(request(JSON.parse(JSON.stringify(next))).p_changes.length,0);
 const settings=JSON.parse(JSON.stringify(next));settings.municipalities=['x'];assert.deepEqual(request(settings).p_settings_after.municipalities,['x']);
 console.log('PASS engineering pre-save comparison: cached baseline detects edits, additions and removals exactly');
}
console.log('PASS engineering save: v1 fallback only on confirmed missing save_v2; 100 saved, 101 refused whole; permission, conflict and network errors stay visible');
