import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

export async function testWorkspaceEditConsistency(c,manager){
 const migration=await readFile('database/engineering/20261120_020_workspace_edit_consistency.sql','utf8');
 await c.query(migration);await c.query(migration);
 const capabilities=(await c.query('select public.nitaq_engineering_capabilities_v1() c')).rows[0].c;
 assert.equal(capabilities.version,1);assert.ok(Object.values(capabilities.features).every(value=>value===true));
 const uid=randomUUID(),profile='workspace-consistency-editor';
 await c.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid,'consistency@example.invalid']);
 await c.query(`update nitaq_engineering.workspace set settings=jsonb_set(settings,'{users}',settings->'users'||$1::jsonb) where id=true`,[JSON.stringify([{id:profile,name:'Consistency Editor',role:'مهندس',active:true,email:'consistency@example.invalid',permissions:{edit:false,editAll:true,editProject:false,assign:false}}])]);
 await c.query('insert into nitaq_engineering.auth_bindings_v2(user_id,profile_id) values($1,$2)',[uid,profile]);
 const doc=async id=>(await c.query('select nitaq_engineering.project_document($1) d',[id])).rows[0].d;
 async function save(actor,before,after){await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);try{const r=await c.query('select public.nitaq_engineering_workspace_save_v2($1,$2::jsonb,null,null) r',[randomUUID(),JSON.stringify([{id:after.id,before,after}])]);await c.query('commit');return r.rows[0].r;}catch(e){await c.query('rollback');throw e;}}
 const fixture={...await doc('retirement-fixture'),id:'workspace-edit-consistency',accountingProjectId:'',contract:false,workflow:{}};
 delete fixture.tender;
 for(const stage of Object.values(fixture.stages)){stage.status='REQ';stage.engineer='Other Engineer';}
 assert.equal((await save(manager,null,fixture)).result,'saved');
 let before=await doc(fixture.id),next=structuredClone(before);
 next.workflow.planning={blocker:{reason:'انتظار رد الجهة',waitingOn:'Authority',nextAction:'Follow up',actionOwner:'Consistency Editor',due:'2026-12-01'}};
 assert.equal((await save(uid,before,next)).result,'saved','editAll without edit may update colleague workflow');
 before=await doc(fixture.id);next=structuredClone(before);next.workflow.planning.review={status:'مصرح بالتقديم',authorizedBy:'Spoofed manager'};
 await assert.rejects(save(uid,before,next),e=>e.code==='42501','editAll cannot authorize submissions');
 next=structuredClone(before);next.tender={contractor:'Synthetic contractor',offers:'Comparison only'};
 assert.equal((await save(uid,before,next)).result,'saved','non-financial tender fields follow stage permission');
 before=await doc(fixture.id);
 for(const patch of [{contract:true},{info:{phone:'injected'}},{documents:[]},{requests:[]},{tender:{...before.tender,amount:100}}])await assert.rejects(save(uid,before,{...structuredClone(before),...patch}),e=>e.code==='42501');
 await c.query(`update nitaq_engineering.workspace set settings=jsonb_set(settings,'{users}',(select jsonb_agg(case when value->>'id'=$1 then jsonb_set(value,'{permissions}', $2::jsonb) else value end) from jsonb_array_elements(settings->'users'))) where id=true`,[profile,JSON.stringify({edit:true,editAll:false,assign:false,editProject:false})]);
 next=structuredClone(before);next.tender.offers='Not assigned';await assert.rejects(save(uid,before,next),e=>e.code==='42501');
 next=structuredClone(before);next.workflow.planning.blocker.nextAction='Not assigned';await assert.rejects(save(uid,before,next),e=>e.code==='42501');
 next=structuredClone(before);next.stages.tender.engineer='Consistency Editor';next.stages.planning.engineer='Consistency Editor';await save(manager,before,next);
 before=await doc(fixture.id);next=structuredClone(before);next.tender.offers='Assigned engineer comparison';await save(uid,before,next);
 before=await doc(fixture.id);next=structuredClone(before);next.workflow.planning.review={status:'قيد المراجعة',authorizedBy:''};await save(uid,before,next);
 console.log('PASS workspace edit consistency: editAll workflows, assigned tender, manager-only authorization/documents/finance, revocation, migration idempotence');
}
