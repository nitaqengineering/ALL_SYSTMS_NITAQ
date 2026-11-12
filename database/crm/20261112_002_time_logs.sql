-- CRM PROJECT ONLY. Per-engineer work stopwatch over CRM leads (clients roll up by clientId).
-- Server clock is authoritative; one running session per user; sessions capped so a forgotten
-- timer cannot run forever. The table lives in the locked nitaq_crm_private schema and is reachable
-- only through these SECURITY DEFINER RPCs. It never touches the CRM record CAS path
-- (nitaq_crm_apply_v2), so start/stop can never conflict with record edits or the receipt replay guard.
-- Do not run against the accounting/engineering database.
begin;
create schema if not exists nitaq_crm_private;
revoke all on schema nitaq_crm_private from public,anon,authenticated;

create table if not exists nitaq_crm_private.time_logs(
 id bigint generated always as identity primary key,
 user_id uuid not null,                                   -- stable identity (auth user) the report groups by
 profile_id text,                                         -- CRM profile id when present
 engineer_name text not null,                             -- display snapshot (name or email)
 lead_id text not null,                                   -- CRM lead record id (no FK: historical logs survive lead removal)
 client_id text,                                          -- denormalised for client roll-up
 client_name text,                                        -- display snapshot
 lead_name text,                                          -- display snapshot (projectNo/name/client)
 kind text not null check (length(kind) between 1 and 40),-- call / visit / office work / general follow-up
 started_at timestamptz not null default clock_timestamp(),
 ended_at timestamptz,                                    -- null = running
 auto_closed boolean not null default false,              -- hit the cap instead of an explicit stop
 note text check (note is null or length(note) <= 500),
 created_at timestamptz not null default clock_timestamp(),
 corrected_by uuid,                                       -- who last adjusted/closed it, if anyone
 corrected_at timestamptz,
 constraint crm_time_logs_order check (ended_at is null or ended_at >= started_at)
);
comment on table nitaq_crm_private.time_logs is 'NITAQ_CRM_TIME_LOGS_V1';
alter table nitaq_crm_private.time_logs enable row level security;
revoke all on nitaq_crm_private.time_logs from public,anon,authenticated;
-- At most one running session per user.
create unique index if not exists crm_time_logs_one_running on nitaq_crm_private.time_logs(user_id) where ended_at is null;
create index if not exists crm_time_logs_lead on nitaq_crm_private.time_logs(lead_id);
create index if not exists crm_time_logs_user on nitaq_crm_private.time_logs(user_id);

-- Forgotten sessions close at this cap (counted from the start), flagged for review.
create or replace function nitaq_crm_private.time_cap() returns interval language sql immutable set search_path='' as $$ select interval '12 hours' $$;
revoke all on function nitaq_crm_private.time_cap() from public,anon,authenticated;

-- Identity of the caller as an active CRM member, or raise 42501. see_all = owner or the seeAll permission.
create or replace function nitaq_crm_private.time_actor() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare prof public.nitaq_crm_profiles; email text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into prof from public.nitaq_crm_profiles where auth_user_id=auth.uid() and active=true limit 1;
 if not found then raise exception 'CRM access denied' using errcode='42501'; end if;
 select u.email into email from auth.users u where u.id=auth.uid();
 return jsonb_build_object('user_id',auth.uid(),'profile_id',prof.id,
   'name',coalesce(nullif(btrim(prof.name),''),email,'—'),
   'see_all',(prof.role='owner' or coalesce((prof.perms->>'seeAll')::boolean,false)),
   'role',prof.role);
end $$;
revoke all on function nitaq_crm_private.time_actor() from public,anon,authenticated;

-- Close one running row at min(now, start+cap); flag it when the cap was hit.
create or replace function nitaq_crm_private.time_close(p_id bigint, p_by uuid) returns nitaq_crm_private.time_logs
language plpgsql security definer set search_path='' as $$
declare row nitaq_crm_private.time_logs; stop_at timestamptz; capped boolean;
begin
 select * into row from nitaq_crm_private.time_logs where id=p_id for update;
 if not found or row.ended_at is not null then return row; end if;
 capped:=clock_timestamp() > row.started_at + nitaq_crm_private.time_cap();
 stop_at:=least(clock_timestamp(), row.started_at + nitaq_crm_private.time_cap());
 update nitaq_crm_private.time_logs set ended_at=stop_at, auto_closed=capped,
   corrected_by=case when capped then null else p_by end, corrected_at=case when capped then null else clock_timestamp() end
   where id=p_id returning * into row;
 return row;
end $$;
revoke all on function nitaq_crm_private.time_close(bigint,uuid) from public,anon,authenticated;

-- Start a session on a lead. Auto-closes the caller's previous running session first.
-- The caller must be able to reach the lead (owner/seeAll, or the lead's owner/engineer).
create or replace function public.nitaq_crm_timer_start_v1(p_lead text, p_kind text default 'عمل', p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me jsonb; running bigint; new_row nitaq_crm_private.time_logs;
 lead_row public.nitaq_crm_records; client_row public.nitaq_crm_records;
 v_client_id text; v_client_name text; v_lead_name text; v_kind text; allowed boolean;
begin
 me:=nitaq_crm_private.time_actor();
 v_kind:=coalesce(nullif(btrim(p_kind),''),'عمل');
 if p_lead is null or length(btrim(p_lead))<1 or length(v_kind)>40 then raise exception 'Invalid timer request' using errcode='22023'; end if;
 if p_note is not null and length(p_note)>500 then raise exception 'Note too long' using errcode='22023'; end if;
 select * into lead_row from public.nitaq_crm_records where id=p_lead and entity='lead';
 if not found then raise exception 'Lead not found' using errcode='22023'; end if;
 allowed:=(me->>'see_all')::boolean or lead_row.data->>'ownerId'=(me->>'profile_id') or lead_row.data->>'engineerId'=(me->>'profile_id');
 if not allowed then raise exception 'Lead access denied' using errcode='42501'; end if;
 v_client_id:=lead_row.data->>'clientId';
 if v_client_id is not null then
   select * into client_row from public.nitaq_crm_records where id=v_client_id and entity='client';
   v_client_name:=client_row.data->>'name';
 end if;
 v_lead_name:=coalesce(nullif(btrim(lead_row.data->>'projectNo'),''),nullif(btrim(lead_row.data->>'name'),''),nullif(btrim(v_client_name),''),p_lead);
 perform pg_advisory_xact_lock(hashtextextended('nitaq-crm-timer:'||(me->>'user_id'),0));
 for running in select id from nitaq_crm_private.time_logs where user_id=(me->>'user_id')::uuid and ended_at is null loop
   perform nitaq_crm_private.time_close(running,(me->>'user_id')::uuid);
 end loop;
 insert into nitaq_crm_private.time_logs(user_id,profile_id,engineer_name,lead_id,client_id,client_name,lead_name,kind,note)
   values((me->>'user_id')::uuid,me->>'profile_id',me->>'name',p_lead,v_client_id,v_client_name,v_lead_name,v_kind,nullif(btrim(p_note),''))
   returning * into new_row;
 return to_jsonb(new_row);
end $$;

-- Stop the caller's running session (a specific id must belong to the caller).
create or replace function public.nitaq_crm_timer_stop_v1(p_id bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me jsonb; target bigint; row nitaq_crm_private.time_logs;
begin
 me:=nitaq_crm_private.time_actor();
 perform pg_advisory_xact_lock(hashtextextended('nitaq-crm-timer:'||(me->>'user_id'),0));
 if p_id is not null then
   select id into target from nitaq_crm_private.time_logs where id=p_id and user_id=(me->>'user_id')::uuid and ended_at is null;
 else
   select id into target from nitaq_crm_private.time_logs where user_id=(me->>'user_id')::uuid and ended_at is null;
 end if;
 if target is null then raise exception 'No running timer' using errcode='P0001'; end if;
 row:=nitaq_crm_private.time_close(target,(me->>'user_id')::uuid);
 return to_jsonb(row);
end $$;

-- The caller's running session (or null) for resuming the on-screen timer after a reload.
create or replace function public.nitaq_crm_timer_current_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me jsonb; row nitaq_crm_private.time_logs;
begin
 me:=nitaq_crm_private.time_actor();
 select * into row from nitaq_crm_private.time_logs where user_id=(me->>'user_id')::uuid and ended_at is null;
 if not found then return null; end if;
 return to_jsonb(row)||jsonb_build_object('server_now',clock_timestamp(),'cap_seconds',extract(epoch from nitaq_crm_private.time_cap()));
end $$;

-- Correct a session's times or close an open one. The row owner or anyone with see_all may do it; stamped.
create or replace function public.nitaq_crm_timer_adjust_v1(p_id bigint, p_started timestamptz, p_ended timestamptz, p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me jsonb; row nitaq_crm_private.time_logs;
begin
 me:=nitaq_crm_private.time_actor();
 select * into row from nitaq_crm_private.time_logs where id=p_id for update;
 if not found then raise exception 'Session not found' using errcode='22023'; end if;
 if not (me->>'see_all')::boolean and row.user_id is distinct from (me->>'user_id')::uuid then raise exception 'Only the engineer or a supervisor may adjust' using errcode='42501'; end if;
 if p_started is null or p_ended is null or p_ended < p_started then raise exception 'Invalid times' using errcode='22023'; end if;
 if p_started > clock_timestamp()+interval '1 minute' or p_ended > clock_timestamp()+interval '1 minute' then raise exception 'Times cannot be in the future' using errcode='22023'; end if;
 if p_ended - p_started > nitaq_crm_private.time_cap() then raise exception 'A session cannot exceed the cap' using errcode='22023'; end if;
 if p_note is not null and length(p_note)>500 then raise exception 'Note too long' using errcode='22023'; end if;
 update nitaq_crm_private.time_logs set started_at=p_started, ended_at=p_ended, auto_closed=false,
   note=coalesce(nullif(btrim(p_note),''),note), corrected_by=(me->>'user_id')::uuid, corrected_at=clock_timestamp()
   where id=p_id returning * into row;
 return to_jsonb(row);
end $$;

-- Delete a session. The row owner may delete their own; a supervisor (see_all) may delete any.
create or replace function public.nitaq_crm_timer_delete_v1(p_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me jsonb; row nitaq_crm_private.time_logs;
begin
 me:=nitaq_crm_private.time_actor();
 select * into row from nitaq_crm_private.time_logs where id=p_id for update;
 if not found then return jsonb_build_object('deleted',false); end if;
 if not (me->>'see_all')::boolean and row.user_id is distinct from (me->>'user_id')::uuid then raise exception 'Only the engineer or a supervisor may delete' using errcode='42501'; end if;
 delete from nitaq_crm_private.time_logs where id=p_id;
 return jsonb_build_object('deleted',true,'id',p_id);
end $$;

-- Report. A supervisor (see_all) sees everyone; an engineer sees only their own.
-- Totals are per user/client/lead/kind; clients roll up by client_id.
create or replace function public.nitaq_crm_time_report_v1(p_lead text default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me jsonb; see_all boolean; mine uuid; cap interval; result jsonb;
begin
 me:=nitaq_crm_private.time_actor();
 see_all:=(me->>'see_all')::boolean;
 mine:=(me->>'user_id')::uuid;
 cap:=nitaq_crm_private.time_cap();
 with scoped as (
   select l.*, coalesce(l.ended_at, least(clock_timestamp(), l.started_at+cap)) as effective_end,
     (l.ended_at is null) as running
   from nitaq_crm_private.time_logs l
   where (see_all or l.user_id=mine)
     and (p_lead is null or l.lead_id=p_lead)
     and (p_from is null or l.started_at >= p_from)
     and (p_to is null or l.started_at < (p_to + 1))
 ),
 priced as (select *, greatest(0, extract(epoch from (effective_end-started_at)))::bigint as seconds from scoped)
 select jsonb_build_object(
   'see_all',see_all,
   'cap_seconds',extract(epoch from cap),
   'server_now',clock_timestamp(),
   'totals',coalesce((select jsonb_agg(t order by t->>'engineer_name', t->>'client_name', t->>'lead_name', t->>'kind') from (
       select jsonb_build_object('user_id',user_id,'engineer_name',max(engineer_name),
         'lead_id',lead_id,'client_id',max(client_id),'client_name',max(client_name),'lead_name',max(lead_name),'kind',kind,
         'seconds',sum(seconds),'sessions',count(*),'running',bool_or(running)) as t
       from priced group by user_id,lead_id,kind) g),'[]'::jsonb),
   'open',coalesce((select jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'engineer_name',engineer_name,'lead_id',lead_id,'lead_name',lead_name,'client_name',client_name,'kind',kind,'started_at',started_at,'seconds',seconds) order by started_at)
       from priced where running),'[]'::jsonb),
   'recent',coalesce((select jsonb_agg(r order by r->>'started_at' desc) from (
       select jsonb_build_object('id',id,'user_id',user_id,'engineer_name',engineer_name,'lead_id',lead_id,'lead_name',lead_name,'client_name',client_name,'kind',kind,
         'started_at',started_at,'ended_at',ended_at,'seconds',seconds,'auto_closed',auto_closed,'note',note,'corrected_by',corrected_by) as r
       from priced order by started_at desc limit 500) s),'[]'::jsonb)
 ) into result;
 return result;
end $$;

revoke all on function public.nitaq_crm_timer_start_v1(text,text,text),public.nitaq_crm_timer_stop_v1(bigint),
 public.nitaq_crm_timer_current_v1(),public.nitaq_crm_timer_adjust_v1(bigint,timestamptz,timestamptz,text),
 public.nitaq_crm_timer_delete_v1(bigint),public.nitaq_crm_time_report_v1(text,date,date) from public,anon;
grant execute on function public.nitaq_crm_timer_start_v1(text,text,text),public.nitaq_crm_timer_stop_v1(bigint),
 public.nitaq_crm_timer_current_v1(),public.nitaq_crm_timer_adjust_v1(bigint,timestamptz,timestamptz,text),
 public.nitaq_crm_timer_delete_v1(bigint),public.nitaq_crm_time_report_v1(text,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
