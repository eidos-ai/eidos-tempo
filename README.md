# Eidos Tempo

Internal time tracker for Eidos. FastAPI + PostgreSQL backend, React frontend, Docker Compose on a single server.

## Features

- **Timer** in the top bar with description, project, tags and billable; one running timer per user.
- **Calendar** (week grid with zoom, drag to create) and **list** views, with day and week totals and a per-project distribution bar.
- **Suggestions** from your previous entries and projects while typing a description.
- **Admin**: members, clients and billable projects; archive instead of delete.
- **Chrome extension** to start/stop and edit the timer from the toolbar.
- **Data safety**: users only see their own time, soft deletes, daily backups.

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
uv run python -m scripts.seed_dev   # dev users and sample data; logins are in scripts/seed_dev.py
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
It uses your Tempo login in the same browser. The server address (default `http://localhost:5173`)
is in the extension's Options (right-click the icon).

## Importing from Toggl

Copies members, clients, projects, tags and time entries. Safe to re-run: a second run only updates what changed.
It refuses to import if the hours fetched differ from Toggl's summary.

Add `TEMPO_TOGGL_API_TOKEN` (Toggl → Profile settings) and `TEMPO_TOGGL_WORKSPACE_ID` to `backend/.env`, then:

```bash
cd backend
uv run python -m scripts.import_toggl --admin you@eidos.ai --dry-run   # check the report
uv run python -m scripts.import_toggl --admin you@eidos.ai
```

- `--admin EMAIL` (repeatable): who becomes admin; everyone else is a member.
- `--set-password EMAIL`: set a password for an imported user (they're created without one).
- `--cache FILE`: save Toggl's data to reuse it later. It contains personal data; keep it out of git.

On the server, pass the token from your shell so it never lands in a file:

```bash
export TEMPO_TOGGL_API_TOKEN=...
docker compose exec -e TEMPO_TOGGL_API_TOKEN -e TEMPO_TOGGL_WORKSPACE_ID=6043217 backend \
  python -m scripts.import_toggl --admin ortegatron@eidos.ai --dry-run
```

## Deployment

First install on the server:

```bash
cp .env.example .env                              # set a strong POSTGRES_PASSWORD and TEMPO_DATA_DIR
scripts/deploy.sh                                 # builds and starts; migrations run on startup
scripts/create-admin.sh you@eidos.ai "Your Name"  # first admin
```

Update: `git pull && scripts/deploy.sh` (takes a backup first). Logs: `docker compose logs -f backend`.

### Backups

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

Server (root `.env`, see `.env.example`): database credentials, `TEMPO_DATA_DIR`, `TEMPO_HTTP_PORT`,
`TEMPO_COOKIE_SECURE`, and the backup schedule (`BACKUP_TIME`, `BACKUP_RETENTION_DAYS`, `TZ`).
