-- Engineering/accounting database only. Per-engineer, per-project, per-stage work stopwatch.
-- Server clock is authoritative; one running session per engineer; sessions capped so a forgotten
-- timer cannot run forever. The table is RLS-locked and reachable only through these SECURITY DEFINER
-- RPCs. It never touches the project-document CAS save, so start/stop cannot conflict with edits.
begin;

create table if not exists nitaq_engineering.time_logs(
 id bigint generated always as identity primary key,
 user_id uuid not null,                                  -- stable identity (auth user) the report groups by
 profile_id text,                                        -- workspace profile id when present
 engineer_name text not null,                            -- display snapshot (name or email)
 project_id text not null references nitaq_engineering.projects(id),
 stage_key text not null check (length(stage_key) between 1 and 40),
 started_at timestamptz not null default clock_timestamp(),
 ended_at timestamptz,                                   -- null = running
 auto_closed boolean not null default false,             -- hit the cap instead of an explicit stop
 note text check (note is null or length(note) <= 500),
 created_at timestamptz not null default clock_timestamp(),
 corrected_by uuid,                                      -- who last adjusted/closed it, if anyone
 corrected_at timestamptz,
 constraint time_logs_order check (ended_at is null or ended_at >= started_at)
);
comment on table nitaq_engineering.time_logs is 'NITAQ_ENGINEERING_TIME_LOGS_V1';
alter table nitaq_engineering.time_logs enable row level security;
revoke all on nitaq_engineering.time_logs from public,anon,authenticated;
-- At most one running session per engineer.
create unique index if not exists time_logs_one_running on nitaq_engineering.time_logs(user_id) where ended_at is null;
create index if not exists time_logs_project on nitaq_engineering.time_logs(project_id);
create index if not exists time_logs_user on nitaq_engineering.time_logs(user_id);

-- Forgotten sessions close at this cap (counted from the start), flagged for review.
create or replace function nitaq_engineering.time_log_cap() returns interval language sql immutable set search_path='' as $$ select interval '12 hours' $$;

-- Identity of the caller as an active workspace member, or raise 42501.
create or replace function nitaq_engineering.time_actor() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare profile jsonb; email text;
begin
 profile:=nitaq_engineering.workspace_profile();
 if profile is null or auth.uid() is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
 select u.email into email from auth.users u where u.id=auth.uid();
 return jsonb_build_object('user_id',auth.uid(),'profile_id',profile->>'id',
   'name',coalesce(nullif(btrim(profile->>'name'),''),email,'—'),
   'manager',coalesce((profile->>'manager')::boolean,false));
end $$;
revoke all on function nitaq_engineering.time_log_cap() from public,anon,authenticated;
revoke all on function nitaq_engineering.time_actor() from public,anon,authenticated;

-- Close one running row at min(now, start+cap); flag it when the cap was hit.
create or replace function nitaq_engineering.time_close(p_id bigint, p_by uuid) returns nitaq_engineering.time_logs
language plpgsql security definer set search_path='' as $$
declare row nitaq_engineering.time_logs; stop_at timestamptz; capped boolean;
begin
 select * into row from nitaq_engineering.time_logs where id=p_id for update;
 if not found or row.ended_at is not null then return row; end if;
 capped:=clock_timestamp() > row.started_at + nitaq_engineering.time_log_cap();
 stop_at:=least(clock_timestamp(), row.started_at + nitaq_engineering.time_log_cap());
 update nitaq_engineering.time_logs set ended_at=stop_at, auto_closed=capped,
   corrected_by=case when capped then null else p_by end, corrected_at=case when capped then null else clock_timestamp() end
   where id=p_id returning * into row;
 return row;
end $$;
revoke all on function nitaq_engineering.time_close(bigint,uuid) from public,anon,authenticated;

-- Start a session on a project+stage. Auto-closes the caller's previous running session first.
create or replace function public.nitaq_engineering_timer_start_v1(p_project text, p_stage text, p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me jsonb; running bigint; new_row nitaq_engineering.time_logs;
begin
 me:=nitaq_engineering.time_actor();
 if p_project is null or p_stage is null or length(btrim(p_stage)) not between 1 and 40 then raise exception 'Invalid timer request' using errcode='22023'; end if;
 if not exists(select 1 from nitaq_engineering.projects where id=p_project) then raise exception 'Project not found' using errcode='22023'; end if;
 if p_note is not null and length(p_note)>500 then raise exception 'Note too long' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nitaq-timer:'||(me->>'user_id'),0));
 for running in select id from nitaq_engineering.time_logs where user_id=(me->>'user_id')::uuid and ended_at is null loop
   perform nitaq_engineering.time_close(running,(me->>'user_id')::uuid);
 end loop;
 insert into nitaq_engineering.time_logs(user_id,profile_id,engineer_name,project_id,stage_key,note)
   values((me->>'user_id')::uuid,me->>'profile_id',me->>'name',p_project,btrim(p_stage),nullif(btrim(p_note),''))
   returning * into new_row;
 return to_jsonb(new_row);
end $$;

-- Stop the caller's running session (a specific id must belong to the caller).
create or replace function public.nitaq_engineering_timer_stop_v1(p_id bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me jsonb; target bigint; row nitaq_engineering.time_logs;
begin
 me:=nitaq_engineering.time_actor();
 perform pg_advisory_xact_lock(hashtextextended('nitaq-timer:'||(me->>'user_id'),0));
 if p_id is not null then
   select id into target from nitaq_engineering.time_logs where id=p_id and user_id=(me->>'user_id')::uuid and ended_at is null;
 else
   select id into target from nitaq_engineering.time_logs where user_id=(me->>'user_id')::uuid and ended_at is null;
 end if;
 if target is null then raise exception 'No running timer' using errcode='P0001'; end if;
 row:=nitaq_engineering.time_close(target,(me->>'user_id')::uuid);
 return to_jsonb(row);
end $$;

-- The caller's running session (or null) for resuming the on-screen timer after a reload.
create or replace function public.nitaq_engineering_timer_current_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me jsonb; row nitaq_engineering.time_logs;
begin
 me:=nitaq_engineering.time_actor();
 select * into row from nitaq_engineering.time_logs where user_id=(me->>'user_id')::uuid and ended_at is null;
 if not found then return null; end if;
 return to_jsonb(row)||jsonb_build_object('server_now',clock_timestamp(),'cap_seconds',extract(epoch from nitaq_engineering.time_log_cap()));
end $$;

-- Correct a session's times or close an open one. The owner or any manager may do it; the change is stamped.
create or replace function public.nitaq_engineering_timer_adjust_v1(p_id bigint, p_started timestamptz, p_ended timestamptz, p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me jsonb; row nitaq_engineering.time_logs;
begin
 me:=nitaq_engineering.time_actor();
 select * into row from nitaq_engineering.time_logs where id=p_id for update;
 if not found then raise exception 'Session not found' using errcode='22023'; end if;
 if not (me->>'manager')::boolean and row.user_id is distinct from (me->>'user_id')::uuid then raise exception 'Only the engineer or a manager may adjust' using errcode='42501'; end if;
 if p_started is null or p_ended is null or p_ended < p_started then raise exception 'Invalid times' using errcode='22023'; end if;
 if p_started > clock_timestamp()+interval '1 minute' or p_ended > clock_timestamp()+interval '1 minute' then raise exception 'Times cannot be in the future' using errcode='22023'; end if;
 if p_ended - p_started > nitaq_engineering.time_log_cap() then raise exception 'A session cannot exceed the cap' using errcode='22023'; end if;
 if p_note is not null and length(p_note)>500 then raise exception 'Note too long' using errcode='22023'; end if;
 update nitaq_engineering.time_logs set started_at=p_started, ended_at=p_ended, auto_closed=false,
   note=coalesce(nullif(btrim(p_note),''),note), corrected_by=(me->>'user_id')::uuid, corrected_at=clock_timestamp()
   where id=p_id returning * into row;
 return to_jsonb(row);
end $$;

-- Delete a session. The owner may delete their own; a manager may delete any.
create or replace function public.nitaq_engineering_timer_delete_v1(p_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me jsonb; row nitaq_engineering.time_logs;
begin
 me:=nitaq_engineering.time_actor();
 select * into row from nitaq_engineering.time_logs where id=p_id for update;
 if not found then return jsonb_build_object('deleted',false); end if;
 if not (me->>'manager')::boolean and row.user_id is distinct from (me->>'user_id')::uuid then raise exception 'Only the engineer or a manager may delete' using errcode='42501'; end if;
 delete from nitaq_engineering.time_logs where id=p_id;
 return jsonb_build_object('deleted',true,'id',p_id);
end $$;

-- Report. A manager sees everyone; an engineer sees only their own. Totals are per engineer/project/stage.
create or replace function public.nitaq_engineering_time_report_v1(p_project text default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me jsonb; manager boolean; mine uuid; cap interval; result jsonb;
begin
 me:=nitaq_engineering.time_actor();
 manager:=(me->>'manager')::boolean;
 mine:=(me->>'user_id')::uuid;
 cap:=nitaq_engineering.time_log_cap();
 with scoped as (
   select l.*, coalesce(l.ended_at, least(clock_timestamp(), l.started_at+cap)) as effective_end,
     (l.ended_at is null) as running
   from nitaq_engineering.time_logs l
   where (manager or l.user_id=mine)
     and (p_project is null or l.project_id=p_project)
     and (p_from is null or l.started_at >= p_from)
     and (p_to is null or l.started_at < (p_to + 1))
 ),
 priced as (select *, greatest(0, extract(epoch from (effective_end-started_at)))::bigint as seconds from scoped)
 select jsonb_build_object(
   'manager',manager,
   'cap_seconds',extract(epoch from cap),
   'server_now',clock_timestamp(),
   'totals',coalesce((select jsonb_agg(t order by t->>'engineer_name', t->>'project_id', t->>'stage_key') from (
       select jsonb_build_object('user_id',user_id,'engineer_name',max(engineer_name),'project_id',project_id,'stage_key',stage_key,
         'seconds',sum(seconds),'sessions',count(*),'running',bool_or(running)) as t
       from priced group by user_id,project_id,stage_key) g),'[]'::jsonb),
   'open',coalesce((select jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'engineer_name',engineer_name,'project_id',project_id,'stage_key',stage_key,'started_at',started_at,'seconds',seconds) order by started_at)
       from priced where running),'[]'::jsonb),
   'recent',coalesce((select jsonb_agg(r order by r->>'started_at' desc) from (
       select jsonb_build_object('id',id,'user_id',user_id,'engineer_name',engineer_name,'project_id',project_id,'stage_key',stage_key,
         'started_at',started_at,'ended_at',ended_at,'seconds',seconds,'auto_closed',auto_closed,'note',note,'corrected_by',corrected_by) as r
       from priced order by started_at desc limit 500) s),'[]'::jsonb)
 ) into result;
 return result;
end $$;

revoke all on function public.nitaq_engineering_timer_start_v1(text,text,text),public.nitaq_engineering_timer_stop_v1(bigint),
 public.nitaq_engineering_timer_current_v1(),public.nitaq_engineering_timer_adjust_v1(bigint,timestamptz,timestamptz,text),
 public.nitaq_engineering_timer_delete_v1(bigint),public.nitaq_engineering_time_report_v1(text,date,date) from public,anon;
grant execute on function public.nitaq_engineering_timer_start_v1(text,text,text),public.nitaq_engineering_timer_stop_v1(bigint),
 public.nitaq_engineering_timer_current_v1(),public.nitaq_engineering_timer_adjust_v1(bigint,timestamptz,timestamptz,text),
 public.nitaq_engineering_timer_delete_v1(bigint),public.nitaq_engineering_time_report_v1(text,date,date) to authenticated;
insert into nitaq_engineering.migrations(version) values('20261112_015_project_time_logs') on conflict do nothing;
notify pgrst,'reload schema';
commit;
