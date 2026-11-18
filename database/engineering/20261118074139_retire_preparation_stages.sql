-- Accounting/engineering only. Permanently retire duplicate preparation stages.
-- Forward-only, transactional and re-runnable. User explicitly requested no backup of removed data.
begin;
lock table nitaq_engineering.workspace in exclusive mode;
lock table nitaq_engineering.projects,nitaq_engineering.stages in share row exclusive mode;
-- Patch only the required-stage list; retain every financial, CAS, reopen and permit guard.
do $patch$
declare src text; old_text text:=$old$'civil','struct','sanitary','munArch'$old$;new_text text:=$new$'civil','munArch'$new$;
begin
 src:=pg_get_functiondef('public.nitaq_engineering_workspace_save_v1(uuid,jsonb,jsonb,jsonb)'::regprocedure);
 if position(old_text in src)>0 then execute replace(src,old_text,new_text);
 elsif position(new_text in src)=0 then raise exception 'Review required-stage definition drift before retiring preparation stages';end if;
end $patch$;
-- Delete preparation state without copying it into municipal approval state.
do $remove$ begin
 if exists(select 1 from nitaq_engineering.stages where stage_key in ('struct','sanitary')) then
  delete from nitaq_engineering.stages where stage_key in ('struct','sanitary');
 end if;
 if exists(select 1 from nitaq_engineering.projects where data#>'{workflow,struct}' is not null or data#>'{workflow,sanitary}' is not null or data#>'{stages,struct}' is not null or data#>'{stages,sanitary}' is not null) then
  update nitaq_engineering.projects set data=(data #- '{workflow,struct}' #- '{workflow,sanitary}' #- '{stages,struct}' #- '{stages,sanitary}'),version=version+1
  where data#>'{workflow,struct}' is not null or data#>'{workflow,sanitary}' is not null or data#>'{stages,struct}' is not null or data#>'{stages,sanitary}' is not null;
 end if;
end $remove$;
update nitaq_engineering.workspace set settings=jsonb_set(
 jsonb_set(settings #- '{custom,struct}' #- '{custom,sanitary}' #- '{columnLayout,moves,struct}' #- '{columnLayout,moves,sanitary}' #- '{columnLayout,names,struct}' #- '{columnLayout,names,sanitary}',
 '{tasks}',coalesce((select jsonb_agg(t order by n) from jsonb_array_elements(coalesce(settings->'tasks','[]'::jsonb)) with ordinality x(t,n) where t->>'stage' not in ('struct','sanitary')),'[]'::jsonb)),
 '{stageSchema}','2'::jsonb),revision=revision+1 where id=true and settings->>'stageSchema' is distinct from '2';
-- Rehome only custom display columns placed in a retired group; retain their values.
do $layout$
declare original jsonb; cleaned jsonb; item record;
begin
 select settings into original from nitaq_engineering.workspace where id=true;cleaned:=original;
 for item in select key,value from jsonb_each(coalesce(original#>'{columnLayout,moves}','{}'::jsonb)) loop
  if item.value#>>'{}' in ('struct','sanitary') then cleaned:=jsonb_set(cleaned,array['columnLayout','moves',item.key],'"design"'::jsonb);end if;
 end loop;
 for item in select key,value from jsonb_each(coalesce(original#>'{columnLayout,fields}','{}'::jsonb)) loop
  if item.value->>'group' in ('struct','sanitary') then cleaned:=jsonb_set(cleaned,array['columnLayout','fields',item.key,'group'],'"design"'::jsonb);end if;
 end loop;
 if original#>'{columnLayout,order}' is not null then
  cleaned:=jsonb_set(cleaned,'{columnLayout,order}',coalesce((select jsonb_agg(v order by n) from jsonb_array_elements(original#>'{columnLayout,order}') with ordinality x(v,n) where v#>>'{}' not in ('struct','sanitary')),'[]'::jsonb));
 end if;
 if cleaned is distinct from original then update nitaq_engineering.workspace set settings=cleaned,revision=revision+1 where id=true;end if;
end $layout$;
-- Old cached clients and old backups must not recreate the deleted stages.
create or replace function nitaq_engineering.reject_retired_preparation() returns trigger
 language plpgsql set search_path='' as $$begin
 if new.stage_key in ('struct','sanitary') then raise exception 'Preparation stage removed; refresh and use municipal approval' using errcode='22023';end if;
 return new;
end $$;
revoke all on function nitaq_engineering.reject_retired_preparation() from public,anon,authenticated;
drop trigger if exists reject_retired_preparation on nitaq_engineering.stages;
create trigger reject_retired_preparation before insert or update on nitaq_engineering.stages
 for each row execute function nitaq_engineering.reject_retired_preparation();
-- Keep historical time records; stop only running sessions of the removed stages.
select nitaq_engineering.time_close(id,null) from nitaq_engineering.time_logs where stage_key in ('struct','sanitary') and ended_at is null;
drop trigger if exists reject_retired_preparation on nitaq_engineering.time_logs;
create trigger reject_retired_preparation before insert or update of stage_key on nitaq_engineering.time_logs
 for each row execute function nitaq_engineering.reject_retired_preparation();
-- Guard settings/workflow against old tabs or old restores resurrecting deleted stages.
create or replace function nitaq_engineering.reject_retired_document() returns trigger
 language plpgsql set search_path='' as $$begin
 if tg_table_name='workspace' then
  if new.settings->>'stageSchema' is distinct from '2' or coalesce(new.settings->'custom','{}'::jsonb) ?| array['struct','sanitary'] or exists(select 1 from jsonb_array_elements(coalesce(new.settings->'tasks','[]'::jsonb)) t where t->>'stage' in ('struct','sanitary')) then
   raise exception 'Preparation stages removed; refresh workspace settings' using errcode='22023';end if;
 else
  if coalesce(new.data->'workflow','{}'::jsonb) ?| array['struct','sanitary'] or coalesce(new.data->'stages','{}'::jsonb) ?| array['struct','sanitary'] then
   raise exception 'Preparation stages removed; refresh project' using errcode='22023';end if;
 end if;
 return new;
end $$;
revoke all on function nitaq_engineering.reject_retired_document() from public,anon,authenticated;
drop trigger if exists reject_retired_document on nitaq_engineering.projects;
create trigger reject_retired_document before insert or update of data on nitaq_engineering.projects for each row execute function nitaq_engineering.reject_retired_document();
drop trigger if exists reject_retired_document on nitaq_engineering.workspace;
create trigger reject_retired_document before update of settings on nitaq_engineering.workspace for each row execute function nitaq_engineering.reject_retired_document();
insert into nitaq_engineering.migrations(version) values('20261118074139_retire_preparation_stages') on conflict do nothing;
notify pgrst,'reload schema';
commit;
