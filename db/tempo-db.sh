#!/usr/bin/env bash
# Postgres for one Cloud Run instance. The disk is in memory, so the database is rebuilt from the bucket
# on every start and every WAL segment is archived back to it.
#
#   tempo-db run      start Postgres (TEMPO_DB_MODE: serve | seed | inspect)
#   tempo-db backup   push a new base backup of the running database
#
# serve:   take the lease, wait the grace period, restore the latest backup, archive every change.
# seed:    start an empty database for a new, empty backup prefix (scripts/seed-bucket.sh); TCP on 5432.
# inspect: restore a copy without the lease and without archiving (scripts/restore-local.sh); TCP on 5432.
set -euo pipefail

: "${TEMPO_BUCKET:?}" "${TEMPO_BACKUP_PREFIX:?}"
mode=${TEMPO_DB_MODE:-serve}
grace_seconds=${TEMPO_LEASE_GRACE_SECONDS:-30}
run_dir=/run/tempo
lease_object=lease%2Fowner
gcs_api=${STORAGE_EMULATOR_HOST:-https://storage.googleapis.com}

export WALG_GS_PREFIX="gs://$TEMPO_BUCKET/backups/$TEMPO_BACKUP_PREFIX"
export WALG_PREVENT_WAL_OVERWRITE=true WALG_PG_WAL_SIZE=1
export PGHOST=$run_dir PGUSER=tempo PGDATABASE=tempo

log() { echo "tempo-db: $*" >&2; }

# Local runs mount the user's gcloud credentials; WAL-G runs as postgres, which must be able to read them.
prepare_credentials() {
  install -d -o postgres -g postgres -m 755 "$run_dir"
  if [[ -n ${GOOGLE_APPLICATION_CREDENTIALS:-} && $GOOGLE_APPLICATION_CREDENTIALS != "$run_dir/credentials.json" ]]; then
    install -o postgres -m 600 "$GOOGLE_APPLICATION_CREDENTIALS" "$run_dir/credentials.json"
  fi
  [[ -f $run_dir/credentials.json ]] && export GOOGLE_APPLICATION_CREDENTIALS=$run_dir/credentials.json
  return 0
}

access_token() {
  curl -fsS -H "Metadata-Flavor: Google" \
    http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token |
    jq -r .access_token
}

# gcs METHOD PATH [curl args...]: prints the HTTP status; the body is in $run_dir/gcs-response.
gcs() {
  local auth=()
  [[ -z ${STORAGE_EMULATOR_HOST:-} ]] && auth=(-H "Authorization: Bearer $(access_token)")
  curl -sS -o "$run_dir/gcs-response" -w '%{http_code}' -X "$1" "${auth[@]}" "${@:3}" "$gcs_api$2"
}

lease_generation() {
  local status
  status=$(gcs GET "/storage/v1/b/$TEMPO_BUCKET/o/$lease_object")
  case $status in
    200) jq -r .generation "$run_dir/gcs-response" ;;
    404) echo 0 ;;
    *) log "reading the lease failed: HTTP $status $(cat "$run_dir/gcs-response")"; return 1 ;;
  esac
}

take_lease() {
  local holder current status
  holder="${K_REVISION:-local} $(hostname) $(date -u +%FT%TZ)"
  for _ in 1 2 3 4 5; do
    current=$(lease_generation) || { sleep 2; continue; }
    status=$(gcs POST "/upload/storage/v1/b/$TEMPO_BUCKET/o?uploadType=media&name=$lease_object&ifGenerationMatch=$current" \
      -H "Content-Type: text/plain" --data-binary "$holder")
    if [[ $status == 200 ]]; then
      jq -r .generation "$run_dir/gcs-response" >"$run_dir/lease-generation"
      log "lease acquired (generation $(cat "$run_dir/lease-generation"), previous $current)"
      return 0
    fi
    log "taking the lease failed: HTTP $status; retrying"
    sleep 1
  done
  log "could not take the lease"
  exit 1
}

require_lease() {
  local current
  current=$(lease_generation)
  if [[ $current != "$(cat "$run_dir/lease-generation")" ]]; then
    log "a newer instance took the lease (generation $current); exiting"
    exit 1
  fi
}

has_backup() {
  local backups
  backups=$(wal-g backup-list --json 2>"$run_dir/wal-g-error") ||
    { log "listing backups failed: $(cat "$run_dir/wal-g-error")"; exit 1; }
  [[ $(jq 'length' <<<"${backups:-[]}") -gt 0 ]]
}

new_database=false

restore_or_init() {
  install -d -o postgres -g postgres -m 700 "$PGDATA"
  if has_backup; then
    [[ $mode == seed ]] && { log "$WALG_GS_PREFIX already has a backup; refusing to seed it"; exit 1; }
    log "restoring the latest backup from $WALG_GS_PREFIX"
    gosu postgres wal-g backup-fetch "$PGDATA" LATEST
    gosu postgres touch "$PGDATA/recovery.signal"
    return
  fi
  if [[ $mode == seed || ${TEMPO_DB_INIT_IF_EMPTY:-false} == true ]]; then
    log "no backup in $WALG_GS_PREFIX: creating an empty database"
    gosu postgres initdb --username=tempo --auth=trust --wal-segsize=1 --encoding=UTF8 >/dev/null
    new_database=true
    return
  fi
  log "no backup in $WALG_GS_PREFIX; seed it first with scripts/seed-bucket.sh"
  exit 1
}

postgres_args() {
  local args=(
    -c "unix_socket_directories=$run_dir"
    -c "restore_command=wal-g wal-fetch %f %p"
    -c recovery_target_timeline=latest
    -c hot_standby=off
    -c wal_level=replica
    -c archive_timeout=0
    -c max_wal_size=64MB
    -c min_wal_size=16MB
    -c wal_recycle=off
    -c shared_buffers=64MB
    -c log_checkpoints=off
  )
  if [[ $mode == inspect ]]; then
    args+=(-c archive_mode=off)
  else
    args+=(-c archive_mode=on -c "archive_command=wal-g wal-push %p")
  fi
  if [[ $mode == serve ]]; then
    args+=(-c "listen_addresses=" -c hba_file=/etc/tempo/pg_hba.conf)
  else
    args+=(-c "listen_addresses=*" -c hba_file=/etc/tempo/pg_hba_tcp.conf)
  fi
  printf '%s\n' "${args[@]}"
}

run() {
  rm -f "$run_dir/db-ready" "$run_dir/lease-generation"

  if [[ $mode == serve ]]; then
    take_lease
    log "waiting ${grace_seconds}s for writes in flight on the previous instance"
    sleep "$grace_seconds"
    require_lease
  fi

  restore_or_init

  local args
  mapfile -t args < <(postgres_args)
  gosu postgres postgres "${args[@]}" &
  local pid=$!
  trap 'kill -INT "$pid" 2>/dev/null || true' TERM INT

  until pg_isready -q -d postgres; do
    kill -0 "$pid" 2>/dev/null || { log "Postgres stopped during start-up"; exit 1; }
    sleep 0.5
  done
  if [[ $new_database == true ]]; then
    gosu postgres createdb tempo
    backup
  fi
  touch "$run_dir/db-ready"
  log "database ready"

  while kill -0 "$pid" 2>/dev/null; do wait "$pid" || true; done
}

backup() {
  log "pushing a base backup to $WALG_GS_PREFIX"
  gosu postgres wal-g backup-push "$PGDATA"
}

prepare_credentials
case ${1:-run} in
  run) run ;;
  backup) backup ;;
  *) echo "usage: tempo-db run|backup" >&2; exit 2 ;;
esac
