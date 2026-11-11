#!/usr/bin/env bash
# Dumps one NITAQ Supabase database for off-site backup.
#   scripts/backup.sh <name> <database-url> <output-dir>
# Writes <name>.dump (schema, grants, policies and data of public + nitaq_* schemas),
# <name>-auth.dump (login accounts), <name>-auth-triggers.sql and <name>.counts (row counts only).
# Prints sizes and table counts, never row contents.
set -euo pipefail
name="$1"; url="$2"; out="$3"
mkdir -p "$out"
major="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
[ "$major" -ge 17 ] || { echo "pg_dump 17 or newer is required (found $major)"; exit 1; }
pg_dump "$url" --format=custom --no-owner --schema=public --schema='nitaq_*' --exclude-schema='nitaq_backup_*' --file="$out/$name.dump"
pg_dump "$url" --format=custom --no-owner --data-only --table='auth.users' --table='auth.identities' --file="$out/$name-auth.dump"
psql "$url" -At -v ON_ERROR_STOP=1 -c "select pg_get_triggerdef(t.oid)||';' from pg_trigger t where t.tgrelid='auth.users'::regclass and not t.tgisinternal order by 1" > "$out/$name-auth-triggers.sql"
psql "$url" -At -v ON_ERROR_STOP=1 -f "$(dirname "$0")/backup-counts.sql" > "$out/$name.counts"
[ -s "$out/$name.counts" ] || { echo "No tables were counted for $name; refusing an empty backup"; exit 1; }
echo "$name: $(wc -l < "$out/$name.counts") tables, $(awk -F= '{s+=$2} END{print s}' "$out/$name.counts") rows, dump $(du -h "$out/$name.dump" | cut -f1), accounts dump $(du -h "$out/$name-auth.dump" | cut -f1)"
