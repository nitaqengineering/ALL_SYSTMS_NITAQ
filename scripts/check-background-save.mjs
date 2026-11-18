// Real UI snapshot, diff builder, save handler and writeDb. Delayed RPCs + fake
// timers prove ordering/debounce without a browser or company database.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile('public/engineering/shared-workspace.js','utf8');
const app=await readFile('public/engineering/app.js','utf8');
const baseline={stageSchema:2,custom:{},municipalities:[],projects:['105','106'].map(id=>({id,stages:{munStruct:{status:'REQ'}}}))};
const timers=new Map(),calls=[],gates=[],statuses=[];let timerId=0,operation=0;
const client={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},rpc:(name,args)=>new Promise((resolve,reject)=>calls.push({name,args:structuredClone(args),resolve,reject}))};
const ctx=vm.createContext({db:structuredClone(baseline),sharedWorkspace:structuredClone(baseline),sharedWorkspacePending:null,sharedWorkspaceBusy:false,sharedWorkspaceQueued:false,sharedWorkspaceSaveTimer:null,sharedWorkspaceActor:'actor',sharedWorkspaceRevision:1,saveWarning:'',
 crypto:{randomUUID:()=> 'op-'+(++operation)},setTimeout:(fn,delay)=>{assert.equal(delay,1000);timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
 loadAccountingCloudClient:async()=>client,workspaceSettings:state=>{const {projects,...rest}=state;return rest;},
 workspaceGate:(message,actions)=>gates.push({message,actions}),closeWorkspaceGate(){},workspaceSaveStatus:(message,saving)=>statuses.push({message,saving}),
 renderKeepingFocus(){},toast(){},downloadWorkspaceDraft(){},refreshSharedWorkspace(){},startSharedWorkspace(){},localWriteDb(){throw Error('Unexpected local write');},
 document:{getElementById:()=>null}});
vm.runInContext(app.slice(app.indexOf('function snapshot()'),app.indexOf('function undoLabel('))+source.slice(source.indexOf('const workspaceBaselineText'),source.indexOf('\nrestoreBackup=function()')),ctx);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const edit=(id,status)=>{ctx.id=id;ctx.status=status;vm.runInContext('db.projects.find(p=>p.id===id).stages.munStruct.status=status;writeDb()',ctx);};
const flush=async()=>{assert.equal(timers.size,1);const [id,fn]=[...timers][0];timers.delete(id);fn();await tick();};
const result=(i,value)=>{calls[i].resolve({data:{result:value,revision:i+2}});};
// A rapid burst becomes one request containing the final values, with no overlay.
vm.runInContext("db.municipalities=['City A']",ctx);
edit('105','SUB');edit('105','COM');edit('106','SUB');
assert.equal(calls.length,0);assert.equal(timers.size,1);assert.ok(ctx.sharedWorkspacePending);
await flush();assert.equal(calls.length,1);assert.equal(calls[0].args.p_changes.length,2);
assert.equal(calls[0].args.p_changes[0].after.stages.munStruct.status,'COM');assert.equal(gates.length,0);
// More edits during the RPC never replace its immutable snapshot or operation.
vm.runInContext("db.municipalities=['City B']",ctx);
edit('105','SUB COM');edit('106','OK');assert.equal(calls.length,1);assert.equal(ctx.sharedWorkspaceQueued,true);
result(0,'saved');await tick();assert.equal(timers.size,1);
await flush();assert.equal(calls.length,2);
assert.equal(calls[1].args.p_settings_before.municipalities[0],'City A');assert.equal(calls[1].args.p_settings_after.municipalities[0],'City B');
const next=calls[1].args.p_changes.find(p=>p.id==='105');assert.equal(next.before.stages.munStruct.status,'COM');assert.equal(next.after.stages.munStruct.status,'SUB COM');
result(1,'saved');await tick();assert.equal(ctx.sharedWorkspacePending,null);assert.equal(ctx.sharedWorkspaceBusy,false);assert.equal(gates.length,0);
// Manual save bypasses the debounce and cancels the scheduled callback.
edit('105','COM');assert.equal(timers.size,1);const manual=vm.runInContext('saveSharedWorkspace()',ctx);await tick();
assert.equal(timers.size,0);assert.equal(calls.length,3);result(2,'saved');await manual;
// Lost reply: retain the original operation; queued edits wait until it is confirmed.
edit('105','SUB');await flush();const original=structuredClone(calls[3].args);edit('106','COM');
calls[3].reject(Error('Network reply lost'));await tick();assert.equal(gates.length,1);assert.ok(ctx.sharedWorkspacePending);assert.equal(timers.size,0);
const retry=vm.runInContext('saveSharedWorkspace()',ctx);await tick();assert.deepEqual(calls[4].args,original);
result(4,'already_saved');await retry;assert.equal(timers.size,1);await flush();
assert.equal(calls[5].args.p_changes.length,1);assert.equal(calls[5].args.p_changes[0].id,'106');
result(5,'saved');await tick();assert.equal(ctx.sharedWorkspacePending,null);assert.equal(statuses.at(-1).saving,false);
// Undo before the debounce fires cancels the unsent request entirely.
edit('106','SUB');edit('106','COM');assert.equal(timers.size,0);assert.equal(ctx.sharedWorkspacePending,null);assert.equal(calls.length,6);
// Conflict blocks further flushing and retains every local edit for recovery.
edit('105','COM');await flush();edit('106','OK');result(6,'conflict');await tick();
assert.ok(ctx.sharedWorkspacePending);assert.equal(ctx.sharedWorkspaceQueued,true);assert.equal(timers.size,0);
assert.equal(ctx.db.projects[1].stages.munStruct.status,'OK');assert.equal(calls.length,7);assert.equal(gates.length,2);
vm.runInContext(source.slice(source.indexOf('restoreBackup=function()'),source.indexOf('async function restoreSharedWorkspace()')),ctx);
assert.throws(()=>vm.runInContext('restoreBackup()',ctx),/انتظر/,'restoration cannot race a pending save');
console.log('PASS background save: 1s debounce, rapid/same-project bursts, sequential CAS baselines, save-now, immutable retry, queue after lost reply, unsent undo and conflict recovery; no routine blocking gate');
