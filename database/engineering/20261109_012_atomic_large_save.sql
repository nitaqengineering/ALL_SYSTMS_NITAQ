-- ACCOUNTING / ENGINEERING PROJECT ONLY. Large saves remain all-or-nothing.
begin;
create table if not exists nitaq_engineering.batch_receipts_v2(
 actor uuid not null,operation uuid not null,request jsonb not null,result jsonb not null,primary key(actor,operation));
revoke all on nitaq_engineering.batch_receipts_v2 from public,anon,authenticated;
create table if not exists nitaq_engineering.batch_context_v2(transaction_id bigint primary key,actor uuid not null);
revoke all on nitaq_engineering.batch_context_v2 from public,anon,authenticated;
-- Avoid tens of thousands of UPDATEs to the same revision row in one transaction.
-- Only a private, non-client-writable context can suppress intermediate bumps.
create or replace function nitaq_engineering.bump_workspace() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from nitaq_engineering.batch_context_v2 where transaction_id=txid_current() and actor=auth.uid())
    and not exists(select 1 from nitaq_engineering.restore_context where transaction_id=txid_current() and actor=auth.uid()) then
  update nitaq_engineering.workspace set revision=revision+1 where id=true;
 end if;
 return null;
end $$;
create or replace function public.nitaq_engineering_workspace_save_v2(
 p_operation uuid,p_changes jsonb,p_settings_before jsonb default null,p_settings_after jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior nitaq_engineering.batch_receipts_v2;request jsonb; chunk jsonb;result jsonb;detail text;
 idx integer; size integer; child uuid;
begin
 if nitaq_engineering.workspace_profile() is null then raise exception 'Workspace edit denied' using errcode='42501';end if;
 if p_operation is null or jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>5000 or octet_length(p_changes::text)>50000000 then raise exception 'Invalid batch' using errcode='22023';end if;
 if (select count(*) from (select x->>'id' from jsonb_array_elements(p_changes) x group by 1) q)<>jsonb_array_length(p_changes) then raise exception 'Duplicate project identifiers' using errcode='22023';end if;
 perform pg_advisory_xact_lock(734019922);
 request=jsonb_build_object('changes',p_changes,'settingsBefore',p_settings_before,'settingsAfter',p_settings_after);
 select * into prior from nitaq_engineering.batch_receipts_v2 where actor=auth.uid() and operation=p_operation;
 if found then
  if prior.request is distinct from request then raise exception 'Operation reused' using errcode='22023';end if;
  return prior.result||'{"result":"already_saved"}'::jsonb;
 end if;
 size=jsonb_array_length(p_changes);
 -- Subtransaction rolls back earlier chunks even when v1 reports a conflict as JSON.
 begin
  insert into nitaq_engineering.batch_context_v2 values(txid_current(),auth.uid());
  for idx in 0..greatest((size-1)/100,0) loop
   select coalesce(jsonb_agg(value order by n),'[]'::jsonb) into chunk from jsonb_array_elements(p_changes) with ordinality e(value,n) where n>idx*100 and n<=(idx+1)*100;
   child=(md5(p_operation::text||':'||idx::text))::uuid;
   result=public.nitaq_engineering_workspace_save_v1(child,chunk,
    case when (idx+1)*100>=size then p_settings_before end,case when (idx+1)*100>=size then p_settings_after end);
   if result->>'result'='conflict' then raise exception using errcode='40001',message='Atomic batch conflict',detail=result::text;end if;
   if result->>'result' not in ('saved','already_saved') then raise exception 'Unconfirmed child save';end if;
  end loop;
  delete from nitaq_engineering.batch_context_v2 where transaction_id=txid_current();
  update nitaq_engineering.workspace set revision=revision+1 where id=true;
 exception when serialization_failure then
  get stacked diagnostics detail=PG_EXCEPTION_DETAIL;
  if detail is not null and detail<>'' then return detail::jsonb;end if;
  raise;
 end;
 result=result||jsonb_build_object('result','saved','revision',(select revision from nitaq_engineering.workspace where id=true));
 insert into nitaq_engineering.batch_receipts_v2 values(auth.uid(),p_operation,request,result);
 return result;
end $$;
revoke all on function public.nitaq_engineering_workspace_save_v2(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.nitaq_engineering_workspace_save_v2(uuid,jsonb,jsonb,jsonb) to authenticated;
insert into nitaq_engineering.migrations(version) values('20261109_012_atomic_large_save') on conflict do nothing;
notify pgrst,'reload schema';
commit;
