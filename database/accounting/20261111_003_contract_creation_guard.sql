-- Accounting database only. Enforce financial creation authority without changing existing records.
begin;
create or replace function public.nitaq_contract_creation_guard_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if public.nitaq_role() is distinct from 'engineer' then return new; end if;
 if new.entity='contracts' or (new.entity='projects' and
   exists(select 1 from jsonb_each(new.data) e where e.key in ('designFee','supervisionMonthly','supervisionMonths') and e.value not in ('null'::jsonb,'0'::jsonb,'"0"'::jsonb,'""'::jsonb))) then
   raise exception using errcode='42501',message='NITAQ_CONTRACT_FINANCIAL_CREATE_DENIED';
 end if;
 return new;
end $$;
revoke all on function public.nitaq_contract_creation_guard_v1() from public,anon,authenticated;
drop trigger if exists nitaq_contract_creation_guard_v1 on public.nitaq_records;
create trigger nitaq_contract_creation_guard_v1 before insert on public.nitaq_records
 for each row when (new.entity in ('contracts','projects')) execute function public.nitaq_contract_creation_guard_v1();
commit;
