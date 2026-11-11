#!/usr/bin/env bash
# CI proof that the backup chain works: dump -> encrypt -> decrypt -> restore into a new database -> compare.
# Runs only against the synthetic database built by scripts/backup-selftest.mjs on the local test server.
set -euo pipefail
source_url="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/nitaq_backup_selftest"
rm -rf backup selftest.tar.gz.gpg
bash scripts/backup.sh selftest "$source_url" backup
PASSPHRASE='self-test passphrase only' bash scripts/backup-crypt.sh encrypt backup selftest.tar.gz.gpg
rm -rf backup
if PASSPHRASE='wrong passphrase' bash scripts/backup-crypt.sh decrypt selftest.tar.gz.gpg > /dev/null 2>&1; then echo "FAIL a wrong passphrase opened the backup"; exit 1; fi
rm -rf backup
PASSPHRASE='self-test passphrase only' bash scripts/backup-crypt.sh decrypt selftest.tar.gz.gpg
bash scripts/backup-verify.sh selftest backup
# A broken restore statement must be rejected even with identical row counts.
cp backup/selftest-auth-triggers.sql backup/auth-triggers-original.sql
printf '\nselect nitaq_missing_restore_probe();\n' >> backup/selftest-auth-triggers.sql
if bash scripts/backup-verify.sh selftest backup > /dev/null 2>&1; then echo "FAIL verification ignored a restore error"; exit 1; fi
mv backup/auth-triggers-original.sql backup/selftest-auth-triggers.sql
# Matching row counts do not excuse a missing schema object.
cp backup/selftest.structure backup/structure-original
printf 'function|missing_test_function|0000\n' >> backup/selftest.structure
if bash scripts/backup-verify.sh selftest backup > /dev/null 2>&1; then echo "FAIL verification accepted mismatched schema objects"; exit 1; fi
mv backup/structure-original backup/selftest.structure
# A backup that lost rows must be rejected.
first="$(head -1 backup/selftest.counts)"
sed -i "1s/.*/${first%%=*}=999999/" backup/selftest.counts
if bash scripts/backup-verify.sh selftest backup > /dev/null 2>&1; then echo "FAIL verification accepted a backup with wrong row counts"; exit 1; fi
rm -rf backup selftest.tar.gz.gpg
echo "PASS backup chain: encrypted backup opens only with its passphrase, restores Auth and application structure with identical counts, rejects restore errors and count mismatches"
