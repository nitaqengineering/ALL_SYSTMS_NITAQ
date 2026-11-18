import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function testReadyStages(c,actor){
 const migration=await readFile('database/engineering/20261118110729_ready_for_coordination.sql','utf8');
 await c.query(migration);await c.query(migration);
 const doc=(await c.query('select nitaq_engineering.project_document($1) d',['retirement-fixture'])).rows[0].d;
 const after=structuredClone(doc);after.permit='بانتظار المتطلبات';after.stages.design.status='OK';
 for(const [k,v] of Object.entries(after.stages))if(k!=='design')v.status='READY';
 async function save(before,next){await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);try{const r=await c.query('select public.nitaq_engineering_workspace_save_v2($1,$2::jsonb,null,null) r',[randomUUID(),JSON.stringify([{id:doc.id,before,after:next}])]);await c.query('commit');return r.rows[0].r;}catch(e){await c.query('rollback');throw e;}}
 assert.equal((await save(doc,after)).result,'saved');
 const saved=(await c.query('select nitaq_engineering.project_document($1) d',[doc.id])).rows[0].d;
 assert.ok(Object.entries(saved.stages).every(([k,s])=>s.status===(k==='design'?'OK':'READY')));
 const bad=structuredClone(saved);bad.stages.design.status='READY';
 await assert.rejects(save(saved,bad),e=>e.code==='22023','design must not accept READY');
 assert.deepEqual((await c.query('select nitaq_engineering.project_document($1) d',[doc.id])).rows[0].d,saved);
 const permit=structuredClone(saved);permit.contract=true;permit.permit='تم التقديم';
 await assert.rejects(save(saved,permit),e=>e.code==='22023','READY is not approval and does not satisfy permit prerequisites');
 console.log('PASS READY SQL: saves/reloads across every non-design stage including coordination, design rejects it, permit still requires approvals, migration reapply is safe');
}
