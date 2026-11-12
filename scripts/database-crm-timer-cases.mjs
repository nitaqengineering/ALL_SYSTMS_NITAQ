import assert from 'node:assert/strict';
// Exercises the CRM work stopwatch (database/crm/20261112_002_time_logs.sql) on a disposable local database.
// Runs after testCrmSafeDB, reusing its auth users, profiles (owner/eng/other) and leads ('l' owned by
// 'other', 'own' owned by 'eng'). The timer migration is applied by check-database.mjs before this runs.
export async function testCrmTimerSafeDB(c){
 const owner='10000000-0000-4000-8000-000000000001',engineer='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
 // Reset to a known permission shape independent of what testCrmSafeDB left behind:
 // eng = supervisor (seeAll), other = plain engineer owning lead 'l'.
 await c.query(`update public.nitaq_crm_profiles set perms='{"seeAll":true}'::jsonb, name='Engineer' where id='eng'`);
 await c.query(`update public.nitaq_crm_profiles set perms='{}'::jsonb, name='Other' where id='other'`);

 async function asUser(uid,fn){await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);try{const r=await fn();await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}}
 const rpc=(uid,sql,params=[])=>asUser(uid,async()=>(await c.query(sql,params)).rows[0]?.r);
 const start=(uid,lead,kind='عمل',note=null)=>rpc(uid,'select public.nitaq_crm_timer_start_v1($1,$2,$3) r',[lead,kind,note]);
 const stop=(uid,id=null)=>rpc(uid,'select public.nitaq_crm_timer_stop_v1($1) r',[id]);
 const current=uid=>rpc(uid,'select public.nitaq_crm_timer_current_v1() r');
 const report=(uid,lead=null)=>rpc(uid,'select public.nitaq_crm_time_report_v1($1) r',[lead]);
 const running=uid=>c.query('select count(*)::int n from nitaq_crm_private.time_logs where user_id=$1 and ended_at is null',[uid]).then(r=>r.rows[0].n);

 // Start, then switch lead: the first session auto-closes, only one stays running.
 const s1=await start(engineer,'l','اتصال'); assert.equal(s1.ended_at,null); assert.equal(s1.kind,'اتصال'); assert.equal(s1.engineer_name,'Engineer');
 assert.equal(s1.lead_id,'l'); assert.equal(s1.client_id,'c'); assert.equal(s1.client_name,'Test');
 const s2=await start(engineer,'own','زيارة'); assert.equal(await running(engineer),1,'one running session per user');
 assert.equal((await c.query('select ended_at is not null closed from nitaq_crm_private.time_logs where id=$1',[s1.id])).rows[0].closed,true,'previous session auto-closed on switch');
 const cur=await current(engineer); assert.equal(cur.id,s2.id); assert.ok(cur.server_now&&cur.cap_seconds==43200);

 // Stopping sets an end; a second stop with nothing running fails loudly.
 const stopped=await stop(engineer); assert.equal(stopped.id,s2.id); assert.ok(stopped.ended_at); assert.equal(await running(engineer),0);
 await assert.rejects(stop(engineer),e=>e.code==='P0001','stop with no running timer is rejected');

 // Access: a plain engineer may time their own lead ('l' is owned by 'other') but not someone else's ('own').
 const o1=await start(other,'l'); assert.equal(o1.kind,'عمل'); assert.equal(await running(other),1);
 await stop(other);
 await assert.rejects(start(other,'own'),e=>e.code==='42501','non-owner without seeAll cannot time another lead');
 // A supervisor (seeAll) may time any lead.
 await start(engineer,'l'); assert.equal(await running(engineer),1); await stop(engineer);

 // Invalid input and unknown lead are rejected (an empty kind is allowed and defaults to 'عمل').
 const blank=await start(engineer,'l',''); assert.equal(blank.kind,'عمل','empty kind defaults'); await stop(engineer);
 await assert.rejects(start(engineer,'NOPE'),e=>e.code==='22023','unknown lead rejected');
 await assert.rejects(start(engineer,'l','x'.repeat(41)),e=>e.code==='22023','over-long kind rejected');

 // Cap: a session that started 13h ago closes at start+12h, flagged auto_closed.
 const oldS=await start(engineer,'l','عمل مكتبي');
 await c.query("update nitaq_crm_private.time_logs set started_at=clock_timestamp()-interval '13 hours' where id=$1",[oldS.id]);
 const capped=await stop(engineer);
 assert.equal(capped.auto_closed,true,'over-cap session is auto-closed');
 const secs=Math.round((new Date(capped.ended_at)-new Date(capped.started_at))/1000);
 assert.ok(Math.abs(secs-43200)<5,'capped duration is the 12h cap, not 13h');

 // Adjust: owner may, a different plain engineer may not, a supervisor may.
 const adj=await start(other,'l'); await stop(other);
 const t0=new Date(Date.now()-3600*1000).toISOString(), t1=new Date().toISOString();
 const fixed=await rpc(other,'select public.nitaq_crm_timer_adjust_v1($1,$2,$3,$4) r',[adj.id,t0,t1,'fixed by owner']);
 assert.ok(Math.abs(Math.round((new Date(fixed.ended_at)-new Date(fixed.started_at))/1000)-3600)<5);
 // 'other' (plain engineer) cannot adjust a supervisor's row:
 const engRow=await start(engineer,'l'); await stop(engineer);
 await assert.rejects(rpc(other,'select public.nitaq_crm_timer_adjust_v1($1,$2,$3,$4) r',[engRow.id,t0,t1,'x']),e=>e.code==='42501','other engineer cannot adjust a supervisor row');
 await rpc(engineer,'select public.nitaq_crm_timer_adjust_v1($1,$2,$3,$4) r',[adj.id,t0,t1,'supervisor fix']); // seeAll allowed on any row
 await assert.rejects(rpc(engineer,'select public.nitaq_crm_timer_adjust_v1($1,$2,$3,$4) r',[adj.id,t1,t0,null]),e=>e.code==='22023','end before start rejected');

 // Report visibility: plain engineer sees only self; supervisor sees everyone.
 const rOther=await report(other); assert.ok(rOther.totals.every(t=>t.user_id===other),'plain engineer report is self-only'); assert.equal(rOther.see_all,false);
 const rEng=await report(engineer); const users=new Set(rEng.totals.map(t=>t.user_id));
 assert.ok(users.has(other)&&users.has(engineer),'supervisor sees all users'); assert.equal(rEng.see_all,true);
 const perLead=await report(engineer,'own'); assert.ok(perLead.totals.every(t=>t.lead_id==='own'),'lead filter works');

 // Delete: owner may delete own; other engineer may not; supervisor may delete any.
 const del=await start(engineer,'l'); await stop(engineer);
 await assert.rejects(rpc(other,'select public.nitaq_crm_timer_delete_v1($1) r',[del.id]),e=>e.code==='42501','plain engineer cannot delete a supervisor row');
 assert.equal((await rpc(engineer,'select public.nitaq_crm_timer_delete_v1($1) r',[del.id])).deleted,true,'supervisor deletes any');
 const own=await start(other,'l'); await stop(other);
 assert.equal((await rpc(other,'select public.nitaq_crm_timer_delete_v1($1) r',[own.id])).deleted,true,'owner deletes own');

 // A user with no active CRM profile is denied everywhere.
 const outsider='49000000-0000-4000-8000-000000000001';
 await c.query('insert into auth.users(id,email) values($1,$2)',[outsider,'outsider@example.invalid']);
 await assert.rejects(start(outsider,'l'),e=>e.code==='42501','non-member cannot start a timer');
 await assert.rejects(report(outsider),e=>e.code==='42501','non-member cannot read the report');

 console.log('PASS CRM timer: one running session per user, server clock, 12h cap, lead-access guard, owner/supervisor adjust+delete, member-only report');
}
