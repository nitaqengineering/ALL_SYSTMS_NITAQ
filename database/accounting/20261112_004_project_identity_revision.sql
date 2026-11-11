-- Lightweight fingerprint of the exact project identity projection visible to this caller.
-- SECURITY INVOKER retains nitaq_records RLS; no new data visibility is granted.
begin;
create or replace function public.nitaq_accounting_project_identity_revision_v1() returns text
language sql stable security invoker set search_path=pg_catalog,public as $$
 select md5(coalesce(jsonb_agg(jsonb_build_array(id,
 data->'projectNo',data->'name',data->'owner',data->'plotNumber',data->'ownershipNumber',
 data->'landType',data->'emirate',data->'area') order by id)::text,'[]'))
 from public.nitaq_records where entity='projects';
$$;
revoke all on function public.nitaq_accounting_project_identity_revision_v1() from public,anon;
grant execute on function public.nitaq_accounting_project_identity_revision_v1() to authenticated;
commit;
