-- ACCOUNTING / ENGINEERING PROJECT ONLY. Preserve approved existing users;
-- future public registrations cannot claim an engineering role by matching an email.
begin;
create table if not exists nitaq_engineering.auth_bindings_v2(
 user_id uuid primary key references auth.users(id) on delete cascade,profile_id text not null);
revoke all on nitaq_engineering.auth_bindings_v2 from public,anon,authenticated;
insert into nitaq_engineering.auth_bindings_v2(user_id,profile_id)
select u.id,p->>'id' from nitaq_engineering.workspace w cross join lateral jsonb_array_elements(w.settings->'users') p
join auth.users u on lower(u.email)=lower(p->>'email')
where w.id=true and u.email_confirmed_at is not null and p->'active' is distinct from 'false'::jsonb and coalesce(p->>'id','')<>''
on conflict(user_id) do nothing;
create or replace function nitaq_engineering.workspace_profile() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare profile jsonb;
begin
 if auth.uid() is null then return null;end if;
 if exists(select 1 from nitaq_engineering.workspace_managers where user_id=auth.uid()) then return jsonb_build_object('manager',true,'active',true);end if;
 select entry into profile from nitaq_engineering.workspace w cross join lateral jsonb_array_elements(coalesce(w.settings->'users','[]'::jsonb)) entry
 join nitaq_engineering.auth_bindings_v2 b on b.profile_id=entry->>'id'
 join auth.users u on u.id=b.user_id
 where w.id=true and u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=lower(entry->>'email');
 if profile is null or profile->'active'='false'::jsonb then return null;end if;
 return profile||jsonb_build_object('manager',profile->>'role' in ('مدير','مالك'));
end $$;
-- Explicit manager approval binds an already registered, verified account.
do $migration$
declare src text;needle text:='if exists(select 1 from auth.users where lower(email)=email_address and email_confirmed_at is not null) then';
begin
 src=pg_get_functiondef('public.nitaq_engineering_invite_target_v1(text)'::regprocedure);
 if position(needle in src)=0 then raise exception 'Review invitation definition drift';end if;
 execute replace(src,needle,needle||E'\n insert into nitaq_engineering.auth_bindings_v2(user_id,profile_id) select id,profile->>''id'' from auth.users where lower(email)=email_address and email_confirmed_at is not null on conflict(user_id) do update set profile_id=excluded.profile_id;');
end $migration$;
-- Supabase Auth's server-side invitation marker + our manager request are required.
-- The same Auth database serves engineering and accounts: invitation grants NO accounting profile.
create or replace function public.nitaq_handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare profile jsonb;
begin
 if new.invited_at is not null and exists(select 1 from nitaq_engineering.invite_attempts where email=lower(new.email) and attempted_at>clock_timestamp()-interval '1 hour') then
  select p into profile from nitaq_engineering.workspace w cross join lateral jsonb_array_elements(w.settings->'users') p
  where w.id=true and lower(p->>'email')=lower(new.email) and p->'active' is distinct from 'false'::jsonb;
  if coalesce(profile->>'id','')<>'' then insert into nitaq_engineering.auth_bindings_v2 values(new.id,profile->>'id') on conflict do nothing;end if;
 end if;
 return new;
end $$;
revoke all on function nitaq_engineering.workspace_profile() from public,anon,authenticated;
insert into nitaq_engineering.migrations(version) values('20261109_013_verified_membership') on conflict do nothing;
notify pgrst,'reload schema';
commit;
