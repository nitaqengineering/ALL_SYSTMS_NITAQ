begin;
create or replace function public.nitaq_engineering_workspace_save_v1(
 p_operation uuid,p_changes jsonb,p_settings_before jsonb default null,p_settings_after jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid:=auth.uid();
 prior nitaq_engineering.workspace_changes%rowtype;
 request jsonb:=jsonb_build_object('changes',p_changes,'settingsBefore',p_settings_before,'settingsAfter',p_settings_after);
 change jsonb;
 current_doc jsonb;
 next_doc jsonb;
 stage record;
 batch_id uuid;
 profile jsonb;
 manager boolean;
 design_transition boolean;
 task jsonb;
 old_task jsonb;
 verified_undo boolean;
 restoring boolean;
begin
 profile:=nitaq_engineering.workspace_profile();
 manager:=coalesce((profile->>'manager')::boolean,false);
 restoring:=manager and exists(select 1 from nitaq_engineering.restore_context
   where transaction_id=txid_current() and actor=actor_id);
 if profile is null then
   raise exception 'Workspace edit denied' using errcode='42501';
 end if;
 if p_operation is null or jsonb_typeof(p_changes) is distinct from 'array'
   or jsonb_array_length(p_changes)>100
   or (p_settings_before is null) <> (p_settings_after is null) then
   raise exception 'Invalid workspace request' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(p_changes) c
   where c->>'id' is null or length(c->>'id')>200)
   or (select count(*)<>count(distinct c->>'id') from jsonb_array_elements(p_changes) c) then
   raise exception 'Invalid project identifiers' using errcode='22023';
 end if;
 -- Shared lifecycle locks follow the same order as the coordination endpoint.
 perform 1 from nitaq_engineering.projects where id in
   (select c->>'id' from jsonb_array_elements(p_changes) c) order by id for update;
 perform 1 from nitaq_engineering.workspace where id=true for update;
 select * into prior from nitaq_engineering.workspace_changes where operation_id=p_operation;
 if found then
   if prior.actor<>actor_id or prior.request<>request then
     raise exception 'Operation identifier already used' using errcode='22023';
   end if;
   return jsonb_build_object('result','already_saved');
 end if;
 if p_settings_before is not null and
   p_settings_before is distinct from (select settings from nitaq_engineering.workspace where id=true) then
   return jsonb_build_object('result','conflict','project','settings');
 end if;
 if not manager and p_settings_after is not null then
   if (p_settings_after-'tasks') is distinct from (p_settings_before-'tasks') or
     jsonb_typeof(p_settings_after->'tasks') is distinct from 'array' then
     raise exception 'Only managers can change workspace settings' using errcode='42501';
   end if;
   for task in select value from jsonb_array_elements(p_settings_after->'tasks') loop
     select value into old_task from jsonb_array_elements(coalesce(p_settings_before->'tasks','[]'::jsonb)) t
       where t->>'id'=task->>'id';
     if task is distinct from old_task then
       if profile#>>'{permissions,edit}' is distinct from 'true' or not exists(
         select 1 from nitaq_engineering.stages s where s.project_id=task->>'projectId'
           and s.stage_key=task->>'stage' and s.data->>'engineer'=profile->>'name') then
         raise exception 'Task is assigned to another engineer' using errcode='42501';
       end if;
       if task->>'engineer' is distinct from profile->>'name' and
         profile#>>'{permissions,assign}' is distinct from 'true' then
         raise exception 'Task assignment requires permission' using errcode='42501';
       end if;
     end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(coalesce(p_settings_before->'tasks','[]'::jsonb)) t
     where not exists(select 1 from jsonb_array_elements(p_settings_after->'tasks') n where n->>'id'=t->>'id')
       and t->>'engineer' is distinct from profile->>'name') then
     raise exception 'Cannot remove another engineer task' using errcode='42501';
   end if;
 end if;
 for change in select value from jsonb_array_elements(p_changes) loop
   current_doc:=nitaq_engineering.project_document(change->>'id');
   if current_doc is distinct from nullif(change->'before','null'::jsonb) then
     return jsonb_build_object('result','conflict','project',change->>'id');
   end if;
   next_doc:=nullif(change->'after','null'::jsonb);
   verified_undo:=false;
   if manager and not restoring and current_doc#>>'{stages,design,status}' in ('HOLD','DONE')
     and current_doc#>>'{stages,design,status}' is distinct from next_doc#>>'{stages,design,status}' then
     verified_undo:=exists(
       select 1 from nitaq_engineering.workspace_changes a,
         jsonb_array_elements(a.request->'changes') c
       where a.request->'changes' @> jsonb_build_array(jsonb_build_object('id',change->>'id'))
         and c->>'id'=change->>'id' and c->'after'=current_doc and c->'before'=next_doc
     );
   end if;
   if not manager then
     if current_doc is null or next_doc is null or
       (profile#>>'{permissions,edit}' is distinct from 'true' and
        profile#>>'{permissions,assign}' is distinct from 'true') then
       raise exception 'Project edit denied' using errcode='42501';
     end if;
     design_transition:=current_doc#>>'{stages,design,status}' is distinct from next_doc#>>'{stages,design,status}';
     if (current_doc-'stages'-'workflow'-'history'-'permit'-'supervision') is distinct from
        (next_doc-'stages'-'workflow'-'history'-'permit'-'supervision') then
       raise exception 'Project administration requires manager' using errcode='42501';
     end if;
     if (current_doc->'permit' is distinct from next_doc->'permit' or
       current_doc->'supervision' is distinct from next_doc->'supervision') and
       (not design_transition or current_doc#>>'{stages,design,engineer}' is distinct from profile->>'name'
         or (next_doc->>'permit' is distinct from current_doc->>'permit' and
           next_doc->>'permit' is distinct from 'بانتظار المتطلبات')) then
       raise exception 'Permit and supervision require manager' using errcode='42501';
     end if;
     for stage in select key,value from jsonb_each(next_doc->'stages') loop
       if stage.value is distinct from current_doc->'stages'->stage.key then
         if profile#>>'{permissions,assign}'='true' and
           stage.value-'engineer' = (current_doc->'stages'->stage.key)-'engineer' then
           continue;
         end if;
         if profile#>>'{permissions,edit}' is distinct from 'true' then
           raise exception 'Stage editing requires permission' using errcode='42501';
         end if;
         if design_transition and stage.key<>'design'
           and current_doc#>>'{stages,design,engineer}'=profile->>'name'
           and stage.value-'status'-'exemptedBy' = (current_doc->'stages'->stage.key)-'status'-'exemptedBy' then
           continue;
         end if;
         if current_doc->'stages'->stage.key->>'engineer' is distinct from profile->>'name' then
           raise exception 'Stage is assigned to another engineer' using errcode='42501';
         end if;
         if stage.value->'engineer' is distinct from current_doc->'stages'->stage.key->'engineer'
           and profile#>>'{permissions,assign}' is distinct from 'true' then
           raise exception 'Assignment requires permission' using errcode='42501';
         end if;
         if stage.value->'exemptedBy' is distinct from current_doc->'stages'->stage.key->'exemptedBy' then
           raise exception 'Exemption requires manager' using errcode='42501';
         end if;
       end if;
     end loop;
     if current_doc->'workflow' is distinct from next_doc->'workflow' then
       if profile#>>'{permissions,edit}' is distinct from 'true' then
         raise exception 'Workflow editing requires permission' using errcode='42501';
       end if;
       for stage in select k as key from
         (select jsonb_object_keys(coalesce(current_doc->'workflow','{}'::jsonb)) k
          union select jsonb_object_keys(coalesce(next_doc->'workflow','{}'::jsonb))) all_keys loop
         if next_doc->'workflow'->stage.key is distinct from current_doc->'workflow'->stage.key
           and current_doc->'stages'->stage.key->>'engineer' is distinct from profile->>'name' then
           raise exception 'Workflow is assigned to another engineer' using errcode='42501';
         end if;
       end loop;
     end if;
   end if;
   if next_doc is not null then
     if jsonb_typeof(next_doc) is distinct from 'object' or next_doc->>'id' is distinct from change->>'id'
       or jsonb_typeof(next_doc->'stages') is distinct from 'object'
       or next_doc#>>'{stages,design,status}' is null then
       raise exception 'Invalid project document' using errcode='22023';
     end if;
     if jsonb_typeof(next_doc->'supervision') is distinct from 'object' then
       raise exception 'Supervision data is required' using errcode='22023';
     end if;
     if (next_doc ? 'workflow' and jsonb_typeof(next_doc->'workflow')<>'object') or
        (next_doc ? 'info' and jsonb_typeof(next_doc->'info')<>'object') or
        (next_doc ? 'documents' and jsonb_typeof(next_doc->'documents')<>'array') or
        (next_doc ? 'requests' and jsonb_typeof(next_doc->'requests')<>'array') then
       raise exception 'Project section has an invalid format' using errcode='22023';
     end if;
     if next_doc#>>'{stages,design,status}' not in ('REQ','OK','HOLD','DONE') then
       raise exception 'Invalid design status' using errcode='22023';
     end if;
     if current_doc#>>'{stages,design,status}'='DONE' and
        next_doc->'stages' is distinct from current_doc->'stages' and not verified_undo and not restoring then
       raise exception 'Closed project stages cannot change' using errcode='22023';
     end if;
     if next_doc#>>'{stages,design,status}' in ('HOLD','DONE') and exists(
       select 1 from jsonb_each(next_doc->'stages') s where s.key<>'design'
         and s.value->>'status' is distinct from next_doc#>>'{stages,design,status}') then
       raise exception 'Stopped project stages must follow design' using errcode='22023';
     end if;
     if next_doc#>>'{stages,coordination,status}' not in ('REQ','COM','OK','HOLD','DONE') then
       raise exception 'Invalid coordination status' using errcode='22023';
     end if;
     if exists(select 1 from jsonb_each(next_doc->'stages') s
       where s.key not in ('design','coordination') and
         not(s.value->>'status'=any(array['REQ','READY','SUB','COM','OK','N/A'])
           or (s.value->>'status' in ('HOLD','DONE') and
             s.value->>'status'=next_doc#>>'{stages,design,status}')
           or coalesce(coalesce(p_settings_after,(select settings from nitaq_engineering.workspace where id=true))
             ->'custom'->s.key ? (s.value->>'status'),false))) then
       raise exception 'Invalid department status' using errcode='22023';
     end if;
     if exists(select 1 from unnest(array['design','planning','coordination','electric',
       'water','gas','telecom','civil','struct','sanitary','munArch','munStruct','munSanitary','tender']) k
       where jsonb_typeof(next_doc->'stages'->k) is distinct from 'object'
         or jsonb_typeof(next_doc->'stages'->k->'status') is distinct from 'string') then
       raise exception 'Required stage is missing' using errcode='22023';
     end if;
     if current_doc#>>'{stages,design,status}'='HOLD' and
        next_doc#>>'{stages,design,status}'='OK' and not verified_undo and not restoring then
       raise exception 'Resume design through REQ' using errcode='22023';
     end if;
     if (current_doc#>>'{stages,design,status}' is distinct from next_doc#>>'{stages,design,status}')
       and (next_doc#>>'{stages,design,status}'='OK' or
         (current_doc#>>'{stages,design,status}'='HOLD' and next_doc#>>'{stages,design,status}'='REQ'))
       and not verified_undo and not restoring and exists(select 1 from jsonb_each(next_doc->'stages') s
         where s.key<>'design' and s.value->>'status' is distinct from 'REQ') then
       raise exception 'Design transition must reset all departments' using errcode='22023';
     end if;
     -- A recorded issued permit is a historical fact. Changing a current approval
     -- does not undo its issuance. Validate prerequisites for new applications/issuance.
     if next_doc->>'permit' in ('تم التقديم','صدرت') and
       (current_doc->>'permit' is distinct from 'صدرت' or next_doc->>'permit' is distinct from 'صدرت') and
       next_doc#>>'{stages,design,status}' not in ('HOLD','DONE') then
       if next_doc->'contract' is distinct from 'true'::jsonb or exists(
         select 1 from unnest(array['planning','electric','water','gas','telecom',
           'civil','munArch','munStruct','munSanitary']) k
         where not(k='gas' and next_doc->>'service'='FEWA') and
           (coalesce(next_doc->'stages'->k->>'status','') not in ('OK','N/A')
             or (next_doc->'stages'->k->>'status'='N/A' and
               coalesce(next_doc->'stages'->k->>'exemptedBy','')='')
             or (next_doc#>array['workflow',k,'submissions', '-1'] is not null and
               next_doc#>>array['workflow',k,'submissions','-1','outcome'] is distinct from 'اعتماد'))) then
         raise exception 'Permit prerequisites are incomplete' using errcode='22023';
       end if;
     end if;
     if next_doc->>'permit'='صدرت' and current_doc->>'permit' is distinct from 'صدرت' and not restoring then
       if coalesce(next_doc#>>'{permitIssue,number}','')='' or
         coalesce(next_doc#>>'{permitIssue,date}','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
         raise exception 'Permit number and issue date are required' using errcode='22023';
       end if;
       perform (next_doc#>>'{permitIssue,date}')::date;
     end if;
   end if;
 end loop;
 select id into batch_id from nitaq_engineering.import_batches order by imported_at desc limit 1;
 for change in select value from jsonb_array_elements(p_changes) loop
   next_doc:=nullif(change->'after','null'::jsonb);
   if next_doc is null then
     -- Archive preserves relationships and history. Permanent deletion needs a separate operation.
     raise exception 'Archive projects instead of deleting them' using errcode='22023';
   end if;
   insert into nitaq_engineering.projects(id,import_id,data)
     values(change->>'id',batch_id,next_doc-'stages')
     on conflict(id) do update set data=excluded.data,version=nitaq_engineering.projects.version+1;
   for stage in select key,value from jsonb_each(next_doc->'stages') loop
     insert into nitaq_engineering.stages(project_id,stage_key,data)
       values(change->>'id',stage.key,stage.value)
       on conflict(project_id,stage_key) do update
         set data=excluded.data,version=nitaq_engineering.stages.version+1
         where nitaq_engineering.stages.data is distinct from excluded.data;
   end loop;
 end loop;
 if p_settings_after is not null then
   if jsonb_typeof(p_settings_after) is distinct from 'object' then
     raise exception 'Invalid settings' using errcode='22023';
   end if;
   if jsonb_typeof(p_settings_after->'custom') is distinct from 'object' or
      jsonb_typeof(p_settings_after->'municipalities') is distinct from 'array' then
     raise exception 'Workspace lists are invalid' using errcode='22023';
   end if;
   if p_settings_after ? 'users' then
     if jsonb_typeof(p_settings_after->'users') is distinct from 'array' then
       raise exception 'User list is invalid' using errcode='22023';
     end if;
     if exists(select lower(u->>'email') from jsonb_array_elements(p_settings_after->'users') u
       where coalesce(u->>'email','')<>'' group by lower(u->>'email') having count(*)>1) then
       raise exception 'A login email can belong to only one engineering profile' using errcode='22023';
     end if;
   end if;
   if p_settings_after ? 'tasks' then
     if jsonb_typeof(p_settings_after->'tasks')<>'array' then
       raise exception 'Task list is invalid' using errcode='22023';
     end if;
     if exists(select 1 from jsonb_array_elements(p_settings_after->'tasks') t
       where jsonb_typeof(t)<>'object' or coalesce(t->>'id','')=''
         or jsonb_typeof(t->'title') is distinct from 'string'
         or jsonb_typeof(t->'engineer') is distinct from 'string'
         or jsonb_typeof(t->'note') is distinct from 'string'
         or jsonb_typeof(t->'date') is distinct from 'string'
         or coalesce(t->>'status','') not in ('open','done')
         or not exists(select 1 from nitaq_engineering.stages s
           where s.project_id=t->>'projectId' and s.stage_key=t->>'stage')) or
       (select count(*)<>count(distinct t->>'id') from jsonb_array_elements(p_settings_after->'tasks') t) then
       raise exception 'Task data is invalid' using errcode='22023';
     end if;
   end if;
   update nitaq_engineering.workspace set settings=p_settings_after,revision=revision+1 where id=true;
 end if;
 insert into nitaq_engineering.workspace_changes(operation_id,actor,request)
   values(p_operation,actor_id,request);
 return jsonb_build_object('result','saved','revision',
   (select revision from nitaq_engineering.workspace where id=true));
end;
$$;

insert into nitaq_engineering.migrations(version) values('20261108_010_issued_permit_updates') on conflict do nothing;
notify pgrst,'reload schema';
commit;
