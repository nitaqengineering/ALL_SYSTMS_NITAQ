import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
export async function testCrmSafeDB(c){
 const owner='10000000-0000-4000-8000-000000000001',engineer='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
 try{
  await c.query(`create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create publication supabase_realtime`);
  await c.query(readFileSync('database/schema-reference/crm-public.sql','utf8').replace(/^\\.*$/gm,''));
  await c.query('set row_security=on');
  await c.query(`grant usage on schema public,auth to authenticated;grant select,insert,update,delete on public.nitaq_crm_records,public.nitaq_crm_profiles to authenticated;grant execute on function auth.uid() to authenticated`);
  await c.query(`insert into auth.users(id,email) values($1,'owner@example.invalid'),($2,'engineer@example.invalid'),($3,'other@example.invalid')`,[owner,engineer,other]);
  await c.query(`insert into public.nitaq_crm_profiles(id,auth_user_id,name,role,active,perms) values('owner',$1,'Owner','owner',true,'{}'),('eng',$2,'Engineer','engineer',true,'{"seeAll":true}'),('other',$3,'Other','engineer',true,'{}')`,[owner,engineer,other]);
  await c.query(readFileSync('database/crm/20261109_001_safe_mutations.sql','utf8'));
  async function as(actor,fn){await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);try{const r=await fn();await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}}
  const change=(entity,id,before,after)=>({entity,id,before,after});
  async function save(actor,changes,id=randomUUID(),insert=false){return as(actor,async()=> (await c.query('select public.nitaq_crm_apply_v2($1,$2::jsonb,$3) r',[id,JSON.stringify(changes),insert])).rows[0].r);}
  const client={id:'c',name:'Test',phone:'0'},lead={id:'l',clientId:'c',ownerId:'other',engineerId:'other',notes:'start'};
  await save(owner,[change('client','c',null,client),change('lead','l',null,lead)]);
  await assert.rejects(save(engineer,[change('lead','l',lead,{...lead,notes:'forbidden'})]),e=>e.code==='42501');
  await assert.rejects(as(engineer,()=>c.query("update public.nitaq_crm_profiles set role='owner' where id='eng'")),e=>e.code==='42501');
  await assert.rejects(as(engineer,()=>c.query("update public.nitaq_crm_records set data='{}' where id='c'")),e=>e.code==='42501');
  console.log('PASS CRM SQL: seeAll cannot edit; self promotion and direct writes denied');
  const next={...lead,notes:'saved'};const op=randomUUID();await save(owner,[change('lead','l',lead,next)],op);
  assert.equal((await save(owner,[change('lead','l',lead,next)],op)).result,'already_saved');
  await assert.rejects(save(owner,[change('lead','l',lead,{...lead,notes:'stale'})]),e=>e.code==='40001');
  await assert.rejects(save(owner,[change('lead','l',lead,{...lead,notes:'different operation body'})],op),e=>e.code==='22023');
  await save(owner,[change('lead','l',null,{...lead,notes:'old import'})],randomUUID(),true);
  assert.equal((await c.query("select data->>'notes' n from public.nitaq_crm_records where id='l'")).rows[0].n,'saved');
  console.log('PASS CRM SQL: CAS conflict, receipt replay, changed-payload rejection and insert-only restore');
  await c.query("update public.nitaq_crm_profiles set perms='{"+'"editAll":true'+"}' where id='eng'");
  await save(engineer,[change('lead','l',next,{...next,notes:'editAll'})]);
  const current={...next,notes:'editAll'};
  await assert.rejects(save(engineer,[change('lead','l',current,{...current,ownerId:'eng'})]),e=>e.code==='42501');
  const task={id:'t',engineerId:'eng',createdBy:'owner',title:'Task',workst:'',doneAt:''};await save(owner,[change('task','t',null,task)]);
  await save(engineer,[change('task','t',task,{...task,workst:'Done',doneAt:'2026-11-09'})]);
  await assert.rejects(save(engineer,[change('task','t',{...task,workst:'Done',doneAt:'2026-11-09'},{...task,engineerId:'other'})]),e=>e.code==='42501');
  console.log('PASS CRM SQL: editAll works; assign guard works; assigned engineer can complete own independent task');
  const settings={lookups:{types:['Villa']},projSeq:105};await save(owner,[change('settings','settings',null,settings)]);
  const lookupOwner={...settings,lookups:{types:['Villa','Office']}};await save(owner,[change('settings','settings',settings,lookupOwner)]);
  await c.query("update public.nitaq_crm_profiles set perms=perms||'{\"lookups\":true}'::jsonb where id='eng'");
  const lookupEngineer={...lookupOwner,lookups:{types:['Villa','Office','Shop']}};await save(engineer,[change('settings','settings',lookupOwner,lookupEngineer)]);
  const ownLead={id:'own',clientId:'c',ownerId:'eng',engineerId:'eng',projectNo:'9000'};await save(engineer,[change('lead','own',null,ownLead)]);
  await assert.rejects(save(engineer,[change('lead','own',ownLead,{...ownLead,accountingId:'forged-master-id'})]),e=>e.code==='42501');
  await save(owner,[change('lead','own',ownLead,{...ownLead,accountingId:'approved-master-id'})]);
  const interaction={id:'interaction',leadId:'own',note:'Own interaction'};await save(engineer,[change('inter','interaction',null,interaction)]);
  await c.query("update public.nitaq_crm_profiles set perms=perms- 'editAll' where id='eng'");
  await assert.rejects(save(engineer,[change('inter','interaction',interaction,{...interaction,leadId:'l'})]),e=>e.code==='42501');
  console.log('PASS CRM SQL: owner/lookup-engineer settings, high-number own project, interaction target access guard');

  const audit={aid:'a',byId:'owner',at:'2026-11-09',label:'Test'};await save(owner,[change('audit','a',null,audit)]);
  await assert.rejects(save(owner,[change('audit','a',audit,null)]),e=>e.code==='42501');
  await assert.rejects(as(owner,()=>c.query('delete from public.nitaq_crm_audit_v2')),e=>e.code==='42501');
  const before=Number((await c.query('select count(*) n from public.nitaq_crm_audit_v2')).rows[0].n);assert.ok(before>=5);
  const profile={id:'eng',name:'Engineer',email:'',authId:engineer,role:'engineer',perms:{lookups:true},active:true};
  await save(owner,[change('profile','eng',profile,{...profile,name:'Updated engineer'})]);
  const newUser=randomUUID();await c.query(`create trigger on_auth_user_created after insert on auth.users for each row execute function public.nitaq_handle_new_user()`);await c.query('insert into auth.users(id,email) values($1,$2)',[newUser,'uninvited@example.invalid']);
  assert.equal((await c.query('select active from public.nitaq_crm_profiles where auth_user_id=$1',[newUser])).rows[0].active,false);
  console.log('PASS CRM SQL: audit append-only/server actor, owner profile management and uninvited user inactive');
 }finally{}
}
