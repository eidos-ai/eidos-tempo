# Eidos Tempo

Internal time tracker for Eidos. FastAPI + PostgreSQL backend, React frontend and a Chrome extension, running on
Google Cloud Run.

## Features

- **Timer** in the top bar with description, project, tags and billable; one running timer per user.
- **Calendar** (week grid with zoom, drag to create) and **list** views, with day and week totals and a per-project distribution bar.
- **Reports** like Toggl's: Summary (totals, hours per day, project split, breakdowns) and Detailed (every entry,
  editable inline or in bulk), filtered by member, client, project, tag, billable and description, exported as PDF.
- **Suggestions** from your previous entries and projects while typing a description.
- **Admin**: members, clients, billable projects and tags; archive instead of delete.
- **Chrome extension** to start/stop and edit the timer from the toolbar.
- **API tokens** (Profile page) and a **Toggl-compatible API** so scripts written for Toggl keep working.
- **Data safety**: members only see their own time (admins see everyone's in reports), soft deletes, every save
  backed up to Cloud Storage before it's confirmed, plus nightly full backups.

Verified behavior: [docs/qa-checklist.md](docs/qa-checklist.md). Agent guide and architecture rules: [CLAUDE.md](CLAUDE.md).

## Local development

Requirements: Docker with Compose v2, [uv](https://docs.astral.sh/uv/), Node 22+.

```bash
# Database (Postgres on localhost:5433)
docker compose -f docker-compose.dev.yml up -d
until docker compose -f docker-compose.dev.yml exec db pg_isready -U tempo; do sleep 1; done
docker compose -f docker-compose.dev.yml exec db psql -U tempo -c "CREATE DATABASE tempo_test"  # first time only

# Backend (http://localhost:8000, API docs at /api/docs)
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run python -m scripts.seed_dev   # dev users (+ sample data if empty); logins in scripts/seed_dev.py
uv run uvicorn app.main:create_app --factory --reload
```

In another terminal, from the repo root:

```bash
# Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

### Checks

There is no CI. Run these from the repo root before every commit:

```bash
(cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app scripts tests)
(cd frontend && npm run lint && npm run build)
(cd extension && npm run lint && npm run build)
```

### Migrations

```bash
cd backend
uv run alembic revision --autogenerate -m "describe the change"   # review the file in alembic/versions/
uv run alembic upgrade head
```

Migrations must be additive: never drop or rename a column with data in a single step.

## Chrome extension

```bash
cd extension
npm install
npm run build
```

In Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`.
It uses your Tempo login in the same browser. The server address (default: production,
`https://tempo.eidos.ai`) is in the extension's Options (right-click the icon); for
development set it to `http://localhost:5173`.

The popup's screen is served by Tempo itself (`/extension-popup.html`, code in `frontend/src/extension-popup/`), so it
updates with every deploy. Reinstall the extension only when `extension/` changes (toolbar icon, settings, permissions).

## Importing from Toggl

Copies members, clients, projects, tags and time entries. Safe to re-run: a second run only updates what changed.
It refuses to import if the hours fetched differ from Toggl's summary.

Add `TEMPO_TOGGL_API_TOKEN` (Toggl → Profile settings) and `TEMPO_TOGGL_WORKSPACE_ID` (the number in
Toggl's URL, e.g. `track.toggl.com/<workspace-id>/...`) to `backend/.env`, then:

```bash
cd backend
uv run python -m scripts.import_toggl --admin admin@eidos.ai --dry-run   # check the report
uv run python -m scripts.import_toggl --admin admin@eidos.ai
```

- `--admin EMAIL` (repeatable): who becomes admin; everyone else is a member.
- `--set-password EMAIL`: set a password for an imported user (they're created without one).
- `--cache FILE`: save Toggl's data to reuse it later. It contains personal data; keep it out of git.

For Cloud Run, import into a new backup set instead and switch the service to it (see Deployment):
`scripts/seed-bucket.sh <prefix> --admin EMAIL --toggl`.

## API for scripts (Toggl-compatible)

Each user can create a personal API token on the Profile page. Scripts send it like a Toggl token:
HTTP Basic auth with `<token>:api_token`. A token acts as its user (members only see their own entries) and is
revoked when an admin resets that user's password or deactivates them.

Same requests and responses as Toggl, under `/api/toggl`:

| Tempo | Toggl equivalent |
|---|---|
| `GET /api/toggl/me` | `GET /api/v9/me` |
| `GET /api/toggl/projects` | `GET /api/v9/workspaces/{ws}/projects` |
| `GET /api/toggl/users` | `GET /api/v9/workspaces/{ws}/users` |
| `PUT /api/toggl/time_entries/{id}` | `PUT /api/v9/workspaces/{ws}/time_entries/{id}` |
| `GET /api/toggl/reports/details` | `GET /reports/api/v2/details` |
| `GET /api/toggl/reports/summary` | `GET /reports/api/v2/summary` |
| `GET /api/toggl/reports/summary.pdf` | `GET /reports/api/v2/summary.pdf` |
| `GET /api/toggl/reports/details.pdf` | `GET /reports/api/v2/details.pdf` |

- Ids are integers: data imported from Toggl keeps its Toggl ids; anything created in Tempo gets ids from
  10,000,000,000 up, so they never collide with old Toggl ids.
- `since`/`until` are days in `TEMPO_API_TIMEZONE` (default `America/Montevideo`); `timezone=` overrides it.
- There's a single workspace: any `workspace_id` is accepted. Tasks, rates and currencies don't exist (null/empty).
- Moving a Toggl script: change the URLs as in the table and use a Tempo token as the Toggl token.

## Deployment

Production runs on Google Cloud Run (project `eidos-15111991`, region `us-central1`): one service `tempo` with three
containers (nginx, backend, Postgres + WAL-G) and the database in memory, rebuilt from `gs://eidos-tempo` on every
start. Every save is archived to the bucket before the response, and only the instance holding the lease
(`lease/owner`) may write. Address: `https://tempo.eidos.ai` (a Cloud Run domain mapping, set up by hand), the same
service as `https://tempo-787081458205.us-central1.run.app` and `https://tempo-e4zfnlhfya-uc.a.run.app` (which
`terraform output service_url` prints).

First-time setup, prerequisites and the Terraform files: [infra/README.md](infra/README.md).

| Task | Command |
|---|---|
| Compare what runs with the local checkout (read-only) | `scripts/deploy-status.sh` |
| Deploy the current commit | `scripts/cloudrun-deploy.sh` |
| Create a new backup set (empty, or with `--toggl`) | `scripts/seed-bucket.sh <prefix> --admin EMAIL [--toggl]` |
| Restore a backup set locally to inspect it (localhost:5434) | `scripts/restore-local.sh <prefix>` |
| Switch the service to another backup set | set `backup_prefix` in `infra/terraform.tfvars`, `terraform apply` |
| Open the service while it isn't public | `gcloud run services proxy tempo --region us-central1 --port 8080` → `http://localhost:8080` |

### Deploying a new version

In Claude Code, `/deploy` walks through these steps (status, checks, deploy, verification).

1. Run the checks above and commit: the script refuses uncommitted changes, because images are tagged with the commit.
2. `scripts/cloudrun-deploy.sh` builds the three images (linux/amd64), pushes them and deploys a new revision.
3. The new instance takes the lease, waits 30 s for the old one's last saves, restores and replays the bucket, and
   then gets the traffic (about a minute in total). **Saves fail during that minute** (the app says "not saved" and
   rolls back), so deploy outside working hours and tell the team. Sessions survive: nobody has to log in again.
4. Check: Cloud Run → `tempo` → Logs shows `tempo-db: database ready` and `Holding the database lease`, and
   `/api/health` answers `{"status":"ok"}`.

Roll back by deploying an older commit (`git checkout <sha> && scripts/cloudrun-deploy.sh`). Migrations are additive,
so older code runs on the newer database. `gcloud run services update-traffic tempo --region us-central1
--to-revisions <revision>=100` is faster, but only use it for a revision on the same `backup_prefix`.

### Backups on Cloud Run

- `gs://eidos-tempo/backups/<prefix>/`: `wal_005/` (every save), `basebackups_005/` (full backups) and `dumps/`
  (a `pg_dump` per night). The nightly job (`tempo-nightly-backup`, 03:00 Montevideo) makes the full backup and the
  dump; check that a new file appears in `dumps/` every day.
- Files under `backups/` are deleted after 180 days; deleted files can be recovered for 60 days (soft delete). The
  service account can add and read backups but not delete or overwrite them.
- To look at the data without touching the service: `scripts/restore-local.sh <prefix>`.

### Logs and usage

Cloud Run → `tempo` → **Metrics** (CPU, memory, requests, latency, instances) and **Logs** (filter by container:
`web`, `backend`, `db`). From the terminal:

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="tempo" AND severity>=WARNING' --freshness 1d --limit 50
```

### Cloud Run simulation

`docker-compose.cloudrun.yml` runs the same three containers sharing one network namespace, with in-memory volumes
and a Cloud Storage emulator instead of the bucket:

```bash
docker compose -f docker-compose.cloudrun.yml up -d --build      # http://127.0.0.1:8090
docker compose -f docker-compose.cloudrun.yml exec backend python -m app.cli ensure-admin --email you@eidos.local
docker compose -f docker-compose.cloudrun.yml exec backend python -m app.cli backup   # what the scheduler runs
```

Simulate a crash: kill `web db backend`, remove the `pgdata` and `run` volumes, `up -d` again; the database is
restored from the emulator.

### Docker Compose on a server (previous setup)

First install on the server:

```bash
cp .env.example .env                              # set a strong POSTGRES_PASSWORD and TEMPO_DATA_DIR
scripts/deploy.sh                                 # builds and starts; migrations run on startup
scripts/create-admin.sh admin@eidos.ai "Your Name"  # first admin
```

Update: `git pull && scripts/deploy.sh` (takes a backup first). Logs: `docker compose logs -f backend`.

Backups:

- Data lives in `${TEMPO_DATA_DIR}/pgdata`; backups in `${TEMPO_DATA_DIR}/backups` (daily, before every deploy and restore).
- Restore: `scripts/restore.sh` lists backups, `scripts/restore.sh <file>` restores one.
- Copy the backups folder off the server for disaster recovery.
- Never run `docker compose down -v`. Upgrade Postgres major versions with dump and restore.

## Configuration

Backend (`backend/.env` in development):

| Variable | Default | Purpose |
|---|---|---|
| `TEMPO_DATABASE_URL` | required | e.g. `postgresql+psycopg://user:pass@host:5432/tempo` |
| `TEMPO_COOKIE_SECURE` | `true` | Session cookie only over HTTPS |
| `TEMPO_SESSION_IDLE_DAYS` | `90` | Days without use before logging in again |
| `TEMPO_ENABLE_API_DOCS` | `false` | Serve `/api/docs` |
| `TEMPO_TEST_DATABASE_URL` | unset | Enables the Postgres integration tests |
| `TEMPO_LOG_LEVEL` | `INFO` | Log level |
| `TEMPO_API_TIMEZONE` | `America/Montevideo` | Timezone of days in the Toggl-compatible API |
| `TEMPO_DURABLE_WRITES` | `false` | Cloud Run: archive each write to the bucket before responding; hold the lease |
| `TEMPO_BUCKET` / `TEMPO_BACKUP_PREFIX` | unset | Cloud Run: backups go to `gs://<bucket>/backups/<prefix>/` |
| `TEMPO_ARCHIVE_TIMEOUT_SECONDS` | `90` | Cloud Run: a save not archived by then returns 503 (keep it under nginx's `proxy_read_timeout`, 120 s) |
| `TEMPO_BACKUP_AUDIENCE` / `TEMPO_BACKUP_CALLER_EMAIL` | unset | Cloud Run: OIDC audience and service account allowed to call `/api/internal/backup` |

Server (root `.env`, see `.env.example`): database credentials, `TEMPO_DATA_DIR`, `TEMPO_HTTP_PORT`,
`TEMPO_COOKIE_SECURE`, and the backup schedule (`BACKUP_TIME`, `BACKUP_RETENTION_DAYS`, `TZ`).
