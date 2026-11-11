import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
export async function testOtherSafeDB(c){
 const actor='30000000-0000-4000-8000-000000000001';
 async function authenticated(fn){await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);try{const r=await fn();await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}}
 const existing=(await c.query("select nitaq_engineering.project_document(id) p from nitaq_engineering.projects order by id limit 1")).rows[0].p;
 function project(id){const p=structuredClone(existing);p.id=id;p.accountingProjectId='';p.accountingProjectName='';p.permit='بانتظار المتطلبات';p.contract=false;p.history=[];p.workflow={};p.stages=Object.fromEntries(Object.entries(p.stages).map(([k,v])=>[k,{...v,status:'REQ'}]));return p;}
 async function batch(changes,operation=randomUUID()){return authenticated(async()=> (await c.query('select public.nitaq_engineering_workspace_save_v2($1,$2::jsonb) r',[operation,JSON.stringify(changes)])).rows[0].r);}
 const many=Array.from({length:150},(_,i)=>({id:'safe-bulk-'+i,before:null,after:project('safe-bulk-'+i)}));
 const op=randomUUID();assert.equal((await batch(many,op)).result,'saved');assert.equal((await batch(many,op)).result,'already_saved');
 const failed=Array.from({length:100},(_,i)=>({id:'rolled-back-'+i,before:null,after:project('rolled-back-'+i)}));failed.push({id:many[0].id,before:null,after:many[0].after});
 assert.equal((await batch(failed)).result,'conflict');assert.equal(Number((await c.query("select count(*) n from nitaq_engineering.projects where id like 'rolled-back-%'")).rows[0].n),0);
 console.log('PASS engineering: 150-project atomic save, replay and rollback of prior chunks on late conflict');
 // Frontend fallback path when save_v2 is not deployed: save_v1 directly with the same request shape.
 const direct=(changes,operation=randomUUID())=>authenticated(async()=> (await c.query('select public.nitaq_engineering_workspace_save_v1($1,$2::jsonb) r',[operation,JSON.stringify(changes)])).rows[0].r);
 const count=async prefix=>Number((await c.query('select count(*) n from nitaq_engineering.projects where id like $1',[prefix+'%'])).rows[0].n);
 const hundred=Array.from({length:100},(_,i)=>({id:'fallback-ok-'+i,before:null,after:project('fallback-ok-'+i)}));
 const directOp=randomUUID();assert.equal((await direct(hundred,directOp)).result,'saved');assert.equal(await count('fallback-ok-'),100);
 assert.equal((await direct(hundred,directOp)).result,'already_saved');assert.equal(await count('fallback-ok-'),100);
 const tooMany=Array.from({length:101},(_,i)=>({id:'fallback-over-'+i,before:null,after:project('fallback-over-'+i)}));
 await assert.rejects(direct(tooMany),e=>e.code==='22023');assert.equal(await count('fallback-over-'),0);
 const late=Array.from({length:99},(_,i)=>({id:'fallback-late-'+i,before:null,after:project('fallback-late-'+i)}));late.push({id:hundred[0].id,before:null,after:hundred[0].after});
 assert.equal((await direct(late)).result,'conflict');assert.equal(await count('fallback-late-'),0);
 console.log('PASS engineering fallback: save_v1 saves 100 projects, rejects 101 and a late conflict without partial rows');
 assert.equal((await c.query(`select nitaq_engineering.latest_submission_v2('[{"submitted":"2026-11-07","outcome":"approved"},{"submitted":"2026-11-01","outcome":"comments"}]')->>'outcome' x`)).rows[0].x,'approved');
 const initial=project('safe-submission');await batch([{id:initial.id,before:null,after:initial}]);
 const designApproved=structuredClone(initial);designApproved.stages.design.status='OK';await batch([{id:initial.id,before:initial,after:designApproved}]);
 const ready=structuredClone(designApproved);ready.contract=true;ready.permit='تم التقديم';
 for(const k of ['planning','electric','water','gas','telecom','civil','munArch','munStruct','munSanitary'])ready.stages[k].status='OK';
 ready.workflow={planning:{submissions:[{id:'later',submitted:'2026-11-07',outcome:'اعتماد'},{id:'earlier',submitted:'2026-11-01',outcome:'ملاحظات'}]}};
 assert.equal((await batch([{id:ready.id,before:designApproved,after:ready}])).result,'saved');
 console.log('PASS engineering: out-of-order submission dates use same latest approval as client');
 const pendingUser='30000000-0000-4000-8000-000000000009';
 await c.query(`create trigger safe_membership_test after insert on auth.users for each row execute function public.nitaq_handle_new_user()`);
 await c.query(`update nitaq_engineering.workspace set settings=jsonb_set(settings,'{users}',coalesce(settings->'users','[]')||$1::jsonb)`,[JSON.stringify([{id:'pending-test',name:'Pending test',email:'pending@example.invalid',role:'مدير',active:true,permissions:{edit:true,assign:false}}])]);
 await c.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[pendingUser,'pending@example.invalid']);
 await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[pendingUser]);
 await assert.rejects(c.query('select public.nitaq_engineering_workspace_revision_v1()'),e=>e.code==='42501');await c.query('rollback');
 assert.equal(Number((await c.query('select count(*) n from public.nitaq_profiles where user_id=$1',[pendingUser])).rows[0].n),0);
 const approved=await authenticated(()=>c.query("select public.nitaq_engineering_invite_target_v1('pending@example.invalid') r"));assert.equal(approved.rows[0].r.registered,true);
 await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[pendingUser]);await c.query('select public.nitaq_engineering_workspace_revision_v1()');await c.query('rollback');
 console.log('PASS engineering: matching email alone grants no access; explicit manager approval binds verified account; no accounting role granted');
 const invitedUser='30000000-0000-4000-8000-000000000008';
 await c.query(`update nitaq_engineering.workspace set settings=jsonb_set(settings,'{users}',settings->'users'||$1::jsonb)`,[JSON.stringify([{id:'invited-test',name:'Invited test',email:'invited@example.invalid',role:'مهندس',active:true,permissions:{edit:true,assign:false}}])]);
 await authenticated(()=>c.query("select public.nitaq_engineering_invite_target_v1('invited@example.invalid')"));
 await c.query('insert into auth.users(id,email,invited_at,email_confirmed_at) values($1,$2,now(),now())',[invitedUser,'invited@example.invalid']);
 assert.equal((await c.query('select profile_id from nitaq_engineering.auth_bindings_v2 where user_id=$1',[invitedUser])).rows[0].profile_id,'invited-test');
 assert.equal(Number((await c.query('select count(*) n from public.nitaq_profiles where user_id=$1',[invitedUser])).rows[0].n),0);
 console.log('PASS accounting migration reapply preserves engineering invitation binding; invited user receives no accounting profile');
 // Synthetic 5000-project save uses one transaction, not 50 independently committed requests.
 const large=Array.from({length:5000},(_,i)=>({id:'safe-5000-'+i,before:null,after:project('safe-5000-'+i)}));
 await c.query("set statement_timeout='60000ms'");
 const started=Date.now();assert.equal((await batch(large)).result,'saved');
 await c.query('set statement_timeout=0');console.log('PASS engineering: atomic save of 5000 synthetic projects in '+(Date.now()-started)+'ms (local database only)');
 const restoreSettings=(await c.query('select settings from nitaq_engineering.workspace where id=true')).rows[0].settings;
 const revision=(await c.query('select revision from nitaq_engineering.workspace where id=true')).rows[0].revision;
 const document={...restoreSettings,projects:large.map(x=>x.after)},restoreOperation=randomUUID();
 const restored=await authenticated(async()=> (await c.query('select public.nitaq_engineering_workspace_restore_v1($1,$2,$3::jsonb) r',[restoreOperation,revision,JSON.stringify(document)])).rows[0].r);
 assert.equal(restored.result,'restored');assert.equal(restored.projects,5000);
 assert.equal(Number((await c.query('select count(*) n from nitaq_engineering.restore_context')).rows[0].n),0);
 console.log('PASS engineering: 5000-project restore completes; private restore context cleaned up');
 // Use explicit isolated fixture users. No real financial transaction is touched.
 const financialOwner='20000000-0000-4000-8000-000000000001',accountant='20000000-0000-4000-8000-000000000002';
 await c.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[financialOwner,'safe-owner@example.invalid',accountant,'safe-accountant@example.invalid']);
 await c.query("insert into public.nitaq_profiles(user_id,email,name,role) values($1,'safe-owner@example.invalid','Safe Owner','owner'),($2,'safe-accountant@example.invalid','Safe Accountant','accountant')",[financialOwner,accountant]);
 await c.query('grant select,insert,update on public.nitaq_records to authenticated');
 async function moneyAs(user,fn){await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);try{const r=await fn();await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}}
 const revenue={id:'safe-revenue',amount:100,category:'Other',vatable:'No',account:'Bank',date:'2026-11-09',payer:'Test',note:''};
 await moneyAs(financialOwner,()=>c.query("insert into public.nitaq_records(id,entity,data) values('safe-revenue','otherIncome',$1)",[revenue]));
 await assert.rejects(moneyAs(accountant,()=>c.query("update public.nitaq_records set data=jsonb_set(data,'{amount}','900') where id='safe-revenue'")),e=>e.code==='42501');
 await assert.rejects(moneyAs(financialOwner,()=>c.query("update public.nitaq_records set data=jsonb_set(data,'{amount}','900') where id='safe-revenue'")),e=>e.code==='42501');
 const correction={...revenue,amount:900,_financialCorrection:{id:randomUUID(),kind:'data_correction',reason:'Isolated correction test'}};
 await moneyAs(financialOwner,()=>c.query("update public.nitaq_records set data=$1 where id='safe-revenue'",[correction]));
 assert.equal(Number((await c.query("select count(*) n from public.nitaq_financial_audit_v1 where record_entity='otherIncome' and record_id='safe-revenue'")).rows[0].n),2);
 console.log('PASS accounting: accountant denied revenue correction; owner reason required; server audit records before/after');
 // Contract guard: an engineer keeps descriptive edits but cannot change money, type, status or project link.
 const moneyEngineer='20000000-0000-4000-8000-000000000003';
 await c.query('insert into auth.users(id,email) values($1,$2)',[moneyEngineer,'safe-engineer@example.invalid']);
 await c.query("insert into public.nitaq_profiles(user_id,email,name,role) values($1,'safe-engineer@example.invalid','Safe Engineer','engineer')",[moneyEngineer]);
 const guardProject={id:'guard-project',projectNo:'G-1',name:'Guard project',owner:'Owner',designFee:1000,supervisionMonthly:100,supervisionMonths:6};
 const guardContract={id:'guard-contract',projectId:'guard-project',type:'تصميم واعتماد',value:50000,status:'سارٍ',description:'first'};
 await moneyAs(financialOwner,()=>c.query("insert into public.nitaq_records(id,entity,data) values('guard-project','projects',$1),('guard-contract','contracts',$2)",[guardProject,guardContract]));
 const setField=(user,id,field,value)=>moneyAs(user,()=>c.query('update public.nitaq_records set data=jsonb_set(data,$2::text[],$3::jsonb) where id=$1',[id,[field],JSON.stringify(value)]));
 const stored=async(id,field)=>(await c.query('select data->>$2 v from public.nitaq_records where id=$1',[id,field])).rows[0].v;
 await setField(moneyEngineer,'guard-contract','description','engineer note');assert.equal(await stored('guard-contract','description'),'engineer note');
 for(const [field,value] of [['value',1],['status','ملغى'],['projectId','other'],['supervisionMonthly',5]])await assert.rejects(setField(moneyEngineer,'guard-contract',field,value),e=>e.code==='42501'&&e.message==='NITAQ_CONTRACT_FINANCIAL_CHANGE_DENIED',field);
 assert.equal(await stored('guard-contract','value'),'50000');
 await setField(moneyEngineer,'guard-project','name','Renamed by engineer');await assert.rejects(setField(moneyEngineer,'guard-project','designFee',1),e=>e.code==='42501');
 await setField(accountant,'guard-contract','value',60000);await setField(financialOwner,'guard-project','designFee',2000);
 assert.equal(await stored('guard-contract','value'),'60000');assert.equal(await stored('guard-project','designFee'),'2000');
 await c.query("update public.nitaq_records set data=jsonb_set(data,'{value}','70000') where id='guard-contract'");
 console.log('PASS accounting: engineer cannot change contract money, status or project link, nor project fees; owner, accountant and admin SQL can');
}
