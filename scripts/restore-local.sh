#!/usr/bin/env bash
# Restores the latest state of gs://eidos-tempo/backups/<prefix>/ into a local, read-only-to-the-bucket
# copy (no lease, no archiving) on localhost:5434, to inspect it or test a restore.
#
#   scripts/restore-local.sh <prefix>        e.g. scripts/restore-local.sh prod-2026-10-17
#   scripts/restore-local.sh --stop
set -euo pipefail
cd "$(dirname "$0")/.."

bucket=${TEMPO_BUCKET:-eidos-tempo}
port=${TEMPO_RESTORE_PORT:-5434}
container=tempo-restore
credentials=$HOME/.config/gcloud/application_default_credentials.json

die() { echo "restore-local: $*" >&2; exit 1; }

[[ $# -eq 1 ]] || die "usage: scripts/restore-local.sh <prefix> | --stop"
if [[ $1 == --stop ]]; then
  docker rm -f "$container" >/dev/null && echo "Stopped."
  exit 0
fi
prefix=$1
[[ -f $credentials ]] || die "run: gcloud auth application-default login"

docker build -q --platform linux/amd64 -t eidos-tempo-db:seed db >/dev/null
docker rm -f "$container" >/dev/null 2>&1 || true
docker run -d --name "$container" --platform linux/amd64 \
  -e TEMPO_DB_MODE=inspect -e TEMPO_BUCKET="$bucket" -e TEMPO_BACKUP_PREFIX="$prefix" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/credentials.json -v "$credentials:/credentials.json:ro" \
  -p "127.0.0.1:$port:5432" eidos-tempo-db:seed >/dev/null

echo "Restoring gs://$bucket/backups/$prefix/ ..."
until docker exec "$container" test -f /run/tempo/db-ready 2>/dev/null; do
  docker inspect -f '{{.State.Running}}' "$container" | grep -q true || { docker logs "$container"; die "restore failed"; }
  sleep 1
done

docker exec "$container" psql -h /run/tempo -U tempo -c \
  "SELECT count(*) AS entries, max(start) AS latest_start, max(updated_at) AS latest_change
   FROM time_entries WHERE deleted_at IS NULL"
cat <<INFO
Restored copy running on localhost:$port. Nothing you do here reaches the bucket.
  Inspect:      docker exec -it $container psql -h /run/tempo -U tempo
  Run the app:  cd backend && TEMPO_DATABASE_URL=postgresql+psycopg://tempo@127.0.0.1:$port/tempo uv run uvicorn app.main:create_app --factory --port 8001
  Stop:         scripts/restore-local.sh --stop
INFO
