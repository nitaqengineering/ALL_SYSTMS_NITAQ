import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function testRetiredStages(c,actor){
 const call=async(sql,values=[])=>{await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);try{const r=await c.query(sql,values);await c.query('commit');return r.rows[0];}catch(e){await c.query('rollback');throw e;}};
 const save=async(before,after)=>(await call('select public.nitaq_engineering_workspace_save_v2($1,$2::jsonb,null,null) r',[randomUUID(),JSON.stringify([{id:after.id,before,after}])])).r;
 const fixture={id:'retirement-fixture',name:'Synthetic retirement',service:'SEWA',contract:false,permit:'بانتظار المتطلبات',workflow:{struct:{note:'preserve in backup'},sanitary:{note:'preserve sanitary'}},history:[],info:{},supervision:{status:'لم يبدأ'},stages:Object.fromEntries(['design','planning','coordination','electric','water','gas','telecom','civil','struct','sanitary','munArch','munStruct','munSanitary','tender'].map(k=>[k,{status:'REQ',engineer:'',date:'',note:k.startsWith('mun')?'municipal stays':'',type:'جديد'}]))};
 assert.equal((await save(null,fixture)).result,'saved');
 const migration=await readFile('database/engineering/20261118074139_retire_preparation_stages.sql','utf8');
 await c.query(migration);
 const read=async()=>(await c.query('select nitaq_engineering.project_document($1) d',[fixture.id])).rows[0].d;
 const current=await read();
 assert.equal(Object.keys(current.stages).length,12);assert.ok(!current.stages.struct&&!current.stages.sanitary);
 assert.deepEqual(current.stages.munStruct,fixture.stages.munStruct);assert.deepEqual(current.stages.munSanitary,fixture.stages.munSanitary);
 assert.ok(!current.workflow.struct&&!current.workflow.sanitary);
 assert.equal((await c.query("select to_regclass('nitaq_engineering.retired_preparation_backup') t")).rows[0].t,null,'no backup is created, as explicitly requested');
 const beforeReapply=(await c.query('select revision from nitaq_engineering.workspace')).rows[0].revision;
 await c.query(migration);assert.equal((await c.query('select revision from nitaq_engineering.workspace')).rows[0].revision,beforeReapply,'migration is idempotent');
 const next=structuredClone(current);next.stages.munStruct.status='SUB';assert.equal((await save(current,next)).result,'saved');
 const stale=structuredClone(next);stale.stages.struct=fixture.stages.struct;
 await assert.rejects(save(next,stale),e=>e.code==='22023','retired stages cannot be recreated by cached tabs');
 assert.deepEqual(await read(),next,'rejected resurrection is atomic');
 await assert.rejects(call('select public.nitaq_engineering_timer_start_v1($1,$2,null) r',[fixture.id,'struct']),e=>e.code==='22023');
 const settings=(await c.query('select settings from nitaq_engineering.workspace')).rows[0].settings;assert.equal(settings.stageSchema,2);
 const oldSettings={...settings};delete oldSettings.stageSchema;
 await assert.rejects(call('select public.nitaq_engineering_workspace_save_v2($1,\'[]\'::jsonb,$2::jsonb,$3::jsonb) r',[randomUUID(),JSON.stringify(settings),JSON.stringify(oldSettings)]),e=>e.code==='22023');
 console.log('PASS retired stages: no backup created, 12-stage saves, municipal data unchanged, idempotence, resurrection/timer/stale settings blocked atomically');
}
