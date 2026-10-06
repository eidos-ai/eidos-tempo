#!/usr/bin/env bash
# Builds the three images for Cloud Run (linux/amd64), tags them with the current commit and deploys them
# to the service "tempo". Before the service exists (first deploy), it only pushes; Terraform creates it.
set -euo pipefail
cd "$(dirname "$0")/.."

project=${TEMPO_PROJECT:-eidos-15111991}
region=${TEMPO_REGION:-us-central1}
registry="$region-docker.pkg.dev/$project/tempo"

die() { echo "cloudrun-deploy: $*" >&2; exit 1; }

[[ -z $(git status --porcelain --untracked-files=no) ]] || die "commit your changes first: images are tagged with the commit"
tag=$(git rev-parse --short=12 HEAD)

build() {
  local name=$1
  shift
  echo "Building $name:$tag ..."
  docker buildx build --platform linux/amd64 --push -t "$registry/$name:$tag" -t "$registry/$name:latest" "$@"
}
build web --build-arg NGINX_SITE=cloudrun frontend
build backend backend
build db db

if ! gcloud run services describe tempo --project="$project" --region="$region" >/dev/null 2>&1; then
  echo "Images pushed as $tag and latest. The service doesn't exist yet: run terraform apply in infra/."
  exit 0
fi

gcloud run services update tempo --project="$project" --region="$region" \
  --container=web --image="$registry/web:$tag" \
  --container=backend --image="$registry/backend:$tag" \
  --container=db --image="$registry/db:$tag"
echo "Deployed $tag."
