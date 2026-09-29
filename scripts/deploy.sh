#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

if docker compose ps --status running --services | grep -q '^backup$'; then
  echo "Taking pre-deploy backup..."
  docker compose exec -T backup /scripts/backup.sh predeploy
fi

docker compose up -d --build
docker compose ps
