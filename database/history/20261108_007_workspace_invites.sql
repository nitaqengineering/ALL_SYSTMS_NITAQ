begin;
create table if not exists nitaq_engineering.invite_attempts (
 email text primary key,
 actor uuid not null,
 attempted_at timestamptz not null
);
alter table nitaq_engineering.invite_attempts enable row level security;
revoke all on nitaq_engineering.invite_attempts from public,anon,authenticated;

create or replace function public.nitaq_engineering_invite_target_v1(p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile jsonb; email_address text:=lower(btrim(p_email)); previous_attempt timestamptz;
begin
 if nitaq_engineering.workspace_profile()->>'manager' is distinct from 'true' then
   raise exception 'Only workspace managers may invite users' using errcode='42501';
 end if;
 select entry into profile from nitaq_engineering.workspace w,
   jsonb_array_elements(coalesce(w.settings->'users','[]'::jsonb)) entry
   where w.id=true and lower(entry->>'email')=email_address
     and entry->'active' is distinct from 'false'::jsonb;
 if profile is null or email_address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
   raise exception 'Save an active engineering user with this email first' using errcode='22023';
 end if;
 if exists(select 1 from auth.users where lower(email)=email_address and email_confirmed_at is not null) then
   return jsonb_build_object('email',email_address,'name',profile->>'name','registered',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('nitaq-invite:'||email_address,0));
 select attempted_at into previous_attempt from nitaq_engineering.invite_attempts where email=email_address;
 if previous_attempt>clock_timestamp()-interval '60 seconds' then
   raise exception 'Wait 60 seconds before another invitation' using errcode='P0001';
 end if;
 insert into nitaq_engineering.invite_attempts(email,actor,attempted_at)
 values(email_address,auth.uid(),clock_timestamp())
 on conflict(email) do update set actor=excluded.actor,attempted_at=excluded.attempted_at;
 return jsonb_build_object('email',email_address,'name',profile->>'name','registered',false);
end;
$$;
revoke all on function public.nitaq_engineering_invite_target_v1(text) from public,anon,authenticated;
grant execute on function public.nitaq_engineering_invite_target_v1(text) to authenticated;
insert into nitaq_engineering.migrations(version) values('20261108_007_workspace_invites') on conflict do nothing;
notify pgrst,'reload schema';
commit;
