-- Row count of every backed-up table as schema.table=count. Counts only; no row contents.
select format('%I.%I',n.nspname,c.relname)||'='||
 (xpath('/row/c/text()',query_to_xml(format('select count(*) as c from %I.%I',n.nspname,c.relname),false,true,'')))[1]::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind='r' and (n.nspname='public' or (n.nspname='auth' and c.relname in ('users','identities')) or (n.nspname like 'nitaq\_%' and n.nspname not like 'nitaq\_backup\_%'))
order by 1;
