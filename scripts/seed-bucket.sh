#!/usr/bin/env bash
# Builds a new data set locally (in Docker) and uploads it as the first backup of gs://eidos-tempo/backups/<prefix>/.
# The Cloud Run service starts from it once Terraform's backup_prefix points there.
#
#   scripts/seed-bucket.sh <prefix> --admin EMAIL [--admin EMAIL ...] [--toggl]
#
# --toggl imports Toggl (TEMPO_TOGGL_API_TOKEN and TEMPO_TOGGL_WORKSPACE_ID from backend/.env).
# Each admin is created, or promoted if imported, and asked for a password.
set -euo pipefail
cd "$(dirname "$0")/.."

bucket=${TEMPO_BUCKET:-eidos-tempo}
project=${TEMPO_PROJECT:-eidos-15111991}
port=${TEMPO_SEED_PORT:-5434}
container=tempo-seed
credentials=$HOME/.config/gcloud/application_default_credentials.json

die() { echo "seed-bucket: $*" >&2; exit 1; }

[[ $# -ge 1 ]] || die "usage: scripts/seed-bucket.sh <prefix> --admin EMAIL [--admin EMAIL ...] [--toggl]"
prefix=$1
shift
[[ $prefix =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "prefix must be lowercase letters, digits and dashes"
admins=()
toggl=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --admin) admins+=("$2"); shift 2 ;;
    --toggl) toggl=true; shift ;;
    *) die "unknown option $1" ;;
  esac
done
[[ ${#admins[@]} -gt 0 ]] || die "give at least one --admin EMAIL"
[[ -f $credentials ]] || die "run: gcloud auth application-default login"

if listing=$(gcloud storage ls --project="$project" "gs://$bucket/backups/$prefix/" 2>&1); then
  die "gs://$bucket/backups/$prefix/ already has data; choose a new prefix"
elif [[ $listing != *"matched no objects"* ]]; then
  die "could not check gs://$bucket/backups/$prefix/: $listing"
fi

echo "Building the database image (linux/amd64, the same as Cloud Run)..."
docker build -q --platform linux/amd64 -t eidos-tempo-db:seed db >/dev/null

docker rm -f "$container" >/dev/null 2>&1 || true
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$container" --platform linux/amd64 \
  -e TEMPO_DB_MODE=seed -e TEMPO_BUCKET="$bucket" -e TEMPO_BACKUP_PREFIX="$prefix" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/credentials.json -v "$credentials:/credentials.json:ro" \
  -p "127.0.0.1:$port:5432" eidos-tempo-db:seed >/dev/null

echo "Starting an empty database..."
until docker exec "$container" test -f /run/tempo/db-ready 2>/dev/null; do
  docker inspect -f '{{.State.Running}}' "$container" | grep -q true || { docker logs "$container"; die "the database did not start"; }
  sleep 1
done

export TEMPO_DATABASE_URL="postgresql+psycopg://tempo@127.0.0.1:$port/tempo"
cd backend
uv run alembic upgrade head
if [[ $toggl == true ]]; then
  admin_args=()
  for admin in "${admins[@]}"; do admin_args+=(--admin "$admin"); done
  uv run python -m scripts.import_toggl "${admin_args[@]}"
fi
for admin in "${admins[@]}"; do
  uv run python -m app.cli ensure-admin --email "$admin"
done
cd ..

echo "Uploading the base backup..."
docker exec "$container" tempo-db backup
docker stop -t 60 "$container" >/dev/null

echo "Done: gs://$bucket/backups/$prefix/ is ready. Point the service at it with backup_prefix = \"$prefix\"."
