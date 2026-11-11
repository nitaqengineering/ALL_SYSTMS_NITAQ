#!/usr/bin/env bash
# CI helper: PostgreSQL 17 client tools (pg_dump, pg_restore, psql) on an Ubuntu runner.
set -euo pipefail
sudo apt-get update -qq || true
if ! sudo apt-get install -y -qq postgresql-client-17; then
 sudo apt-get install -y -qq postgresql-common
 sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
 sudo apt-get install -y -qq postgresql-client-17
fi
echo /usr/lib/postgresql/17/bin >> "$GITHUB_PATH"
/usr/lib/postgresql/17/bin/pg_dump --version
