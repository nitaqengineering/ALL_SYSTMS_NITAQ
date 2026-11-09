-- Authenticated engineering access starts empty. Add approved Auth users separately.
begin;
create table nitaq_engineering.members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table nitaq_engineering.members enable row level security;
revoke all on nitaq_engineering.members from public, anon, authenticated;

-- Keep the private schema out of the Data API and expose only the approved fields.
create function public.nitaq_engineering_stage_summary_v1(
  p_after text default null,
  p_limit integer default 50
)
returns table(project_id text, design_status text, stages jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from nitaq_engineering.members m where m.user_id = auth.uid()
  ) then
    raise exception 'Engineering access denied' using errcode = '42501';
  end if;

  return query
  select p.id,
    max(s.data->>'status') filter (where s.stage_key = 'design'),
    coalesce(jsonb_object_agg(s.stage_key,
      jsonb_build_object('status', s.data->>'status', 'version', s.version))
      filter (where s.stage_key is not null), '{}'::jsonb)
  from (
    select t.id
    from nitaq_engineering.projects t
    where p_after is null or t.id > p_after
    order by t.id
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) p
  left join nitaq_engineering.stages s on s.project_id = p.id
  group by p.id
  order by p.id;
end;
$$;
revoke all on function public.nitaq_engineering_stage_summary_v1(text, integer) from public, anon, authenticated;
grant execute on function public.nitaq_engineering_stage_summary_v1(text, integer) to authenticated;
insert into nitaq_engineering.migrations(version) values ('20261107_003_engineering_stage_summary');
commit;
