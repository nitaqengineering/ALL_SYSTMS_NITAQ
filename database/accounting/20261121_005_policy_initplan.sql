-- Same policy predicates and grants; evaluate the caller identity once per statement.
begin;
alter function public.nitaq_touch() set search_path='';
do $patch$
declare p record; expression text;
begin
 for p in select schemaname,tablename,policyname,qual,with_check from pg_policies
   where schemaname='public' and tablename='nitaq_profiles' and policyname='nitaq_profiles_select' loop
  if p.qual is not null and position('auth.uid()' in p.qual)>0 and position('SELECT auth.uid()' in p.qual)=0 then
   expression:=replace(p.qual,'auth.uid()','(select auth.uid())');
   execute format('alter policy %I on %I.%I using (%s)',p.policyname,p.schemaname,p.tablename,expression);
  end if;
 end loop;
end $patch$;
commit;
