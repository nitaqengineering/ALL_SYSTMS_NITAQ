// Disposable LOCAL databases only. Never point this runner at a company database.
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {testCrmSafeDB} from './database-crm-cases.mjs';
import {testOtherSafeDB} from './database-engineering-cases.mjs';
const connection=process.env.NITAQ_TEST_DATABASE_URL;
if(!connection||process.env.NITAQ_TEST_ALLOW_DISPOSABLE!=='1')throw Error('Set local NITAQ_TEST_DATABASE_URL and NITAQ_TEST_ALLOW_DISPOSABLE=1');
const url=new URL(connection);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Refusing a non-local database test connection');
const admin=new pg.Client({connectionString:connection});await admin.connect();
const names=[];const clients=[];const prefix='nitaq_test_'+randomUUID().replaceAll('-','');
const actor='30000000-0000-4000-8000-000000000001';
const read=path=>readFile(path,'utf8');
async function database(suffix){const name=prefix+'_'+suffix;await admin.query('create database "'+name+'" encoding \'UTF8\' locale \'C\' template template0');names.push(name);const u=new URL(connection);u.pathname='/'+name;const c=new pg.Client({connectionString:u.href});await c.connect();clients.push(c);return c;}
async function auth(c){await c.query(`create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz,invited_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create publication supabase_realtime;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated`);}
try{
 for(const role of ['anon','authenticated','service_role','supabase_auth_admin'])await admin.query(`do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role};end if;end$$`);
 const accounting=await database('engineering');await auth(accounting);
 await accounting.query((await read('database/schema-reference/accounting-public.sql')).replace(/^\\.*$/gm,''));
 await accounting.query('set row_security=on');
 await accounting.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[actor,'engineering-owner@example.invalid']);
 await accounting.query(await read('database/history/20261107_001_engineering_staging.sql'));
 const settings={custom:{},municipalities:['الشارقة'],users:[],tasks:[]};
 await accounting.query('insert into nitaq_engineering.import_batches(id,source_sha256,source_document) values($1,$2,$3)',[randomUUID(),'0'.repeat(64),{...settings,projects:[]}]);
 for(const f of ['20261107_003_engineering_stage_summary','20261107_004_engineering_coordination_save','20261107_005_shared_workspace','20261108_006_owner_role','20261108_007_workspace_invites','20261108_008_workspace_restore','20261108_009_accounting_identity','20261108_010_issued_permit_updates'])await accounting.query(await read('database/history/'+f+'.sql'));
 await accounting.query('insert into nitaq_engineering.workspace_managers(user_id) values($1)',[actor]);
 const stages=Object.fromEntries(['design','planning','coordination','electric','water','gas','telecom','civil','struct','sanitary','munArch','munStruct','munSanitary','tender'].map(k=>[k,{status:'REQ',engineer:'',date:'',note:''}]));
 const base={id:'synthetic-base',name:'Synthetic project',service:'SEWA',contract:false,permit:'بانتظار المتطلبات',supervision:{status:'لم يبدأ',engineer:'',note:''},workflow:{},history:[],info:{}};
 await accounting.query('insert into nitaq_engineering.projects(id,import_id,data) select $1,id,$2 from nitaq_engineering.import_batches limit 1',[base.id,base]);
 for(const [key,value] of Object.entries(stages))await accounting.query('insert into nitaq_engineering.stages(project_id,stage_key,data) values($1,$2,$3)',[base.id,key,value]);
 await accounting.query(await read('database/accounting/20261109_001_revenue_controls.sql'));
 // Financial forward migration is intentionally safe to reapply; no business values change.
 await accounting.query(await read('database/accounting/20261109_001_revenue_controls.sql'));
 for(const f of ['20261109_011_submission_consistency','20261109_012_atomic_large_save','20261109_013_verified_membership'])await accounting.query(await read('database/engineering/'+f+'.sql'));
 await accounting.query(await read('database/accounting/20261109_001_revenue_controls.sql'));
 await testOtherSafeDB(accounting);
 const crm=await database('crm');await testCrmSafeDB(crm);
 console.log('PASS disposable local SQL integration tests; no private fixtures or production connections');
}finally{
 for(const c of clients)await c.end();
 for(const name of names){if(!name.startsWith(prefix+'_'))throw Error('Invalid cleanup name');await admin.query('drop database "'+name+'"');}
 await admin.end();
}
