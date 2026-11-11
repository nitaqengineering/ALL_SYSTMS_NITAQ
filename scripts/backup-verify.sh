#!/usr/bin/env bash
# Proves a backup is restorable: restores <name>.dump into a NEW empty local database and
# compares every table's row count with the counts recorded when the backup was taken.
#   scripts/backup-verify.sh <name> <backup-dir>
# Uses the local scratch server from PGHOST/PGPORT/PGUSER/PGPASSWORD. Never point it at a company database.
set -euo pipefail
name="$1"; dir="$2"
case "${PGHOST:-}" in localhost|127.0.0.1|::1) ;; *) echo "Refusing: PGHOST must be a local scratch server"; exit 1;; esac
db="nitaq_restore_check_${name//[^a-z0-9]/_}_$$"
psql -d postgres -q -v ON_ERROR_STOP=1 -c "create database \"$db\" encoding 'UTF8' locale 'C' template template0"
trap 'psql -d postgres -q -c "drop database if exists \"$db\" with (force)" >/dev/null 2>&1 || true' EXIT
# Stand-ins for what a Supabase project provides before a restore: roles, auth.uid(), auth.users, realtime publication.
psql -d "$db" -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin','supabase_replication_admin','supabase_read_only_user','dashboard_user','pgbouncer'] loop
  if not exists(select 1 from pg_roles where rolname=r) then execute format('create role %I',r); end if;
 end loop; end $$;
drop schema public cascade;
create schema auth;

create function auth.uid() returns uuid language sql stable as $f$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$f$;
create function auth.role() returns text language sql stable as $f$select nullif(current_setting('request.jwt.claim.role',true),'')$f$;
create function auth.jwt() returns jsonb language sql stable as $f$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$f$;
create publication supabase_realtime;
SQL
pg_restore --list "$dir/$name.dump" > /dev/null
pg_restore --list "$dir/$name-auth.dump" > /dev/null
# Restore Auth table definitions and records before application FKs; restore Auth triggers last.
# Any restore error is fatal; retain the log for investigation.
pg_restore --exit-on-error --no-owner --section=pre-data --dbname="$db" "$dir/$name-auth.dump" 2> "$dir/$name.restore-log"
pg_restore --exit-on-error --no-owner --section=data --dbname="$db" "$dir/$name-auth.dump" 2>> "$dir/$name.restore-log"
pg_restore --list "$dir/$name-auth.dump" | sed '/ TRIGGER /d' > "$dir/$name.auth-toc"
pg_restore --exit-on-error --no-owner --section=post-data --use-list="$dir/$name.auth-toc" --dbname="$db" "$dir/$name-auth.dump" 2>> "$dir/$name.restore-log"
pg_restore --exit-on-error --no-owner --dbname="$db" "$dir/$name.dump" 2>> "$dir/$name.restore-log"
psql -d "$db" -q -v ON_ERROR_STOP=1 -f "$dir/$name-auth-triggers.sql" 2>> "$dir/$name.restore-log"
psql -d "$db" -At -v ON_ERROR_STOP=1 -f "$(dirname "$0")/backup-counts.sql" | tr -d '\r' > "$dir/$name.restored-counts"
if ! diff -u "$dir/$name.counts" "$dir/$name.restored-counts"; then
 echo "FAIL $name: restored row counts differ from the backup (table names and counts shown above)"; exit 1
fi
psql -d "$db" -At -v ON_ERROR_STOP=1 -f "$(dirname "$0")/backup-structure.sql" | tr -d '\r' > "$dir/$name.restored-structure"
if ! diff -u "$dir/$name.structure" "$dir/$name.restored-structure"; then
 echo "FAIL $name: restored functions, constraints, policies, triggers or indexes differ"; exit 1
fi
echo "PASS $name: restored into a new database; $(wc -l < "$dir/$name.counts") tables and $(awk -F= '{s+=$2} END{print s}' "$dir/$name.counts") rows match the backup; application schema and Auth tables restored without ignored errors"
rm -f "$dir/$name.restore-log" "$dir/$name.restored-counts"
