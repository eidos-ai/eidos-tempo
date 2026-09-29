#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

if [ $# -ne 1 ]; then
  echo "Usage: scripts/restore.sh <backup-file-name>"
  echo "Available backups:"
  docker compose exec -T backup ls -lh /backups
  exit 1
fi

printf "This replaces ALL current data with %s. Type 'restore' to continue: " "$1"
read -r answer
[ "${answer}" = "restore" ] || { echo "Aborted"; exit 1; }

docker compose exec -T backup /scripts/backup.sh prerestore
docker compose stop backend
docker compose exec -T backup sh -c 'pg_restore --clean --if-exists --no-owner --dbname="$PGDATABASE" "/backups/$0"' "$1"
docker compose start backend
echo "Restore complete"
