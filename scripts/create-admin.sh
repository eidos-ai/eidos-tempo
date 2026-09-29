#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

if [ $# -ne 2 ]; then
  echo "Usage: scripts/create-admin.sh <email> \"<full name>\""
  exit 1
fi

docker compose exec backend python -m app.cli create-admin --email "$1" --name "$2"
