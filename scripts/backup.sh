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
node "$(dirname "$0")/backup-snapshot.mjs" "$name" "$url" "$out"
