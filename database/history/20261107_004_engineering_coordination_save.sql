-- Pilot write scope: drawing coordination only. Access starts empty.
begin;
create table nitaq_engineering.coordination_editors (
  user_id uuid not null references nitaq_engineering.members(user_id) on delete cascade,
  project_id text not null references nitaq_engineering.projects(id) on delete cascade,
  primary key (user_id, project_id)
);
create table nitaq_engineering.coordination_changes (
  operation_id uuid primary key,
  actor uuid not null,
  project_id text not null,
  before_status text not null,
  after_status text not null,
  version bigint not null,
  changed_at timestamptz not null default clock_timestamp(),
  unique (project_id, version)
);
alter table nitaq_engineering.coordination_editors enable row level security;
alter table nitaq_engineering.coordination_changes enable row level security;
revoke all on nitaq_engineering.coordination_editors, nitaq_engineering.coordination_changes
  from public, anon, authenticated;

create function public.nitaq_engineering_save_coordination_v1(
  p_project text, p_version bigint, p_status text, p_operation uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  design_status text;
  current_status text;
  current_version bigint;
  prior nitaq_engineering.coordination_changes%rowtype;
begin
  perform 1 from nitaq_engineering.coordination_editors
    where user_id = actor_id and project_id = p_project for share;
  if not found then
    raise exception 'Engineering edit access denied' using errcode = '42501';
  end if;
  if p_operation is null or p_version is null or p_version < 0 or
      p_status is null or p_status not in ('REQ','COM','OK') then
    raise exception 'Invalid coordination change' using errcode = '22023';
  end if;

  -- Lifecycle writers must take the project lock before modifying design or stages.
  perform 1 from nitaq_engineering.projects where id = p_project for share;
  select data->>'status' into design_status from nitaq_engineering.stages
    where project_id = p_project and stage_key = 'design' for share;
  select data->>'status', version into current_status, current_version
    from nitaq_engineering.stages where project_id = p_project and stage_key = 'coordination'
    for update;
  if not found then
    raise exception 'Coordination stage is missing';
  end if;

  select * into prior from nitaq_engineering.coordination_changes where operation_id = p_operation;
  if found then
    if row(prior.actor, prior.project_id, prior.version - 1, prior.after_status)
        is distinct from row(actor_id, p_project, p_version, p_status) then
      raise exception 'Operation identifier already used' using errcode = '22023';
    end if;
    return jsonb_build_object('result','already_saved','version',prior.version);
  end if;
  if design_status is null or design_status not in ('REQ','OK') then
    return jsonb_build_object('result','project_stopped','status',design_status);
  end if;
  if current_version <> p_version then
    return jsonb_build_object('result','conflict','status',current_status,'version',current_version);
  end if;
  if current_status is null or current_status not in ('REQ','COM','OK') then
    raise exception 'Coordination state requires review';
  end if;
  if current_status = p_status then
    return jsonb_build_object('result','unchanged','version',current_version);
  end if;

  update nitaq_engineering.stages
    set data = jsonb_set(data, '{status}', to_jsonb(p_status)) - 'exemptedBy',
        version = current_version + 1
    where project_id = p_project and stage_key = 'coordination';
  insert into nitaq_engineering.coordination_changes
    (operation_id, actor, project_id, before_status, after_status, version)
    values (p_operation, actor_id, p_project, current_status, p_status, current_version + 1);
  return jsonb_build_object('result','saved','version',current_version + 1);
end;
$$;
revoke all on function public.nitaq_engineering_save_coordination_v1(text,bigint,text,uuid)
  from public, anon, authenticated;
grant execute on function public.nitaq_engineering_save_coordination_v1(text,bigint,text,uuid)
  to authenticated;
insert into nitaq_engineering.migrations(version) values ('20261107_004_engineering_coordination_save');
commit;
