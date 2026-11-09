begin;
create or replace function nitaq_engineering.workspace_profile() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare profile jsonb;
begin
 if auth.uid() is null then return null; end if;
 if exists(select 1 from nitaq_engineering.workspace_managers where user_id=auth.uid()) then
   return jsonb_build_object('manager',true,'active',true);
 end if;
 select entry into profile from nitaq_engineering.workspace w,
   jsonb_array_elements(coalesce(w.settings->'users','[]'::jsonb)) entry
   join auth.users u on lower(u.email)=lower(entry->>'email')
   where w.id=true and u.id=auth.uid() and u.email_confirmed_at is not null;
 if profile is null or profile->'active'='false'::jsonb then return null; end if;
 return profile || jsonb_build_object('manager',profile->>'role' in ('مدير','مالك'));
end;
$$;
revoke all on function nitaq_engineering.workspace_profile() from public,anon,authenticated;
insert into nitaq_engineering.migrations(version) values('20261108_006_owner_role')
 on conflict do nothing;
commit;
