-- ACCOUNTING PROJECT ONLY. An engineer may keep editing descriptive project/contract fields,
-- but not the money, type, status or project link of an existing contract, nor a project's fee fields.
-- Owners, accountants and administrative SQL sessions are unaffected. Safe to reapply.
begin;
create or replace function public.nitaq_contract_guard_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare field text; protected text[];
begin
 if public.nitaq_role() is distinct from 'engineer' then return new;end if;
 protected:=case new.entity
  when 'contracts' then array['projectId','category','type','commissionType','commissionPct','commissionAmount','designValue','supervisionMonthly','supervisionMonths','value','status']
  when 'projects' then array['designFee','supervisionMonthly','supervisionMonths']
  else array[]::text[] end;
 foreach field in array protected loop
  if old.data->field is distinct from new.data->field then
   raise exception using errcode='42501',message='NITAQ_CONTRACT_FINANCIAL_CHANGE_DENIED',detail='Field '||field||' is changed by the owner or accountant only.';
  end if;
 end loop;
 return new;
end $$;
comment on function public.nitaq_contract_guard_v1() is 'NITAQ_CONTRACT_GUARD_V1';
revoke all on function public.nitaq_contract_guard_v1() from public,anon,authenticated;
drop trigger if exists nitaq_contract_guard_v1 on public.nitaq_records;
create trigger nitaq_contract_guard_v1 before update on public.nitaq_records
 for each row when (new.entity in ('contracts','projects')) execute function public.nitaq_contract_guard_v1();
commit;
