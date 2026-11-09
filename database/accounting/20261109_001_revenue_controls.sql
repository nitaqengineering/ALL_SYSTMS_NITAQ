-- ACCOUNTING PROJECT ONLY. Transaction fails on unexpected definition drift.
begin;
do $migration$
declare src text;
begin
 src=pg_get_functiondef('public.nitaq_financial_bundle_guard_v1()'::regprocedure);
 if position('"otherIncome":{"fields":["category"' in src)>0 then
  execute replace(src,'"otherIncome":{"fields":["category"','"otherIncome":{"fields":["amount","category"');
 elsif position('"otherIncome":{"fields":["amount","category"' in src)=0 then raise exception 'Review financial guard definition drift';end if;
 src=pg_get_functiondef('public.nitaq_financial_audit_capture_v1()'::regprocedure);
 if position('''treasury'',''employees''' in src)>0 then
  execute replace(src,'''treasury'',''employees''','''treasury'',''otherIncome'',''timesheets'',''employees''');
 elsif position('''treasury'',''otherIncome'',''timesheets'',''employees''' in src)=0 then raise exception 'Review audit definition drift';end if;
end $migration$;
-- Preserve a newer engineering invitation handler, even when this file is reapplied.
do $guard$
declare src text;
begin
 src=pg_get_functiondef('public.nitaq_handle_new_user()'::regprocedure);
 if position('nitaq_engineering.auth_bindings_v2' in src)>0 or position('No accounting profile is granted' in src)>0 then return;end if;
 if position('nitaq_profiles' in src)=0 then raise exception 'Review Auth trigger definition drift';end if;
 execute $definition$
  create or replace function public.nitaq_handle_new_user() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $body$
  begin
   -- No accounting profile is granted by registration or an engineering invitation.
   return new;
  end $body$;
 $definition$;
end $guard$;
commit;
