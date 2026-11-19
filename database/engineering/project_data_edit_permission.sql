-- Explicit permission for existing project metadata, separate from manager and stage-edit roles.
begin;
do $patch$
declare src text; old_guard text; new_guard text;
begin
 src:=replace(pg_get_functiondef('public.nitaq_engineering_workspace_save_v1(uuid,jsonb,jsonb,jsonb)'::regprocedure),chr(13),'');
 old_guard:=$old$(profile#>>'{permissions,edit}' is distinct from 'true' and
        profile#>>'{permissions,assign}' is distinct from 'true' and
        profile#>>'{permissions,editAll}' is distinct from 'true')$old$;
 new_guard:=$new$(profile#>>'{permissions,edit}' is distinct from 'true' and
        profile#>>'{permissions,assign}' is distinct from 'true' and
        profile#>>'{permissions,editAll}' is distinct from 'true' and
        profile#>>'{permissions,editProject}' is distinct from 'true')$new$;
 if position(old_guard in src)>0 then src:=replace(src,old_guard,new_guard);
 elsif position(new_guard in src)=0 then raise exception 'Project edit entry guard drift';end if;
 old_guard:=$old$if (current_doc-'stages'-'workflow'-'history'-'permit'-'supervision') is distinct from
        (next_doc-'stages'-'workflow'-'history'-'permit'-'supervision') then
       raise exception 'Project administration requires manager' using errcode='42501';
     end if;$old$;
 new_guard:=$new$if (current_doc-'stages'-'workflow'-'history'-'permit'-'supervision') is distinct from
        (next_doc-'stages'-'workflow'-'history'-'permit'-'supervision') then
       if profile#>>'{permissions,editProject}' is distinct from 'true' or
         ((current_doc-'stages'-'workflow'-'history'-'permit'-'supervision') - array['name','sketch','projectType','workKind','desc','descEn','location','owner','service','telecom','system','municipality']) is distinct from
         ((next_doc-'stages'-'workflow'-'history'-'permit'-'supervision') - array['name','sketch','projectType','workKind','desc','descEn','location','owner','service','telecom','system','municipality']) then
         raise exception 'Project administration requires manager' using errcode='42501';
       end if;
       if nullif(current_doc->>'accountingProjectId','') is not null and
         current_doc->'name' is distinct from next_doc->'name' then
         raise exception 'Accounting owner name is read-only' using errcode='42501';
       end if;
       if current_doc->'owner' is distinct from next_doc->'owner' and
         profile#>>'{permissions,assign}' is distinct from 'true' then
         raise exception 'Project owner assignment requires permission' using errcode='42501';
       end if;
     end if;$new$;
 if position(old_guard in src)>0 then src:=replace(src,old_guard,new_guard);
 elsif position(new_guard in src)=0 then raise exception 'Project metadata guard drift';end if;
 old_guard:=$old$if (current_doc->'permit' is distinct from next_doc->'permit' or
       current_doc->'supervision' is distinct from next_doc->'supervision') and
       (not design_transition$old$;
 new_guard:=$new$if (current_doc->'permit' is distinct from next_doc->'permit' or
       current_doc->'supervision' is distinct from next_doc->'supervision') and not (
         profile#>>'{permissions,editProject}' is not distinct from 'true' and
         current_doc->'supervision' is not distinct from next_doc->'supervision' and
         current_doc->>'permit' is distinct from 'صدرت' and
         next_doc->>'permit'='بانتظار المتطلبات') and
       (not design_transition$new$;
 if position(old_guard in src)>0 then src:=replace(src,old_guard,new_guard);
 elsif position(new_guard in src)=0 then raise exception 'Project derived permit guard drift';end if;
 execute src;
end $patch$;
insert into nitaq_engineering.migrations(version) values('project_data_edit_permission') on conflict do nothing;
notify pgrst,'reload schema';
commit;
