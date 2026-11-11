// Office-day simulation and restore drill on a disposable LOCAL PostgreSQL (never a company database).
// 10 signed-in accounts, 5000 synthetic projects. Prints measured numbers as JSON.
//   NITAQ_TEST_DATABASE_URL=postgresql://... NITAQ_TEST_ALLOW_DISPOSABLE=1 npm run simulate:office-day
import pg from 'pg';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {join} from 'node:path';
const repo=process.argv[2]||'.',connection=process.env.NITAQ_TEST_DATABASE_URL;
if(!connection||process.env.NITAQ_TEST_ALLOW_DISPOSABLE!=='1')throw Error('Set local NITAQ_TEST_DATABASE_URL and NITAQ_TEST_ALLOW_DISPOSABLE=1');
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(connection).hostname))throw Error('Refusing a non-local database test connection');
const read=p=>readFile(join(repo,p),'utf8');
const admin=new pg.Client({connectionString:connection});await admin.connect();
const prefix='nitaq_office_'+randomUUID().replaceAll('-','').slice(0,12),names=[],open=[];
const stageKeys=['design','planning','coordination','electric','water','gas','telecom','civil','struct','sanitary','munArch','munStruct','munSanitary','tender'];
const M1='30000000-0000-4000-8000-000000000001',M2='30000000-0000-4000-8000-000000000002';
const engineers=Array.from({length:8},(_,i)=>({uid:'31000000-0000-4000-8000-00000000000'+(i+1),id:'eng-'+(i+1),name:'Engineer '+(i+1),email:'engineer'+(i+1)+'@example.invalid'}));
async function connect(name){const u=new URL(connection);u.pathname='/'+name;const c=new pg.Client({connectionString:u.href});await c.connect();open.push(c);return c;}
async function build(suffix){
 const name=prefix+'_'+suffix;await admin.query('create database "'+name+'" encoding \'UTF8\' locale \'C\' template template0');names.push(name);
 const c=await connect(name);
 await c.query(`create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz,invited_at timestamptz,created_at timestamptz default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create publication supabase_realtime;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated`);
 await c.query((await read('database/schema-reference/accounting-public.sql')).replace(/^\\.*$/gm,''));
 await c.query('set row_security=on');
 await c.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[M1,'manager1@example.invalid']);
 await c.query(await read('database/history/20261107_001_engineering_staging.sql'));
 await c.query('insert into nitaq_engineering.import_batches(id,source_sha256,source_document) values($1,$2,$3)',[randomUUID(),'0'.repeat(64),{custom:{},municipalities:['الشارقة'],users:[],tasks:[],projects:[]}]);
 for(const f of ['20261107_003_engineering_stage_summary','20261107_004_engineering_coordination_save','20261107_005_shared_workspace','20261108_006_owner_role','20261108_007_workspace_invites','20261108_008_workspace_restore','20261108_009_accounting_identity','20261108_010_issued_permit_updates'])await c.query(await read('database/history/'+f+'.sql'));
 await c.query('insert into nitaq_engineering.workspace_managers(user_id) values($1)',[M1]);
 await c.query(await read('database/accounting/20261109_001_revenue_controls.sql'));
 for(const f of ['20261109_011_submission_consistency','20261109_012_atomic_large_save','20261109_013_verified_membership'])await c.query(await read('database/engineering/'+f+'.sql'));
 return {name,c};
}
// One signed-in session = one connection; every call is its own transaction as PostgREST does.
async function call(c,uid,sql,params=[]){await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);
 try{const r=await c.query(sql,params);await c.query('commit');return r.rows[0];}catch(e){await c.query('rollback');throw e;}}
const save=(c,uid,changes,operation=randomUUID(),before=null,after=null)=>call(c,uid,'select public.nitaq_engineering_workspace_save_v2($1,$2::jsonb,$3::jsonb,$4::jsonb) r',[operation,JSON.stringify(changes),before&&JSON.stringify(before),after&&JSON.stringify(after)]).then(x=>x.r);
const doc=(c,id)=>c.query('select nitaq_engineering.project_document($1) d',[id]).then(r=>r.rows[0].d);
const ms=t=>Math.round((performance.now()-t)*10)/10;
const stats=a=>{const s=[...a].sort((x,y)=>x-y),q=p=>s[Math.min(s.length-1,Math.floor(p*s.length))];return {n:s.length,p50:q(.5),p95:q(.95),max:s.at(-1)};};
const out={};
try{
 for(const role of ['anon','authenticated','service_role','supabase_auth_admin'])await admin.query(`do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role};end if;end$$`);
 const {name,c:root}=await build('main');
 // 10 accounts: 2 managers + 8 engineers with verified bindings.
 await root.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[M2,'manager2@example.invalid']);
 await root.query('insert into nitaq_engineering.workspace_managers(user_id) values($1)',[M2]);
 for(const e of engineers){await root.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[e.uid,e.email]);await root.query('insert into nitaq_engineering.auth_bindings_v2 values($1,$2)',[e.uid,e.id]);}
 await root.query(`update nitaq_engineering.workspace set settings=jsonb_set(settings,'{users}',$1::jsonb)`,[JSON.stringify(engineers.map(e=>({id:e.id,name:e.name,email:e.email,role:'مهندس',active:true,permissions:{edit:true,assign:false}})))]);
 const history=Array.from({length:26},(_,i)=>({at:'2026-10-'+String(1+i%28).padStart(2,'0')+'T08:00:00.000Z',by:'Engineer '+(1+i%8),text:'تحديث حالة مرحلة الاعتماد ومتابعة ملاحظات الجهة — قيد تجريبي رقم '+i}));
 function project(i){const owner=engineers[i%8].name;return {id:'P'+String(100000+i),name:'مالك تجريبي '+i,sketch:String(4000+i),desc:'فيلا سكنية',location:'الشارقة / الرحمانية',owner,service:'SEWA',telecom:'اتصالات',system:'بلدية الشارقة',municipality:'الشارقة',contract:false,permit:'بانتظار المتطلبات',parent:'',projectType:'سكني استثماري',workKind:'REQ — مطلوب',supervision:{status:'لم يبدأ',engineer:'',note:''},workflow:{},history,info:{plotGovernment:String(900000+i),plotPrivate:String(70000+i),phone:'050'+String(1000000+i)},
  stages:Object.fromEntries(stageKeys.map(k=>[k,{status:'REQ',engineer:owner,date:'',note:'',type:'جديد'}]))};}
 const manager=await connect(name);
 const all=Array.from({length:5000},(_,i)=>project(i));
 out.docBytes=Buffer.byteLength(JSON.stringify(all[0]));
 const tSeed=performance.now();
 out.oneRequestFor5000=await save(manager,M1,all.map(p=>({id:p.id,before:null,after:p}))).then(r=>r.result,e=>e.code+" "+e.message+" (request "+Math.round(Buffer.byteLength(JSON.stringify(all))/1e6)+" MB)");
 out.oneRequestFor5000Ms=ms(tSeed);out.oneRequestMegabytes=Math.round(Buffer.byteLength(JSON.stringify(all))/1e5)/10;
 let t=performance.now();const seedTimes=[];
 if(out.oneRequestFor5000!=="saved")for(let i=0;i<5000;i+=1000){const t0=performance.now();assert.equal((await save(manager,M1,all.slice(i,i+1000).map(p=>({id:p.id,before:null,after:p})))).result,"saved");seedTimes.push(ms(t0));}
 out.seedInBatchesOf1000={totalMs:ms(t),eachMs:seedTimes};
 const users=[{uid:M1,manager:true},{uid:M2,manager:true},...engineers.map(e=>({uid:e.uid,name:e.name}))];
 for(const u of users)u.c=await connect(name);
 // 1) Opening the system: full paged read of 5000 projects.
 async function load(u){const t0=performance.now();let after=null,projects=[],bytes=0,pages=0,settings;for(;;){const r=await call(u.c,u.uid,'select public.nitaq_engineering_workspace_read_v1($1)::text r',[after]);bytes+=r.r.length;const page=JSON.parse(r.r);settings=page.settings;pages++;projects.push(...page.projects);if(page.projects.length<100)break;after=page.projects.at(-1).id;}return {ms:ms(t0),projects,bytes,pages,settings};}
 const solo=await load(users[0]);assert.equal(solo.projects.length,5000);
 out.loadAlone={ms:solo.ms,pages:solo.pages,megabytes:Math.round(solo.bytes/1e5)/10};
 const together=await Promise.all(users.map(load));out.loadTenAtOnce=stats(together.map(x=>x.ms));
 // 2) Background "did anything change" poll.
 const polls=[];await Promise.all(users.map(async u=>{for(let i=0;i<50;i++){const t0=performance.now();await call(u.c,u.uid,'select public.nitaq_engineering_workspace_revision_v1() r');polls.push(ms(t0));}}));out.revisionPoll=stats(polls);
 // 3) Browser-side work on 5000 loaded projects, using the shipped functions.
 const usability=await read('public/engineering/usability.js');const ctx=vm.createContext({});
 const grab=(src,fn)=>{const s=src.indexOf('function '+fn+'(');let depth=0,i=src.indexOf('{',s);for(;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&--depth===0)break;}return src.slice(s,i+1);};
 vm.runInContext(grab(usability,'normalizeSearch')+grab(usability,'projectMatchesSearch'),ctx);ctx.projects=solo.projects;
 const timeIt=(code,n=5)=>{const runs=[];let value;for(let i=0;i<n;i++){const t0=performance.now();value=vm.runInContext(code,ctx);runs.push(ms(t0));}return {ms:stats(runs).p50,value};};
 out.searchByName=timeIt("projects.filter(p=>projectMatchesSearch(p,'تجريبي 4321')).length");
 out.searchByPlot=timeIt("projects.filter(p=>projectMatchesSearch(p,'٩٠٤٣٢١')).length");
 out.searchNoMatch=timeIt("projects.filter(p=>projectMatchesSearch(p,'لا يوجد')).length");
 out.filterStageAndEngineer=timeIt("projects.filter(p=>p.stages.planning.status==='REQ'&&p.stages.planning.engineer==='Engineer 3').length");
 const shared=await read('public/engineering/shared-workspace.js');
 vm.runInContext('var sharedWorkspace;'+grab(shared,'workspaceSettings')+grab(shared,'workspaceRequest'),Object.assign(ctx,{crypto:{randomUUID}}));
 ctx.sharedWorkspace={...solo.settings,projects:solo.projects};const edited=structuredClone(solo.projects);edited[2500].stages.planning.note='x';ctx.afterState={...solo.settings,projects:edited};
 out.diffBeforeEachSave=timeIt('workspaceRequest(afterState).p_changes.length');
 out.snapshotStringify=timeIt('JSON.stringify(afterState).length',3);
 // 4) Saving, one user alone then all ten at once on their own projects.
 const mine=u=>all.filter((p,i)=>u.manager?i%8===0:p.owner===u.name);
 async function edits(u,count,offset){const list=mine(u),times=[],results={};for(let i=0;i<count;i++){const id=list[offset+i].id,before=await doc(u.c,id),after=structuredClone(before);after.stages.planning.note='تحديث '+randomUUID();const t0=performance.now();const r=await save(u.c,u.uid,[{id,before,after}]);times.push(ms(t0));results[r.result]=(results[r.result]||0)+1;}return {times,results};}
 const alone=await edits(users[2],30,0);out.saveAlone={...stats(alone.times),results:alone.results};
 t=performance.now();const crowd=await Promise.all(users.map((u,i)=>edits(u,20,u.manager?300+i*100:40)));
 out.saveTenAtOnce={...stats(crowd.flatMap(x=>x.times)),wallMs:ms(t),results:crowd.reduce((a,x)=>{for(const k in x.results)a[k]=(a[k]||0)+x.results[k];return a;},{})};
 // 5) Two people change the same project from the same starting copy, at the same moment.
 const e1=users[2],tally={};let consistent=0,retried=0;
 for(let i=0;i<30;i++){const id=mine(e1)[100+i].id,before=await doc(root,id),a=structuredClone(before),b=structuredClone(before);a.stages.planning.note='A'+i;b.stages.planning.note='B'+i;
  const [ra,rb]=await Promise.all([save(e1.c,e1.uid,[{id,before,after:a}]),save(users[0].c,M1,[{id,before,after:b}])]);
  const key=[ra.result,rb.result].sort().join('+');tally[key]=(tally[key]||0)+1;const now=await doc(root,id);
  if((ra.result==='saved')!==(rb.result==='saved')&&now.stages.planning.note===(ra.result==='saved'?'A'+i:'B'+i))consistent++;
  // The person who lost reloads and applies their change on top: nothing is lost silently.
  const loser=ra.result==='saved'?{c:users[0].c,uid:M1,note:'B'+i}:{c:e1.c,uid:e1.uid,note:'A'+i},again=structuredClone(now);again.stages.civil.note=loser.note;
  if((await save(loser.c,loser.uid,[{id,before:now,after:again}])).result==='saved')retried++;}
 out.sameProjectTwoEditors={rounds:30,outcomes:tally,winnerStoredExactly:consistent,loserSavedAfterReload:retried};
 // 6) Connection drops after pressing Save.
 const fate={};{const id=mine(e1)[200].id,before=await doc(root,id),after=structuredClone(before);after.stages.planning.note='drop-after-commit';const op=randomUUID(),rev=async()=>Number((await root.query('select revision from nitaq_engineering.workspace')).rows[0].revision);
  await save(e1.c,e1.uid,[{id,before,after}],op);const r1=await rev();          // reply "lost"
  const retry=await save(e1.c,e1.uid,[{id,before,after}],op);fate.replyLostThenRetry={result:retry.result,revisionUnchanged:r1===await rev(),stored:(await doc(root,id)).stages.planning.note==='drop-after-commit'};
  const id2=mine(e1)[201].id,b2=await doc(root,id2),a2=structuredClone(b2);a2.stages.planning.note='never-arrived';const op2=randomUUID();
  fate.requestNeverArrived={storedBeforeRetry:(await doc(root,id2)).stages.planning.note,retry:(await save(e1.c,e1.uid,[{id:id2,before:b2,after:a2}],op2)).result};
  const id3=mine(e1)[202].id,b3=await doc(root,id3),a3=structuredClone(b3);a3.stages.planning.note='mine-first';const op3=randomUUID();
  await save(e1.c,e1.uid,[{id:id3,before:b3,after:a3}],op3);const mid=await doc(root,id3),other=structuredClone(mid);other.stages.planning.note='colleague-later';await save(users[0].c,M1,[{id:id3,before:mid,after:other}]);
  fate.replyLostColleagueEditedThenRetry={result:(await save(e1.c,e1.uid,[{id:id3,before:b3,after:a3}],op3)).result,finalNote:(await doc(root,id3)).stages.planning.note};
  const changed=structuredClone(a3);changed.stages.planning.note='different-payload';fate.sameOperationDifferentData=await save(e1.c,e1.uid,[{id:id3,before:b3,after:changed}],op3).then(r=>r.result,e=>e.code+' '+e.message);}
 out.connectionDrop=fate;
 // 7) Permissions under load.
 {const victim=mine(users[3])[300].id,before=await doc(root,victim),after=structuredClone(before);after.stages.planning.note='not mine';
  out.engineerEditsColleagueProject=await save(e1.c,e1.uid,[{id:victim,before,after}]).then(r=>r.result,e=>e.code+' '+e.message);
  const own=mine(e1)[301].id,b=await doc(root,own),a=structuredClone(b);a.name='renamed';out.engineerRenamesOwner=await save(e1.c,e1.uid,[{id:own,before:b,after:a}]).then(r=>r.result,e=>e.code+' '+e.message);
  out.outsiderReads=await call(users[0].c,'39000000-0000-4000-8000-000000000001','select public.nitaq_engineering_workspace_revision_v1() r').then(()=>'allowed',e=>e.code);}
 // 8) Growth of the change log after this office day.
 out.changeLog=(await root.query("select count(*)::int entries,pg_size_pretty(pg_total_relation_size('nitaq_engineering.workspace_changes')) size,pg_size_pretty(pg_database_size(current_database())) database from nitaq_engineering.workspace_changes")).rows[0];
 // ===== Restore drill: backup taken the way the frontend does, restored into a NEW empty database. =====
 const tasks=Array.from({length:20},(_,i)=>({id:'task-'+i,title:'مهمة تجريبية '+i,engineer:engineers[i%8].name,note:'',date:'2026-11-12',status:i%4?'open':'done',projectId:all[i*8+(i%8)].id,stage:'planning'}));
 {const before=(await root.query('select settings from nitaq_engineering.workspace')).rows[0].settings;assert.equal((await save(manager,M1,[],randomUUID(),before,{...before,tasks})).result,'saved');}
 t=performance.now();const backup=await load(users[0]);const document={...backup.settings,projects:backup.projects};const backupJson=JSON.stringify(document);
 out.restore={backupReadMs:ms(t),backupMegabytes:Math.round(backupJson.length/1e5)/10};
 const digest=async c=>createHash('sha256').update((await c.query("select coalesce(string_agg(md5(nitaq_engineering.project_document(id)::text),'' order by id),'') d from nitaq_engineering.projects")).rows[0].d).digest('hex');
 const source={digest:await digest(root),settings:(await root.query('select settings from nitaq_engineering.workspace')).rows[0].settings,changes:(await root.query('select count(*)::int n from nitaq_engineering.workspace_changes')).rows[0].n};
 t=performance.now();const fresh=await build('restored');out.restore.newDatabaseAndSchemaMs=ms(t);
 const target=fresh.c,targetManager=await connect(fresh.name);
 const revision=(await target.query('select revision from nitaq_engineering.workspace')).rows[0].revision;
 t=performance.now();const restored=await call(targetManager,M1,'select public.nitaq_engineering_workspace_restore_v1($1,$2,$3::jsonb) r',[randomUUID(),revision,backupJson]);out.restore.restoreMs=ms(t);out.restore.result=restored.r;
 const after={digest:await digest(target),settings:(await target.query('select settings from nitaq_engineering.workspace')).rows[0].settings};
 out.restore.projectsIdentical=after.digest===source.digest;
 out.restore.projects=(await target.query('select count(*)::int n from nitaq_engineering.projects')).rows[0].n;
 out.restore.stageRows=(await target.query('select count(*)::int n from nitaq_engineering.stages')).rows[0].n;
 out.restore.tasksRestored=(after.settings.tasks||[]).length+' of '+tasks.length;
 out.restore.userProfilesRestored=(after.settings.users||[]).length+' of '+engineers.length;
 out.restore.settingsIdentical=JSON.stringify(after.settings)===JSON.stringify(source.settings);
 out.restore.changeLogEntries={source:source.changes,restored:(await target.query('select count(*)::int n from nitaq_engineering.workspace_changes')).rows[0].n};
 out.restore.projectHistoryKept=(await doc(target,all[0].id)).history.length+' entries per project';
 out.restore.loginBindingsRestored=(await target.query('select count(*)::int n from nitaq_engineering.auth_bindings_v2')).rows[0].n+' of '+engineers.length;
 out.restore.managersInNewDatabase=(await target.query('select count(*)::int n from nitaq_engineering.workspace_managers')).rows[0].n;
 // Usable afterwards? Manager reads and saves; an engineer needs their login re-approved by a manager.
 const check=await load({c:targetManager,uid:M1});out.restore.managerReadsAfterRestore=check.projects.length;
 {const id=all[10].id,b=await doc(target,id),a=structuredClone(b);a.stages.planning.note='after restore';out.restore.managerSavesAfterRestore=(await save(targetManager,M1,[{id,before:b,after:a}])).result;}
 const eng=engineers[0];await target.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[eng.uid,eng.email]);
 out.restore.engineerBeforeApproval=await call(targetManager,eng.uid,'select public.nitaq_engineering_workspace_revision_v1() r').then(()=>'allowed',e=>e.code);
 await call(targetManager,M1,'select public.nitaq_engineering_invite_target_v1($1) r',[eng.email]);
 out.restore.engineerAfterManagerApproval=await call(targetManager,eng.uid,'select public.nitaq_engineering_workspace_revision_v1() r').then(()=>'allowed',e=>e.code);
 {const id=all[0].id,b=await doc(target,id),a=structuredClone(b);a.stages.planning.note='engineer after restore';out.restore.engineerSavesOwnProject=await save(targetManager,eng.uid,[{id,before:b,after:a}]).then(r=>r.result,e=>e.code+' '+e.message);}
 console.log(JSON.stringify(out,null,1));
}finally{
 for(const c of open)await c.end().catch(()=>{});
 for(const n of names)await admin.query('drop database if exists "'+n+'" with (force)').catch(e=>console.error(e.message));
 await admin.end();
}
