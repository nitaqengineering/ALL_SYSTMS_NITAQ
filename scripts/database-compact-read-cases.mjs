import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
export async function testCompactRead(c,manager){
 const sql=await readFile('database/engineering/20261120_021_compact_workspace_read.sql','utf8');await c.query(sql);await c.query(sql);
 const context=vm.createContext({});vm.runInContext(await readFile('public/engineering/workspace-wire.js','utf8'),context);
 const decode=page=>JSON.parse(JSON.stringify(context.NitaqWorkspaceWire.decode(page)));
 async function read(version,after=null,actor=manager){await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);try{const result=await c.query(`select public.nitaq_engineering_workspace_read_v${version}($1) d`,[after]);await c.query('rollback');return result.rows[0].d;}catch(e){await c.query('rollback');throw e;}}
 const fixture=(await c.query("select nitaq_engineering.project_document('retirement-fixture') d")).rows[0].d;
 const stages=fixture.stages;
 const history=Array.from({length:30},(_,i)=>({at:'2026-11-01',event:'Preserve complete history '+i,stages,optional:null,supervision:{status:'لم يبدأ'}}));
 const batch=(await c.query('select import_id from nitaq_engineering.projects limit 1')).rows[0].import_id;
 for(let i=0;i<4;i++){
  const id='000-wire-fixture-'+i,doc={...fixture,id,history:structuredClone(history),reserved:{wire_format:'ordinary customer field'},'__nitaq_no_removed_field__':'retain'};
  if(i===2)doc.history=[null,'legacy',17,{},...history];
  if(i===3)delete doc.history;
  await c.query('insert into nitaq_engineering.projects(id,import_id,data) values($1,$2,$3::jsonb)',[id,batch,JSON.stringify(doc)]);
  for(const [key,value] of Object.entries(stages))await c.query('insert into nitaq_engineering.stages(project_id,stage_key,data) values($1,$2,$3::jsonb)',[id,key,JSON.stringify(value)]);
 }
 const original=await read(2),packed=await read(3),decoded=decode(packed);
 assert.deepEqual(decoded,original,'all projects, history entries, nulls, missing fields, cursor/settings/permissions match exactly');
 assert.equal(packed.wire_format,'dictionary-v1');
 const bytes=value=>Buffer.byteLength(JSON.stringify(value));assert.ok(bytes(packed)<bytes(original)*.6,'repeated snapshots reduce transfer by at least 40% in this fixture');
 const a=decoded.projects.find(p=>p.id==='000-wire-fixture-0'),b=decoded.projects.find(p=>p.id==='000-wire-fixture-1');
 const edited=structuredClone(b);edited.desc='Metadata edit after compact read';
 await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[manager]);
 try{const saved=await c.query('select public.nitaq_engineering_workspace_save_v2($1,$2::jsonb,null,null) r',[randomUUID(),JSON.stringify([{id:b.id,before:b,after:edited}])]);assert.equal(saved.rows[0].r.result,'saved');}finally{await c.query('rollback');}
 a.history[0].stages.design.status='LOCAL ONLY';assert.notEqual(b.history[0].stages.design.status,'LOCAL ONLY');assert.notEqual(a.history[1].stages.design.status,'LOCAL ONLY');assert.notEqual(a.stages.design.status,'LOCAL ONLY');
 assert.deepEqual(decode(await read(3,'000-wire-fixture-1')),await read(2,'000-wire-fixture-1'));
 assert.deepEqual(decode(await read(3,'zzzzzz')),await read(2,'zzzzzz'));
 await assert.rejects(read(3,null,'ffffffff-ffff-4fff-8fff-ffffffffffff'),e=>e.code==='42501');
 const grants=(await c.query("select has_function_privilege('anon','public.nitaq_engineering_workspace_read_v3(text)','execute') anon,has_function_privilege('authenticated','public.nitaq_engineering_workspace_read_v3(text)','execute') member")).rows[0];assert.equal(grants.anon,false);assert.equal(grants.member,true);
 console.log('PASS compact reader: lossless full documents/history, independent mutable snapshots, same membership/permissions/cursors, empty pages, idempotence; fixture bytes '+bytes(original)+' -> '+bytes(packed));
}
