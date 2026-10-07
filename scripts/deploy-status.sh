#!/usr/bin/env bash
# Compares the version running on Cloud Run with the local checkout and says what a deploy would ship.
# Read-only: it changes nothing locally or in the cloud.
#
#   scripts/deploy-status.sh
set -euo pipefail
cd "$(dirname "$0")/.."

project=${TEMPO_PROJECT:-eidos-15111991}
region=${TEMPO_REGION:-us-central1}

service=$(gcloud run services describe tempo --project="$project" --region="$region" --format=json)
field() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)" <<<"$service"; }

running_image=$(field "d['spec']['template']['spec']['containers'][0]['image']")
running=${running_image##*:}
revision=$(field "d['status']['latestReadyRevisionName']")
traffic=$(field "', '.join(f\"{t.get('revisionName', 'latest')}={t['percent']}%\" for t in d['status']['traffic'])")
prefix=$(field "next(e['value'] for c in d['spec']['template']['spec']['containers'] for e in c.get('env', []) if e['name'] == 'TEMPO_BACKUP_PREFIX')")

git fetch -q origin 2>/dev/null || echo "warning: could not fetch origin; comparing with the local copy of origin/main"
head=$(git rev-parse --short=12 HEAD)

echo "Running:  $running (revision $revision; traffic $traffic; backup set $prefix)"
echo "Local:    $head on $(git branch --show-current || echo detached), $(git log -1 --format='%cr: %s')"
[[ -z $(git status --porcelain --untracked-files=no) ]] || echo "Local:    UNCOMMITTED CHANGES (the deploy script refuses to run)"
[[ $(git rev-parse HEAD) == $(git rev-parse origin/main) ]] || echo "Local:    HEAD is not origin/main ($(git rev-parse --short=12 origin/main))"

if ! git cat-file -e "$running^{commit}" 2>/dev/null; then
  echo "Status:   the running commit $running is not in this checkout (fetch, or it was never pushed)"
  exit 0
fi
if [[ $(git rev-parse "$running") == $(git rev-parse HEAD) ]]; then
  echo "Status:   up to date; nothing to deploy"
  exit 0
fi
if ! git merge-base --is-ancestor "$running" HEAD; then
  echo "Status:   HEAD does not contain the running commit; deploying would drop its changes"
  exit 0
fi

echo "Status:   $(git rev-list --count "$running"..HEAD) new commit(s):"
git log --format='          %h %s' "$running"..HEAD
changed=$(git diff --name-only "$running" HEAD)
area() { grep -qE "$1" <<<"$changed" && echo "          - $2"; return 0; }
echo "Changes:"
area '^backend/' "backend"
area '^frontend/' "web app"
area '^db/' "database container"
area '^backend/alembic/versions/' "MIGRATIONS (check they are additive)"
area '^infra/.*\.tf$' "INFRA: run terraform plan/apply as well (the deploy script only changes images)"
area '^extension/' "extension: rebuild it and ask the team to reload it (not part of the deploy)"
grep -qE '^(backend|frontend|db)/' <<<"$changed" || echo "          (nothing the service runs changed: no deploy needed)"
