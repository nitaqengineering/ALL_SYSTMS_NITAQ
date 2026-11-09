-- CRM PROJECT ONLY. Forward migration; do not run against accounting/engineering.
begin;
create schema if not exists nitaq_crm_private;
revoke all on schema nitaq_crm_private from public,anon,authenticated;
create table if not exists nitaq_crm_private.receipts(
 actor uuid not null,operation uuid not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor,operation));
create table if not exists public.nitaq_crm_audit_v2(
 id bigint generated always as identity primary key,at timestamptz not null default clock_timestamp(),
 actor uuid,operation text not null,entity text not null,record_id text not null,before_data jsonb,after_data jsonb);
alter table public.nitaq_crm_audit_v2 enable row level security;
revoke all on public.nitaq_crm_audit_v2 from public,anon,authenticated;
grant select on public.nitaq_crm_audit_v2 to authenticated;
create policy crm_audit_owner_read on public.nitaq_crm_audit_v2 for select to authenticated using(public.nitaq_my_role()='owner');
create or replace function nitaq_crm_private.capture() returns trigger language plpgsql security definer
set search_path=pg_catalog,public,nitaq_crm_private as $$
begin
 if TG_OP='UPDATE' and OLD.data is not distinct from NEW.data then return NEW;end if;
 insert into public.nitaq_crm_audit_v2(actor,operation,entity,record_id,before_data,after_data)
 values(auth.uid(),TG_OP,coalesce(NEW.entity,OLD.entity),coalesce(NEW.id,OLD.id),case when TG_OP<>'INSERT' then OLD.data end,case when TG_OP<>'DELETE' then NEW.data end);
 return coalesce(NEW,OLD);
end $$;
create trigger crm_authoritative_audit after insert or update or delete on public.nitaq_crm_records for each row execute function nitaq_crm_private.capture();

alter table public.nitaq_crm_records drop constraint nitaq_crm_records_entity_check;
alter table public.nitaq_crm_records add constraint nitaq_crm_records_entity_check check(entity in ('client','lead','inter','audit','settings','task'));
-- Abort instead of silently losing a malformed task or an ID collision.
do $$
declare items jsonb;
begin
 select coalesce(data->'tasks','[]'::jsonb) into items from public.nitaq_crm_records where id='settings' and entity='settings';
 items=coalesce(items,'[]'::jsonb);
 if jsonb_typeof(items)<>'array' then raise exception 'Invalid legacy tasks';end if;
 if exists(select 1 from jsonb_array_elements(items) t where jsonb_typeof(t)<>'object' or coalesce(t->>'id','')='') or
 (select count(*) from jsonb_array_elements(items))<>(select count(distinct t->>'id') from jsonb_array_elements(items) t) then raise exception 'Malformed or duplicate legacy task IDs';end if;
 if exists(select 1 from jsonb_array_elements(items) t join public.nitaq_crm_records r on r.id=t->>'id' where r.entity<>'task' or r.data is distinct from t) then raise exception 'Legacy task ID collision; no data migrated';end if;
end $$;
-- Preserve every validated legacy task before removing its settings representation.
insert into public.nitaq_crm_records(id,entity,data)
select t->>'id','task',t from public.nitaq_crm_records r cross join lateral jsonb_array_elements(coalesce(r.data->'tasks','[]'::jsonb)) t
where r.id='settings' and r.entity='settings' and jsonb_typeof(t)='object' and length(t->>'id')>0
on conflict(id) do nothing;
update public.nitaq_crm_records set data=data-'tasks' where entity='settings' and data?'tasks';
create index if not exists nitaq_crm_lead_data_id on public.nitaq_crm_records((data->>'id')) where entity='lead';

-- Remove unsafe write policies, not their read counterparts. All record writes use CAS RPC.
drop policy if exists records_insert on public.nitaq_crm_records;
drop policy if exists records_update on public.nitaq_crm_records;
drop policy if exists records_delete on public.nitaq_crm_records;
revoke insert,update,delete on public.nitaq_crm_records from public,anon,authenticated;
drop policy if exists profiles_update_self on public.nitaq_crm_profiles;
-- UI profile management remains owner-only; direct self role/perms writes are revoked.
revoke update,delete on public.nitaq_crm_profiles from public,anon,authenticated;
drop policy if exists task_read_v2 on public.nitaq_crm_records;
create policy task_read_v2 on public.nitaq_crm_records for select to authenticated using(
 entity='task' and public.nitaq_is_active_user() and (public.nitaq_see_all() or data->>'engineerId'=public.nitaq_my_profile_id() or data->>'createdBy'=public.nitaq_my_profile_id()));

create or replace function public.nitaq_crm_capabilities_v2() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.nitaq_is_active_user() then raise exception 'CRM access pending administrator approval' using errcode='42501';end if;
 return '{"version":2}'::jsonb;
end $$;

create or replace function public.nitaq_crm_apply_v2(p_operation uuid,p_changes jsonb,p_insert_only boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,nitaq_crm_private as $$
declare actor public.nitaq_crm_profiles; c jsonb; old_row public.nitaq_crm_records; target public.nitaq_crm_profiles;
 old_doc jsonb; next_doc jsonb; expected jsonb; ent text; rid text; req jsonb; previous nitaq_crm_private.receipts;
 allowed boolean; mine boolean; assignment boolean; result jsonb; prior_id text; changed integer:=0;
begin
 if auth.uid() is null or p_operation is null then raise exception 'Authentication required' using errcode='42501';end if;
 -- Serialise receipts, profile roles and absent-row inserts; CAS still rejects stale values.
 perform pg_advisory_xact_lock(734019921);
 select * into actor from public.nitaq_crm_profiles where auth_user_id=auth.uid() and active for update;
 if not found then raise exception 'CRM access denied' using errcode='42501';end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>100 or octet_length(p_changes::text)>2000000 then raise exception 'Invalid batch' using errcode='22023';end if;
 req=jsonb_build_object('changes',p_changes,'insertOnly',p_insert_only);
 select * into previous from nitaq_crm_private.receipts where receipts.actor=auth.uid() and operation=p_operation;
 if found then
  if previous.request is distinct from req then raise exception 'Operation ID reused with different data' using errcode='22023';end if;
  return previous.result||'{"result":"already_saved"}'::jsonb;
 end if;
 if (select count(*) from (select x->>'entity',x->>'id' from jsonb_array_elements(p_changes) x group by 1,2) q)<>jsonb_array_length(p_changes) then raise exception 'Duplicate changes' using errcode='22023';end if;
 for c in select value from jsonb_array_elements(p_changes) with ordinality x(value,n)
 order by case when value->'after'='null'::jsonb then case value->>'entity' when 'inter' then 0 when 'lead' then 1 when 'client' then 2 else 3 end else 4 end,n loop
  ent=c->>'entity';rid=c->>'id';next_doc=nullif(c->'after','null'::jsonb);expected=nullif(c->'before','null'::jsonb);
  if rid is null or length(rid) not between 1 and 150 or ent is null or ent not in ('client','lead','inter','audit','settings','task','profile') then raise exception 'Invalid record identity' using errcode='22023';end if;
  if next_doc is not null and (jsonb_typeof(next_doc)<>'object' or octet_length(next_doc::text)>100000) then raise exception 'Invalid document' using errcode='22023';end if;
  if ent='profile' then
   if actor.role<>'owner' or next_doc is null then raise exception 'Only owners manage profiles; disable instead of deleting' using errcode='42501';end if;
   select * into target from public.nitaq_crm_profiles where id=rid for update;
   if not found then raise exception 'Profile not found' using errcode='22023';end if;
   old_doc=jsonb_build_object('id',target.id,'name',target.name,'email',coalesce(target.email,''),'authId',coalesce(target.auth_user_id::text,''),'role',target.role,'perms',target.perms,'active',target.active);
   if old_doc is distinct from expected then raise exception 'CRM_CONFLICT profile %',rid using errcode='40001';end if;
   if next_doc->>'role' not in ('owner','engineer') or jsonb_typeof(next_doc->'perms') is distinct from 'object' or jsonb_typeof(next_doc->'active') is distinct from 'boolean' or length(btrim(next_doc->>'name')) not between 1 and 200 then raise exception 'Invalid profile %',rid using errcode='22023';end if;
   if (next_doc-'name'-'role'-'perms'-'active') is distinct from (old_doc-'name'-'role'-'perms'-'active') then raise exception 'Profile identity is immutable' using errcode='42501';end if;
   if target.role='owner' and target.active and (next_doc->>'role'<>'owner' or next_doc->'active'='false'::jsonb) and not exists(select 1 from public.nitaq_crm_profiles where id<>rid and active and role='owner' and auth_user_id is not null) then raise exception 'Cannot disable last owner' using errcode='42501';end if;
   update public.nitaq_crm_profiles set name=next_doc->>'name',role=next_doc->>'role',perms=next_doc->'perms',active=(next_doc->>'active')::boolean where id=rid;
   insert into public.nitaq_crm_audit_v2(actor,operation,entity,record_id,before_data,after_data) values(auth.uid(),'UPDATE','profile',rid,old_doc,next_doc);
   changed=changed+1;continue;
  end if;
  select * into old_row from public.nitaq_crm_records where id=rid for update;
  old_doc=case when found then old_row.data else null end;
  if old_doc is not null and old_row.entity<>ent then raise exception 'Record entity is immutable' using errcode='42501';end if;
  if p_insert_only and old_doc is not null then continue;end if;
  if old_doc is distinct from expected then raise exception 'CRM_CONFLICT % %',ent,rid using errcode='40001';end if;
  if next_doc is not null and ent<>'settings' and next_doc->>(case when ent='audit' then 'aid' else 'id' end) is distinct from rid then raise exception 'Document ID mismatch' using errcode='22023';end if;
  if ent='audit' then
   if old_doc is not null or next_doc is null then raise exception 'Audit is append only' using errcode='42501';end if;
   if next_doc->>'byId' is distinct from actor.id then raise exception 'Audit actor mismatch' using errcode='42501';end if;
  end if;
  mine=ent='lead' and (old_doc->>'ownerId'=actor.id or old_doc->>'engineerId'=actor.id);
  allowed=actor.role='owner';
  if not allowed then
   if ent='client' then allowed=next_doc is not null;
   elsif ent='lead' then
    allowed=coalesce(mine,false) or actor.perms->'editAll'='true'::jsonb or (old_doc is null and (next_doc->>'ownerId'=actor.id or next_doc->>'engineerId'=actor.id));
   elsif ent='inter' then
    if next_doc is not null and old_doc is not null and next_doc->>'leadId' is distinct from old_doc->>'leadId' and not exists(select 1 from public.nitaq_crm_records l where l.entity='lead' and l.id=next_doc->>'leadId' and (l.data->>'ownerId'=actor.id or l.data->>'engineerId'=actor.id or actor.perms->'editAll'='true'::jsonb)) then raise exception 'Target lead access denied' using errcode='42501';end if;
    allowed=exists(select 1 from public.nitaq_crm_records l where l.entity='lead' and l.id=coalesce(old_doc->>'leadId',next_doc->>'leadId') and (l.data->>'ownerId'=actor.id or l.data->>'engineerId'=actor.id or actor.perms->'editAll'='true'::jsonb));
   elsif ent='task' then allowed=old_doc is not null and old_doc->>'engineerId'=actor.id and next_doc is not null and (next_doc-'workst'-'doneAt')=(old_doc-'workst'-'doneAt');
   elsif ent='settings' then allowed=actor.perms->'lookups'='true'::jsonb and (next_doc-'lookups') is not distinct from (old_doc-'lookups');
   elsif ent='audit' then allowed=true;
   end if;
   if next_doc is null then allowed=coalesce(allowed,false) and actor.perms->'del'='true'::jsonb and ent in ('lead','inter');end if;
  end if;
  if not coalesce(allowed,false) then raise exception 'CRM permission denied for %',ent using errcode='42501';end if;
  if ent='lead' and next_doc is not null then
   if actor.role<>'owner' and (next_doc->'accountingId' is distinct from old_doc->'accountingId' or next_doc->'accountingOwner' is distinct from old_doc->'accountingOwner' or next_doc->'accountingPlotGovernment' is distinct from old_doc->'accountingPlotGovernment' or next_doc->'accountingPlotPrivate' is distinct from old_doc->'accountingPlotPrivate') then raise exception 'Accounting link requires owner approval' using errcode='42501';end if;
   assignment=old_doc is not null and ((next_doc->'ownerId') is distinct from (old_doc->'ownerId') or (next_doc->'engineerId') is distinct from (old_doc->'engineerId'));
   if old_doc is null then assignment=coalesce(next_doc->>'ownerId','') not in ('',actor.id) or coalesce(next_doc->>'engineerId','') not in ('',actor.id);end if;
   if assignment and actor.role<>'owner' and actor.perms->'assign' is distinct from 'true'::jsonb then raise exception 'Assignment permission required' using errcode='42501';end if;
   if not exists(select 1 from public.nitaq_crm_records where entity='client' and id=next_doc->>'clientId') then raise exception 'Client does not exist' using errcode='22023';end if;
  end if;
  if ent='inter' and next_doc is not null and not exists(select 1 from public.nitaq_crm_records where entity='lead' and id=next_doc->>'leadId') then raise exception 'Lead does not exist' using errcode='22023';end if;
  if ent='settings' and (rid<>'settings' or next_doc is null or next_doc?'tasks' or jsonb_typeof(next_doc->'lookups')<>'object') then raise exception 'Invalid settings' using errcode='22023';end if;
  if next_doc is null then
   if ent='client' and exists(select 1 from public.nitaq_crm_records where entity='lead' and data->>'clientId'=rid) then raise exception 'Client has projects' using errcode='22023';end if;
   if ent='lead' and exists(select 1 from public.nitaq_crm_records where entity='inter' and data->>'leadId'=rid) then raise exception 'Lead has interactions; archive it instead' using errcode='22023';end if;
   delete from public.nitaq_crm_records where id=rid;
  elsif old_doc is null then insert into public.nitaq_crm_records(id,entity,data) values(rid,ent,next_doc);
  else update public.nitaq_crm_records set data=next_doc,updated_at=clock_timestamp() where id=rid;end if;
  changed=changed+1;
 end loop;
 result=jsonb_build_object('result','saved','changed',changed);
 insert into nitaq_crm_private.receipts values(auth.uid(),p_operation,req,result,clock_timestamp());
 return result;
end $$;

create or replace function public.nitaq_crm_merge_profile_v2(p_legacy text,p_real text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare legacy public.nitaq_crm_profiles;real_user public.nitaq_crm_profiles;
begin
 perform pg_advisory_xact_lock(734019921);
 if public.nitaq_my_role()<>'owner' then raise exception 'Owner required' using errcode='42501';end if;
 select * into legacy from public.nitaq_crm_profiles where id=p_legacy for update;
 if not found or legacy.auth_user_id is not null then raise exception 'Invalid legacy profile' using errcode='22023';end if;
 select * into real_user from public.nitaq_crm_profiles where id=p_real for update;
 if not found or real_user.auth_user_id is null or real_user.role='owner' then raise exception 'Invalid target profile' using errcode='22023';end if;
 -- Keep both IDs (historical ownership never becomes orphaned), disable the duplicate.
 update public.nitaq_crm_profiles set auth_user_id=null,active=false where id=p_real;
 update public.nitaq_crm_profiles set auth_user_id=real_user.auth_user_id,email=real_user.email,active=true where id=p_legacy;
 return '{"result":"saved"}'::jsonb;
end $$;

-- No automatic role or email-invite claim from a public sign-up.
create or replace function public.nitaq_handle_new_user() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public.nitaq_crm_profiles(id,auth_user_id,name,email,role,active)
 values(gen_random_uuid()::text,new.id,coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1)),new.email,'engineer',false);
 return new;
end $$;
revoke all on function public.nitaq_crm_apply_v2(uuid,jsonb,boolean),public.nitaq_crm_capabilities_v2(),public.nitaq_crm_merge_profile_v2(text,text) from public,anon;
grant execute on function public.nitaq_crm_apply_v2(uuid,jsonb,boolean),public.nitaq_crm_capabilities_v2(),public.nitaq_crm_merge_profile_v2(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
