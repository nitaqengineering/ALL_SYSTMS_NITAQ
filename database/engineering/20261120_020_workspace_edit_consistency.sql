-- Align stage-level workflow/tender editing with editAll. Financial and document guards remain separate.
begin;
do $patch$
declare src text; old_guard text; new_guard text;
begin
 src:=replace(pg_get_functiondef('public.nitaq_engineering_workspace_save_v1(uuid,jsonb,jsonb,jsonb)'::regprocedure),chr(13),'');
 if position('-- workspace_edit_consistency_v1' in src)=0 then
 old_guard:=$old$if current_doc->'workflow' is distinct from next_doc->'workflow' then
       if profile#>>'{permissions,edit}' is distinct from 'true' then$old$;
 new_guard:=$new$-- workspace_edit_consistency_v1
     if current_doc->'workflow' is distinct from next_doc->'workflow' then
       if current_doc#>>'{stages,design,status}' in ('HOLD','DONE') then
         raise exception 'Workflow project is stopped' using errcode='42501';
       end if;
       if profile#>>'{permissions,edit}' is distinct from 'true'
         and profile#>>'{permissions,editAll}' is distinct from 'true' then$new$;
 if position(old_guard in src)=0 then raise exception 'Workflow permission guard drift';end if;
 src:=replace(src,old_guard,new_guard);
 old_guard:=$old$if next_doc->'workflow'->stage.key is distinct from current_doc->'workflow'->stage.key
           and current_doc->'stages'->stage.key->>'engineer' is distinct from profile->>'name' then$old$;
 new_guard:=$new$if next_doc->'workflow'->stage.key is distinct from current_doc->'workflow'->stage.key
           and profile#>>'{permissions,editAll}' is distinct from 'true'
           and current_doc->'stages'->stage.key->>'engineer' is distinct from profile->>'name' then$new$;
 if position(old_guard in src)=0 then raise exception 'Workflow assignee guard drift';end if;
 src:=replace(src,old_guard,new_guard);
 old_guard:=$old$raise exception 'Workflow is assigned to another engineer' using errcode='42501';
         end if;$old$;
 new_guard:=$new$raise exception 'Workflow is assigned to another engineer' using errcode='42501';
         end if;
         if current_doc#>array['workflow',stage.key,'review'] is distinct from next_doc#>array['workflow',stage.key,'review']
           and (current_doc#>>array['workflow',stage.key,'review','status']='مصرح بالتقديم'
             or next_doc#>>array['workflow',stage.key,'review','status']='مصرح بالتقديم'
             or coalesce(current_doc#>>array['workflow',stage.key,'review','authorizedBy'],'') is distinct from coalesce(next_doc#>>array['workflow',stage.key,'review','authorizedBy'],'')) then
           raise exception 'Submission authorization requires manager' using errcode='42501';
         end if;$new$;
 if position(old_guard in src)=0 then raise exception 'Workflow review guard drift';end if;
 src:=replace(src,old_guard,new_guard);
 -- Separate the two non-financial tender fields from the manager-only project metadata.
 old_guard:=$old$(current_doc-'stages'-'workflow'-'history'-'permit'-'supervision')$old$;
 if position(old_guard in src)=0 then raise exception 'Project metadata guard drift';end if;
 src:=replace(src,old_guard,$new$(current_doc-'stages'-'workflow'-'history'-'permit'-'supervision'-'tender')$new$);
 src:=replace(src,$old$(next_doc-'stages'-'workflow'-'history'-'permit'-'supervision')$old$,$new$(next_doc-'stages'-'workflow'-'history'-'permit'-'supervision'-'tender')$new$);
 old_guard:=$old$design_transition:=current_doc#>>'{stages,design,status}' is distinct from next_doc#>>'{stages,design,status}';$old$;
 new_guard:=$new$design_transition:=current_doc#>>'{stages,design,status}' is distinct from next_doc#>>'{stages,design,status}';
     if current_doc->'tender' is distinct from next_doc->'tender' then
       if jsonb_typeof(next_doc->'tender') is distinct from 'object'
         or (coalesce(nullif(current_doc->'tender','null'::jsonb),'{}'::jsonb)-array['contractor','offers']) is distinct from
            ((next_doc->'tender')-array['contractor','offers'])
         or current_doc#>>'{stages,design,status}' in ('HOLD','DONE')
         or (profile#>>'{permissions,editAll}' is distinct from 'true' and
           (profile#>>'{permissions,edit}' is distinct from 'true' or
            current_doc#>>'{stages,tender,engineer}' is distinct from profile->>'name')) then
         raise exception 'Tender editing requires stage permission' using errcode='42501';
       end if;
       if exists(select 1 from jsonb_each(next_doc->'tender') entry
          where entry.key in ('contractor','offers') and jsonb_typeof(entry.value)<>'string') then
         raise exception 'Invalid tender text' using errcode='22023';
       end if;
     end if;$new$;
 if position(old_guard in src)=0 then raise exception 'Project transition guard drift';end if;
 src:=replace(src,old_guard,new_guard);
 execute src;
 end if;
end $patch$;
-- Public deployment metadata only; contains no workspace, identity or project data.
create or replace function public.nitaq_engineering_capabilities_v1()
returns jsonb language sql stable security invoker set search_path=pg_catalog,public
as $function$
 select jsonb_build_object('version',1,'features',jsonb_build_object(
  'workspaceEditConsistency',position('-- workspace_edit_consistency_v1' in src)>0,
  'editProject',position('permissions,editProject' in src)>0,
  'ready',position('''READY''' in src)>0,
  'dwgEgy',position('''dwg egy''' in src)>0,
  'rev',position('''rev''' in src)>0))
 from (select pg_get_functiondef('public.nitaq_engineering_workspace_save_v1(uuid,jsonb,jsonb,jsonb)'::regprocedure) src) d;
$function$;
revoke all on function public.nitaq_engineering_capabilities_v1() from public;
grant execute on function public.nitaq_engineering_capabilities_v1() to anon,authenticated;
insert into nitaq_engineering.migrations(version) values('20261120_020_workspace_edit_consistency') on conflict do nothing;
notify pgrst,'reload schema';
commit;
