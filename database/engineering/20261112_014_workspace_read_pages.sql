-- Engineering/accounting database only. Larger bounded pages with an explicit end cursor.
begin;
create or replace function public.nitaq_engineering_workspace_read_v2(p_after text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; documents jsonb; last_id text; more boolean; profile jsonb;
begin
 profile:=nitaq_engineering.workspace_profile();
 if profile is null then raise exception 'Workspace access denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(nitaq_engineering.project_document(p.id) order by p.id),'[]'::jsonb),max(p.id)
 into documents,last_id from (select id from nitaq_engineering.projects
 where p_after is null or id>p_after order by id limit 500) p;
 select exists(select 1 from nitaq_engineering.projects where id>last_id) into more;
 select jsonb_build_object('revision',w.revision,'permissions',profile,
 'settings',case when p_after is null then w.settings else null end,
 'projects',documents,'next_after',case when more then last_id else null end)
 into result from nitaq_engineering.workspace w where id=true;
 return result;
end;
$$;
revoke all on function public.nitaq_engineering_workspace_read_v2(text) from public,anon;
grant execute on function public.nitaq_engineering_workspace_read_v2(text) to authenticated;
commit;
