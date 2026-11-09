-- Deployment staging only. No frontend API is enabled by this migration.
-- Apply to the accounting project after verifying the database backup.
begin;
create schema nitaq_engineering;
revoke all on schema nitaq_engineering from public, anon, authenticated;

create table nitaq_engineering.migrations (
  version text primary key,
  applied_at timestamptz not null default clock_timestamp()
);
create table nitaq_engineering.import_batches (
  id uuid primary key,
  source_sha256 text not null unique check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_document jsonb not null check (jsonb_typeof(source_document) = 'object'),
  imported_at timestamptz not null default clock_timestamp()
);
create table nitaq_engineering.projects (
  id text primary key,
  accounting_id text unique references public.nitaq_records(id),
  import_id uuid not null references nitaq_engineering.import_batches(id),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  version bigint not null default 0 check (version >= 0)
);
create table nitaq_engineering.stages (
  project_id text not null references nitaq_engineering.projects(id),
  stage_key text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version bigint not null default 0 check (version >= 0),
  primary key(project_id,stage_key)
);
alter table nitaq_engineering.migrations enable row level security;
alter table nitaq_engineering.import_batches enable row level security;
alter table nitaq_engineering.projects enable row level security;
alter table nitaq_engineering.stages enable row level security;
revoke all on all tables in schema nitaq_engineering from public, anon, authenticated;
insert into nitaq_engineering.migrations(version) values ('20261107_001_engineering_staging');
commit;
