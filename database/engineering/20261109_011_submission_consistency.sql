-- ACCOUNTING / ENGINEERING PROJECT ONLY. Preserve existing function body and guards.
begin;
create or replace function nitaq_engineering.latest_submission_v2(cycles jsonb) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select value from jsonb_array_elements(coalesce(cycles,'[]'::jsonb)) with ordinality c(value,n)
 where coalesce(value->>'submitted','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 order by value->>'submitted' desc nulls last,n desc limit 1
$$;
revoke all on function nitaq_engineering.latest_submission_v2(jsonb) from public,anon,authenticated;
do $migration$
declare src text; signature text;
begin
 select p.oid::regprocedure::text into signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='nitaq_engineering_workspace_save_v1';
 src=pg_get_functiondef(signature::regprocedure);
 if position('next_doc#>array[''workflow'',k,''submissions'', ''-1'']' in src)=0 or position('next_doc#>>array[''workflow'',k,''submissions'',''-1'',''outcome'']' in src)=0 then raise exception 'Review permit definition drift';end if;
 src=replace(src,'next_doc#>array[''workflow'',k,''submissions'', ''-1'']','nitaq_engineering.latest_submission_v2(next_doc#>array[''workflow'',k,''submissions''])');
 src=replace(src,'next_doc#>>array[''workflow'',k,''submissions'',''-1'',''outcome'']','nitaq_engineering.latest_submission_v2(next_doc#>array[''workflow'',k,''submissions''])->>''outcome''');
 execute src;
end $migration$;
insert into nitaq_engineering.migrations(version) values('20261109_011_submission_consistency') on conflict do nothing;
commit;
