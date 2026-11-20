-- Only wrap auth.uid() in an initplan. Do not change roles, predicates or direct-write guards.
begin;
do $patch$
declare p record; expression text;
begin
 for p in select schemaname,tablename,policyname,qual,with_check from pg_policies
   where schemaname='public' and tablename in ('nitaq_crm_records','nitaq_crm_profiles')
   and policyname in ('records_insert','records_update','records_delete','profiles_update_self') loop
  if p.qual is not null and position('auth.uid()' in p.qual)>0 and position('SELECT auth.uid()' in p.qual)=0 then
   expression:=replace(p.qual,'auth.uid()','(select auth.uid())');
   execute format('alter policy %I on %I.%I using (%s)',p.policyname,p.schemaname,p.tablename,expression);
  end if;
  if p.with_check is not null and position('auth.uid()' in p.with_check)>0 and position('SELECT auth.uid()' in p.with_check)=0 then
   expression:=replace(p.with_check,'auth.uid()','(select auth.uid())');
   execute format('alter policy %I on %I.%I with check (%s)',p.policyname,p.schemaname,p.tablename,expression);
  end if;
 end loop;
end $patch$;
commit;
