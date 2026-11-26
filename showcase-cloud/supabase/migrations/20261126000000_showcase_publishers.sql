-- NITAQ Showcase cloud: engineers publish from Revit with their own key.
-- Runs on the SEPARATE showcase Supabase project only.
--
-- publishers — one row per engineer; only the SHA-256 of the key is stored. Switching a row off
--              stops that key at once. The "showcase-publish" edge function is the only reader.
-- villas     — data_file joins model_file: each upload writes new file names and the row switches
--              to them in one step, so an owner never sees new data with an old model.

begin;

create table if not exists public.showcase_publishers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (length(name) between 1 and 80),
  key_hash      text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
alter table public.showcase_publishers enable row level security;
revoke all on public.showcase_publishers from anon, authenticated;

alter table public.showcase_villas
  add column if not exists data_file text not null default 'data.json'
    check (data_file ~ '^[a-z0-9-]{1,80}\.json$'),
  add column if not exists updated_by text not null default '';

-- showcase_open now also returns the data file name.
drop function if exists public.showcase_open(text);
create function public.showcase_open(p_token text)
returns table (slug text, model_file text, data_file text, version integer)
language sql
security definer
set search_path = public
as $$
  with hit as (
    update public.showcase_links l
       set opens = l.opens + 1, last_opened_at = now()
     where l.token = p_token and l.active
    returning l.villa_slug
  )
  select v.slug, v.model_file, v.data_file, v.version
    from hit join public.showcase_villas v on v.slug = hit.villa_slug;
$$;
revoke all on function public.showcase_open(text) from public, anon, authenticated;
grant execute on function public.showcase_open(text) to service_role;

commit;
