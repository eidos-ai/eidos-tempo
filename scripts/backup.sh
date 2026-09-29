#!/bin/sh
set -eu

label="${1:-daily}"
target="/backups/tempo_${label}_$(date +%Y%m%d_%H%M%S).dump"

pg_dump --format=custom --file="${target}.partial"
mv "${target}.partial" "${target}"
echo "Backup written: ${target} ($(du -h "${target}" | cut -f1))"

find /backups -name 'tempo_*.dump' -mtime "+${BACKUP_RETENTION_DAYS:-14}" -print -delete
