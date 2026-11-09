begin;
-- Preserve the pre-synchronization values for an administrator-led rollback.
create table if not exists nitaq_engineering.identity_sync_backup (
 project_id text primary key, before_data jsonb not null, saved_at timestamptz not null default clock_timestamp()
);
alter table nitaq_engineering.identity_sync_backup enable row level security;
revoke all on nitaq_engineering.identity_sync_backup from public,anon,authenticated;
insert into nitaq_engineering.identity_sync_backup(project_id,before_data)
 select id,data from nitaq_engineering.projects where accounting_id is not null on conflict do nothing;

create or replace function nitaq_engineering.accounting_identity(document jsonb,master jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select document || jsonb_build_object('name',coalesce(master->>'owner',''),
   'info',coalesce(nullif(document->'info','null'::jsonb),'{}'::jsonb)||jsonb_build_object(
     'plotGovernment',coalesce(master->>'plotNumber',''),
     'plotPrivate',coalesce(master->>'ownershipNumber','')));
$$;
revoke all on function nitaq_engineering.accounting_identity(jsonb,jsonb) from public,anon,authenticated;

create or replace function nitaq_engineering.guard_accounting_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare master jsonb; source_id text;
begin
 source_id:=nullif(new.data->>'accountingProjectId','');
 if tg_op='UPDATE' and old.accounting_id is not null and source_id is distinct from old.accounting_id then
   raise exception 'Accounting link cannot be changed from engineering' using errcode='22023';
 end if;
 if source_id is null then return new; end if;
 select data into master from public.nitaq_records where id=source_id and entity='projects';
 if master is null then raise exception 'Accounting project does not exist' using errcode='22023'; end if;
 if tg_op='INSERT' and not exists(select 1 from nitaq_engineering.projects where id=new.id)
   and new.id is distinct from master->>'projectNo' then
   raise exception 'Accounting project number does not match' using errcode='22023';
 end if;
 if nitaq_engineering.accounting_identity(new.data,master) is distinct from new.data then
   raise exception 'Owner and parcel numbers are maintained in Accounting. Refresh the project.' using errcode='22023';
 end if;
 new.accounting_id:=source_id;
 return new;
end;
$$;
revoke all on function nitaq_engineering.guard_accounting_identity() from public,anon,authenticated;

-- Synchronize only records already linked by their stable accounting ID.
update nitaq_engineering.projects p set data=nitaq_engineering.accounting_identity(p.data,r.data),version=p.version+1
 from public.nitaq_records r where r.id=p.accounting_id and r.entity='projects'
 and p.data is distinct from nitaq_engineering.accounting_identity(p.data,r.data);
create trigger engineering_accounting_identity before insert or update on nitaq_engineering.projects
 for each row execute function nitaq_engineering.guard_accounting_identity();

create or replace function nitaq_engineering.sync_accounting_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare project record; previous_doc jsonb; next_doc jsonb;
begin
 if new.entity<>'projects' then return null; end if;
 if tg_op='UPDATE' and new.data->'owner' is not distinct from old.data->'owner'
   and new.data->'plotNumber' is not distinct from old.data->'plotNumber'
   and new.data->'ownershipNumber' is not distinct from old.data->'ownershipNumber' then return null; end if;
 for project in select id,data from nitaq_engineering.projects where accounting_id=new.id for update loop
   if project.data is not distinct from nitaq_engineering.accounting_identity(project.data,new.data) then continue; end if;
   previous_doc:=nitaq_engineering.project_document(project.id);
   update nitaq_engineering.projects set data=nitaq_engineering.accounting_identity(data,new.data),version=version+1 where id=project.id;
   next_doc:=nitaq_engineering.project_document(project.id);
   insert into nitaq_engineering.workspace_changes(operation_id,actor,request)
     values(gen_random_uuid(),coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000'::uuid),
       jsonb_build_object('source','accounting','changes',jsonb_build_array(jsonb_build_object(
         'id',project.id,'before',previous_doc,'after',next_doc))));
 end loop;
 return null;
end;
$$;
revoke all on function nitaq_engineering.sync_accounting_identity() from public,anon,authenticated;
create trigger engineering_identity_from_accounting after insert or update on public.nitaq_records
 for each row execute function nitaq_engineering.sync_accounting_identity();
insert into nitaq_engineering.migrations(version) values('20261108_009_accounting_identity') on conflict do nothing;
commit;
