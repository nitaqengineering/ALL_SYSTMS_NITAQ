#!/usr/bin/env bash
# Encrypts or opens a NITAQ backup with AES-256. The passphrase comes from the PASSPHRASE environment variable.
#   PASSPHRASE=... scripts/backup-crypt.sh encrypt <folder> <file.tar.gz.gpg>
#   PASSPHRASE=... scripts/backup-crypt.sh decrypt <file.tar.gz.gpg>      (extracts into the current folder)
set -euo pipefail
[ -n "${PASSPHRASE:-}" ] || { echo "Set PASSPHRASE"; exit 1; }
case "$1" in
 encrypt) tar -czf - "$2" | gpg --batch --yes --pinentry-mode loopback --passphrase-file <(printf %s "$PASSPHRASE") --symmetric --cipher-algo AES256 -o "$3";;
 decrypt) gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file <(printf %s "$PASSPHRASE") --decrypt "$2" | tar -xzf -;;
 *) echo "encrypt or decrypt"; exit 1;;
esac
