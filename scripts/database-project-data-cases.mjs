import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function testProjectDataPermission(c,manager){
 const migration=await readFile('database/engineering/project_data_edit_permission.sql','utf8');await c.query(migration);await c.query(migration);
 const user=randomUUID(),profile='project-data-editor';
 await c.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,'project-data-editor@example.invalid']);
 await c.query(`update nitaq_engineering.workspace set settings=jsonb_set(settings,'{users}',coalesce(settings->'users','[]'::jsonb)||$1::jsonb) where id=true`,[JSON.stringify([{id:profile,name:'Project Data Editor',role:'مهندس',active:true,email:'project-data-editor@example.invalid',permissions:{editProject:true,edit:false,assign:false,editAll:false}}])]);
 await c.query('insert into nitaq_engineering.auth_bindings_v2(user_id,profile_id) values($1,$2)',[user,profile]);
 const original=(await c.query("select nitaq_engineering.project_document('retirement-fixture') d")).rows[0].d;
 const fixture={...structuredClone(original),id:'project-data-permission',accountingProjectId:'',contract:false,owner:'Engineer A'};
 for(const stage of Object.values(fixture.stages))stage.status='REQ';
 async function save(actor,before,after,settings=null){await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);try{const r=await c.query('select public.nitaq_engineering_workspace_save_v2($1,$2::jsonb,$3::jsonb,$4::jsonb) r',[randomUUID(),JSON.stringify([{id:after?.id||before?.id,before,after}]),settings?JSON.stringify(settings):null,settings?JSON.stringify(settings):null]);await c.query('commit');return r.rows[0].r;}catch(e){await c.query('rollback');throw e;}}
 assert.equal((await save(manager,null,fixture)).result,'saved');
 const updated={...structuredClone(fixture),desc:'Villa G+1',descEn:'WAREHOUSE G+ MEZZANINE',location:'Synthetic location',sketch:'new-sketch'};
 assert.equal((await save(user,fixture,updated)).result,'saved');
 assert.equal((await c.query('select nitaq_engineering.project_document($1) d',[fixture.id])).rows[0].d.descEn,updated.descEn);
 for(const patch of [{contract:true},{owner:'Another Engineer'},{clientId:'injected'},{accountingProjectId:'fake'},{info:{phone:'fake'}}])await assert.rejects(save(user,updated,{...structuredClone(updated),...patch}),e=>e.code==='42501');
 const changedStage=structuredClone(updated);changedStage.stages.munStruct.status='COM';await assert.rejects(save(user,updated,changedStage),e=>e.code==='42501');
 await assert.rejects(save(user,null,{...fixture,id:'unauthorized-new-project'}),e=>e.code==='42501'||e.code==='22023');
 const master={id:'accounting-master',projectNo:fixture.id,owner:updated.name,plotNumber:'0001',ownershipNumber:'0002'};
 await c.query("insert into public.nitaq_records(id,entity,data) values($1,'projects',$2::jsonb)",[master.id,JSON.stringify(master)]);
 const linked=(await c.query('select nitaq_engineering.accounting_identity($1::jsonb,$2::jsonb) d',[JSON.stringify({...structuredClone(updated),accountingProjectId:master.id}),JSON.stringify(master)])).rows[0].d;
 assert.equal((await save(manager,updated,linked)).result,'saved');
 await assert.rejects(save(user,linked,{...linked,name:'Renamed master'}),e=>e.code==='42501');
 const linkedDescription={...linked,descEn:'BUILDING G+3'};assert.equal((await save(user,linked,linkedDescription)).result,'saved');
 await c.query(`update nitaq_engineering.workspace set settings=jsonb_set(settings,'{users}',(select jsonb_agg(case when value->>'id'=$1 then jsonb_set(value,'{permissions,editProject}','false'::jsonb) else value end) from jsonb_array_elements(settings->'users'))) where id=true`,[profile]);
 await assert.rejects(save(user,linkedDescription,{...linkedDescription,desc:'Revoked'}),e=>e.code==='42501');
 console.log('PASS project data permission SQL: descriptions/location/sketch save, separate creation/assignment/stage/finance/master identity guards, revocation and idempotence');
}
