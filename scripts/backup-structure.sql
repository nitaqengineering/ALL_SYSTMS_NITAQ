-- Deterministic structural evidence; no business rows or credentials.
with namespaces as (
 select oid from pg_namespace where nspname='public' or (nspname like 'nitaq\_%' and nspname not like 'nitaq\_backup\_%')
), objects as (
 select 'function' kind,n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' identity,pg_get_functiondef(p.oid) definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.oid in (select oid from namespaces) and p.prokind='f'
 union all
 select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and (n.oid in (select oid from namespaces) or (n.nspname='auth' and c.relname in ('users','identities')))
 union all
 select 'constraint',n.nspname||'.'||c.relname||'.'||x.conname,pg_get_constraintdef(x.oid)
 from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace
 where n.oid in (select oid from namespaces) or (n.nspname='auth' and c.relname in ('users','identities'))
 union all
 select 'index',n.nspname||'.'||c.relname,pg_get_indexdef(c.oid)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='i' and n.oid in (select oid from namespaces)
 union all
 select 'policy',schemaname||'.'||tablename||'.'||policyname,concat_ws('|',permissive,roles::text,cmd,qual,with_check)
 from pg_policies where schemaname='public' or schemaname like 'nitaq\_%'
 union all
 select 'rls',n.nspname||'.'||c.relname,c.relrowsecurity::text||'|'||c.relforcerowsecurity::text
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.oid in (select oid from namespaces)
)
select kind||'|'||identity||'|'||md5(definition) from objects order by 1;
