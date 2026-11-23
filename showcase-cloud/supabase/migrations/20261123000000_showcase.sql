-- NITAQ Showcase cloud: private villa models opened by secret links.
-- Runs on the SEPARATE showcase Supabase project only (never on the accounting or CRM projects).
--
-- villas  — one row per published villa; files live in the private storage bucket "villas"
--           at <slug>/data.json and <slug>/<model_file>.
-- links   — each owner link is a random token bound to one villa; it can be switched off.
-- Nothing here is readable with the public (anon) key: RLS is on with no policies, and the
-- only way in is the "showcase" edge function, which uses the service role.

begin;

create table if not exists public.showcase_villas (
  slug        text primary key check (slug ~ '^[a-z0-9-]{1,60}$'),
  title       text not null default '',
  model_file  text not null check (model_file ~ '^[a-z0-9-]{1,80}\.bin$'),
  version     integer not null default 1,
  updated_at  timestamptz not null default now()
);

create table if not exists public.showcase_links (
  token           text primary key check (token ~ '^[a-z0-9-]{12,80}$'),
  villa_slug      text not null references public.showcase_villas (slug) on delete cascade,
  label           text not null default '',
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  opens           integer not null default 0,
  last_opened_at  timestamptz
);
create index if not exists showcase_links_villa on public.showcase_links (villa_slug);

alter table public.showcase_villas enable row level security;
alter table public.showcase_links  enable row level security;
revoke all on public.showcase_villas, public.showcase_links from anon, authenticated;

-- Count an open and return the villa for an active link (null when unknown or switched off).
create or replace function public.showcase_open(p_token text)
returns table (slug text, model_file text, version integer)
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
  select v.slug, v.model_file, v.version
    from hit join public.showcase_villas v on v.slug = hit.villa_slug;
$$;
revoke all on function public.showcase_open(text) from public, anon, authenticated;
grant execute on function public.showcase_open(text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('villas', 'villas', false, 52428800, array['application/json', 'application/octet-stream'])
on conflict (id) do update set public = false;

commit;
