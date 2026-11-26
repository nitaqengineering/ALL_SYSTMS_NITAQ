-- Newer Supabase projects no longer grant table rights to service_role by default for tables
-- created in SQL. The edge functions act as service_role, so give it exactly what they use.
grant select, insert, update, delete on public.showcase_villas, public.showcase_links, public.showcase_publishers to service_role;
