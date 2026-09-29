#!/bin/sh
set -eu

until pg_isready --quiet; do sleep 2; done
echo "Backup scheduler started, daily at ${BACKUP_TIME}"

while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_TIME}" +%s)
  if [ "${next}" -le "${now}" ]; then
    next=$(date -d "tomorrow ${BACKUP_TIME}" +%s)
  fi
  sleep $((next - now))
  /scripts/backup.sh daily || echo "Backup failed" >&2
done
