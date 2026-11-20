import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {sourceOf} from './source-tools.mjs';
const ctx=vm.createContext({console});vm.runInContext(await readFile('public/crm/journal.js','utf8'),ctx);
const h=ctx.NitaqCrmJournal,values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,v)=>values.set(key,v),removeItem:key=>values.delete(key)};
const before={id:'lead-1',notes:'old'},item={key:'leads',entity:'lead',id:'lead-1',before,after:{...before,notes:'draft'},revision:1};
const queue=new Map([['lead:lead-1',item]]),batch={id:'12345678-1234-4123-8123-123456789012',items:[item]};
const journal=h.create(storage,'https://example.invalid','actor-a');journal.write(queue,batch);
assert.equal(h.create(storage,'https://example.invalid','actor-b').read(),null);
assert.equal(h.create(storage,'https://other.invalid','actor-a').read(),null);
const restored=h.create(storage,'https://example.invalid','actor-a').read();assert.equal(restored.batch.id,batch.id);assert.deepEqual(JSON.parse(JSON.stringify(restored.items)),[item]);
const oldRaw=storage.getItem(journal.key);storage.setItem(journal.key,'broken');assert.throws(()=>journal.read());assert.equal(storage.getItem(journal.key),'broken');storage.setItem(journal.key,oldRaw);
const full={clients:[{id:'client-1'}],leads:[before,{id:'remote'}],users:[],inter:[],audit:[],tasks:[],lookups:{},projSeq:100};
const over=h.overlay(full,restored.items);assert.equal(over.leads[0].notes,'draft');assert.equal(over.leads[1].id,'remote');assert.equal(full.leads[0].notes,'old');
const src=await sourceOf('public/crm/index.html');
let displayed;
const refs={journalRef:{current:journal},pendingRef:{current:new Map()},pendingActorRef:{current:null},batchRef:{current:null},cloudSyncedRef:{current:null},usersSyncedRef:{current:null},settingsSyncedRef:{current:''},idsRef:{current:{}},dbRef:{current:{ui:{}}},setDb:x=>{displayed=x},setSv:()=>{},NitaqCrmJournal:h};
const context=vm.createContext({console,Map,Set,JSON,...refs});vm.runInContext(src.extract('applyCloudBoot'),context);context.boot={db:full,syncedMap:new Map(),uMap:new Map(),settingsDoc:null};
vm.runInContext("applyCloudBoot(boot,false,'actor-a')",context);
assert.equal(displayed.leads[0].notes,'draft');assert.equal(refs.pendingRef.current.size,1);assert.equal(refs.batchRef.current.id,batch.id);assert.equal(refs.pendingActorRef.current,'actor-a');
// A local storage failure rejects a new edit before the visible state or queue is replaced.
let changed=false;
const commitRefs={dbRef:{current:full},cloudRef:{current:{status:'ready',profile:{auth_user_id:'actor-a'}}},pendingActorRef:{current:null},pendingRef:{current:new Map()},batchRef:{current:null},baselineFor:c=>c.before,NitaqCrmSafety:null,uid:()=> 'audit-1',me:{id:'profile-1'},diffDb:()=>[],writeCrmJournal:()=>{throw Error('quota')},setDb:()=>{changed=true},toast:()=>{},undoRef:{current:[]},setUndoN:()=>{},UNDO_MAX:10};
const commitCtx=vm.createContext({console,Map,Set,Date,...commitRefs});vm.runInContext(await readFile('public/crm/safety.js','utf8'),commitCtx);vm.runInContext(src.extract('commit'),commitCtx);commitCtx.next=over;
assert.equal(vm.runInContext("commit(next,'edit',false)",commitCtx),false);assert.equal(changed,false);assert.equal(commitRefs.pendingRef.current.size,0);
// The original operation id is durably pinned before the actual RPC starts.
let seen;
const flushRefs={...refs,flushBusyRef:{current:false},syncBlockedRef:{current:false},cloudRef:{current:{sb:{rpc:async(name,args)=>{seen=journal.read();return {data:{result:'already_saved'}};}}}},crypto:{randomUUID:()=>batch.id},writeCrmJournal:(q=refs.pendingRef.current,b=refs.batchRef.current)=>journal.write(q,b)};
flushRefs.cloudRef.current.sb.auth={getUser:async()=>({data:{user:{id:'actor-a'}}})};
const flushCtx=vm.createContext({console,JSON,...flushRefs});vm.runInContext(src.extract('crmApplyBatch')+'\n'+src.extract('cloudFlush'),flushCtx);await vm.runInContext('cloudFlush()',flushCtx);
assert.equal(seen.batch.id,batch.id);assert.equal(journal.read(),null);assert.equal(refs.pendingRef.current.size,0);
// A second editable tab cannot obtain the same account's recovery journal.
await assert.rejects(h.open(storage,'https://example.invalid','actor-a',{request:async(key,options,fn)=>fn(null)}));
console.log('PASS CRM durable journal: reload overlay, actor/project isolation, unchanged replay ID, corrupt/quota protection, clear only after server confirmation, second-tab lock');
