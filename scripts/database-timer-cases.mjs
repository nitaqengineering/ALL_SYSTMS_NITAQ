import assert from 'node:assert/strict';
// Exercises the project stopwatch (migration 015) on a disposable local database.
// Runs after the engineering schema and 015 are applied by check-database.mjs.
export async function testTimerSafeDB(c){
 const A='40000000-0000-4000-8000-00000000000a', B='40000000-0000-4000-8000-00000000000b';
 const mgr='30000000-0000-4000-8000-000000000001'; // workspace manager created by the engineering fixture
 // Two engineers: auth user + confirmed email + settings.users entry + verified binding.
 await c.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())",[A,'eng-a@example.invalid',B,'eng-b@example.invalid']);
 await c.query(`update nitaq_engineering.workspace set settings=jsonb_set(settings,'{users}',coalesce(settings->'users','[]'::jsonb)||$1::jsonb)`,
   [JSON.stringify([{id:'eng-a',name:'Engineer A',email:'eng-a@example.invalid',role:'مهندس',active:true,permissions:{edit:true,assign:false}},
                    {id:'eng-b',name:'Engineer B',email:'eng-b@example.invalid',role:'مهندس',active:true,permissions:{edit:true,assign:false}}])]);
 await c.query("insert into nitaq_engineering.auth_bindings_v2(user_id,profile_id) values($1,'eng-a'),($2,'eng-b')",[A,B]);
 const proj=async id=>{ // create a minimal project through the save path as the manager
   const stages=Object.fromEntries(['design','planning','coordination','electric','water','gas','telecom','civil','struct','sanitary','munArch','munStruct','munSanitary','tender'].map(k=>[k,{status:'REQ',engineer:'',date:'',note:''}]));
   const doc={id,name:'P '+id,service:'SEWA',contract:false,permit:'بانتظار المتطلبات',supervision:{status:'لم يبدأ',engineer:'',note:''},workflow:{},history:[],info:{},stages};
   await asUser(mgr,()=>c.query('select public.nitaq_engineering_workspace_save_v2(gen_random_uuid(),$1::jsonb)',[JSON.stringify([{id,before:null,after:doc}])]));
 };
 async function asUser(uid,fn){await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);try{const r=await fn();await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}}
 const rpc=(uid,sql,params=[])=>asUser(uid,async()=>(await c.query(sql,params)).rows[0]?.r);
 const start=(uid,proj,stage,note=null)=>rpc(uid,'select public.nitaq_engineering_timer_start_v1($1,$2,$3) r',[proj,stage,note]);
 const stop=(uid,id=null)=>rpc(uid,'select public.nitaq_engineering_timer_stop_v1($1) r',[id]);
 const current=uid=>rpc(uid,'select public.nitaq_engineering_timer_current_v1() r');
 const report=(uid,proj=null)=>rpc(uid,'select public.nitaq_engineering_time_report_v1($1) r',[proj]);
 const running=uid=>c.query('select count(*)::int n from nitaq_engineering.time_logs where user_id=$1 and ended_at is null',[uid]).then(r=>r.rows[0].n);

 await proj('T1'); await proj('T2');

 // Start, then switch project: the first session auto-closes, only one stays running.
 const s1=await start(A,'T1','design'); assert.equal(s1.ended_at,null); assert.equal(s1.stage_key,'design'); assert.equal(s1.engineer_name,'Engineer A');
 const s2=await start(A,'T2','planning'); assert.equal(await running(A),1,'one running session per engineer');
 assert.equal((await c.query('select ended_at is not null closed from nitaq_engineering.time_logs where id=$1',[s1.id])).rows[0].closed,true,'previous session auto-closed on switch');
 const cur=await current(A); assert.equal(cur.id,s2.id); assert.ok(cur.server_now&&cur.cap_seconds==43200);

 // Stopping sets an end; a second stop with nothing running fails loudly.
 const stopped=await stop(A); assert.equal(stopped.id,s2.id); assert.ok(stopped.ended_at); assert.equal(await running(A),0);
 await assert.rejects(stop(A),e=>e.code==='P0001','stop with no running timer is rejected');

 // Each engineer is independent.
 await start(A,'T1','design'); await start(B,'T1','design');
 assert.equal(await running(A),1); assert.equal(await running(B),1);
 assert.equal((await current(B)).engineer_name,'Engineer B');
 await stop(A); await stop(B);

 // Invalid input and unknown project are rejected.
 await assert.rejects(start(A,'T1',''),e=>e.code==='22023');
 await assert.rejects(start(A,'NOPE','design'),e=>e.code==='22023');

 // Cap: a session that started 13h ago closes at start+12h, flagged auto_closed.
 const old=await start(A,'T1','civil');
 await c.query("update nitaq_engineering.time_logs set started_at=clock_timestamp()-interval '13 hours' where id=$1",[old.id]);
 const capped=await stop(A);
 assert.equal(capped.auto_closed,true,'over-cap session is auto-closed');
 const secs=Math.round((new Date(capped.ended_at)-new Date(capped.started_at))/1000);
 assert.ok(Math.abs(secs-43200)<5,'capped duration is the 12h cap, not 13h');

 // Adjust: owner may, a different engineer may not, a manager may.
 const adj=await start(A,'T2','design'); await stop(A);
 const t0=new Date(Date.now()-3600*1000).toISOString(), t1=new Date().toISOString();
 const fixed=await rpc(A,'select public.nitaq_engineering_timer_adjust_v1($1,$2,$3,$4) r',[adj.id,t0,t1,'fixed by owner']);
 assert.ok(Math.abs(Math.round((new Date(fixed.ended_at)-new Date(fixed.started_at))/1000)-3600)<5);
 await assert.rejects(rpc(B,'select public.nitaq_engineering_timer_adjust_v1($1,$2,$3,$4) r',[adj.id,t0,t1,'x']),e=>e.code==='42501','other engineer cannot adjust');
 await rpc(mgr,'select public.nitaq_engineering_timer_adjust_v1($1,$2,$3,$4) r',[adj.id,t0,t1,'manager fix']); // manager allowed
 await assert.rejects(rpc(A,'select public.nitaq_engineering_timer_adjust_v1($1,$2,$3,$4) r',[adj.id,t1,t0,null]),e=>e.code==='22023','end before start rejected');

 // Report visibility: engineer sees only self; manager sees everyone.
 const rA=await report(A); assert.ok(rA.totals.every(t=>t.engineer_name==='Engineer A'),'engineer report is self-only');
 assert.equal(rA.manager,false);
 const rM=await report(mgr); const names=new Set(rM.totals.map(t=>t.engineer_name));
 assert.ok(names.has('Engineer A')&&names.has('Engineer B'),'manager sees all engineers');
 assert.equal(rM.manager,true);
 const perProject=await report(mgr,'T1'); assert.ok(perProject.totals.every(t=>t.project_id==='T1'),'project filter works');

 // Delete: owner may delete own; other engineer may not; manager may delete any.
 const del=await start(B,'T1','design'); await stop(B);
 await assert.rejects(rpc(A,'select public.nitaq_engineering_timer_delete_v1($1) r',[del.id]),e=>e.code==='42501','other engineer cannot delete');
 assert.equal((await rpc(mgr,'select public.nitaq_engineering_timer_delete_v1($1) r',[del.id])).deleted,true,'manager deletes any');
 const own=await start(A,'T1','design'); await stop(A);
 assert.equal((await rpc(A,'select public.nitaq_engineering_timer_delete_v1($1) r',[own.id])).deleted,true,'owner deletes own');

 // A record with no workspace membership is denied everywhere.
 const outsider='49000000-0000-4000-8000-000000000001';
 await c.query('insert into auth.users(id,email) values($1,$2)',[outsider,'outsider@example.invalid']);
 await assert.rejects(start(outsider,'T1','design'),e=>e.code==='42501','non-member cannot start a timer');
 await assert.rejects(report(outsider),e=>e.code==='42501','non-member cannot read the report');

 console.log('PASS engineering timer: one running session per engineer, server clock, 12h cap, per-engineer isolation, owner/manager adjust+delete, member-only report');
}
