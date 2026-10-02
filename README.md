# Eidos Tempo

Internal time tracker for Eidos, built to replace Toggl with a familiar layout.
FastAPI + PostgreSQL backend, React frontend, deployed with Docker Compose on a single server.

## Features

- **Timer**: start/stop from the top bar, edit description and project while running, one running timer per user, billable indicator from the project.
- **Description suggestions**: typing a description suggests your previous entries (no time limit) and matching projects; picking one fills in the description, project and client, like Toggl.
- **Calendar view**: week grid (5 or 7 days) with zoom, drag or click to create entries, click to edit, day and week totals.
- **List view**: entries grouped by day with totals; continue, edit or delete an entry.
- **Preferences**: view, days shown, zoom and light/dark theme (brandbook colors, toggle in the sidebar) are saved per user on the server.
- **Stay logged in**: sessions renew automatically while you use the app; you only log in again after 90 days without using it.
- **Admin**: manage members (roles, deactivation, password reset), clients and billable projects; archive instead of delete.
- **Data safety**: users only see their own time, deleted entries are kept (soft delete), daily backups with a restore script.

The full verified behavior list is in [docs/qa-checklist.md](docs/qa-checklist.md).

## Architecture

```
Browser (React SPA) ──► nginx ──/api──► FastAPI backend ──► PostgreSQL
                                                              ▲
                                                 backup container (daily pg_dump)
```

```
backend/app/
  domain/        Dataclasses, enums and value objects; no framework imports
  services/      Business rules (auth, users, clients, projects, time entries)
  repositories/  Protocols (protocols.py) + SQLAlchemy implementations (sql/)
  api/           FastAPI routes, Pydantic schemas, dependencies, error mapping
  db/            ORM tables and session factory
  auth/          Password hashing and session tokens
backend/alembic/ Database migrations
backend/tests/   Service, API (in-memory fakes) and Postgres integration tests
frontend/src/
  api/           Typed HTTP client, endpoints, types, query keys
  features/      One folder per feature (timer, calendar, list, projects, ...)
  components/    Shared UI (buttons, modal, sidebar, ...)
  lib/           Time helpers, query client, toasts, theme
scripts/         Deploy, backup, restore and create-admin scripts
```

The frontend is a pure client of the JSON API, so the planned reports API and Chrome extension reuse the same services.

### Development vs production

| | Development | Production |
|---|---|---|
| Database | `docker-compose.dev.yml` (Postgres only, `localhost:5433`) | `db` container in `docker-compose.yml` |
| Backend | uvicorn on your machine with auto-reload | `backend` image built from `backend/Dockerfile` |
| Frontend | Vite dev server with hot reload; proxies `/api` to the backend | `web` image: Vite builds static files, nginx serves them and proxies `/api` |
| Backups | none | `backup` container (official Postgres image running `scripts/backup-loop.sh`) |

Only two images are built (`backend` and `web`); `db` and `backup` use the official `postgres:17` image.
Development runs no app images at all, so code changes show up instantly.

## Local development

Requirements: Docker with Compose v2, [uv](https://docs.astral.sh/uv/), Node 22+.

```bash
# 1. Database (Postgres on localhost:5433)
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml exec db psql -U tempo -c "CREATE DATABASE tempo_test"   # once, for integration tests

# 2. Backend (http://localhost:8000, API docs at /api/docs)
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run python -m scripts.seed_dev        # dev admin, member and sample data; safe to re-run
uv run uvicorn app.main:create_app --factory --reload

# 3. Frontend (http://localhost:5173, proxies /api to the backend), in another terminal
cd frontend
npm install
npm run dev
```

The dev login credentials are defined in `backend/scripts/seed_dev.py`. API docs: http://localhost:8000/api/docs (development only).

| Service | Dev port |
|---|---|
| Frontend (Vite) | 5173 |
| Backend (uvicorn) | 8000 |
| PostgreSQL | 5433 |

### Checks

Run before every commit:

```bash
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app scripts tests
cd frontend && npm run lint && npm run build
```

There is no CI yet, so these checks are run by hand before committing.

Postgres integration tests run when `TEMPO_TEST_DATABASE_URL` is set in `backend/.env` (it is in `.env.example`) and are skipped otherwise.

### Database migrations

```bash
cd backend
uv run alembic revision --autogenerate -m "add hourly rate to projects"
# review the generated file in alembic/versions/, then:
uv run alembic upgrade head
```

Migrations must be additive. Never drop or rename a column or table that holds data in a single step.

## Chrome extension

`extension/` holds a Toggl-style Chrome extension: start/stop the timer, edit the running entry, pick a
project, and continue recent entries from the toolbar.

```bash
cd extension && npm install && npm run build
```

Load it in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`.
It uses your Eidos Tempo login in the same browser, so there is nothing to configure per person.
The address defaults to `http://localhost:5173`; change it in the extension's settings
(right-click the icon → Options). Only `https://` addresses are accepted outside localhost.

## Configuration

Backend (`backend/.env` in development, set by `docker-compose.yml` in production):

| Variable | Default | Purpose |
|---|---|---|
| `TEMPO_DATABASE_URL` | required | SQLAlchemy URL, e.g. `postgresql+psycopg://user:pass@host:5432/tempo` |
| `TEMPO_COOKIE_SECURE` | `true` | Send the session cookie only over HTTPS |
| `TEMPO_SESSION_IDLE_DAYS` | `90` | Days without using the app before a user must log in again; each day of use renews the session |
| `TEMPO_SESSION_COOKIE_NAME` | `tempo_session` | Session cookie name |
| `TEMPO_LOG_LEVEL` | `INFO` | Log level |
| `TEMPO_ENABLE_API_DOCS` | `false` | Serve interactive API docs at `/api/docs` (enabled in `backend/.env.example` for development) |
| `TEMPO_TEST_DATABASE_URL` | unset | Enables Postgres integration tests |

Deployment (root `.env`, see `.env.example`):

| Variable | Purpose |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Database credentials (use a strong password) |
| `TEMPO_DATA_DIR` | Host folder for database files and backups, e.g. `/srv/eidos-tempo` |
| `TEMPO_HTTP_PORT` | Port nginx listens on |
| `TEMPO_COOKIE_SECURE` | `true` behind HTTPS, `false` only for plain-HTTP internal access |
| `TEMPO_SESSION_IDLE_DAYS` | Days of inactivity before logout (default 90) |
| `BACKUP_TIME`, `BACKUP_RETENTION_DAYS`, `TZ` | Daily backup time (in `TZ`) and days to keep |

## Deployment

First install on the server:

```bash
cp .env.example .env                              # edit values
scripts/deploy.sh                                 # build and start; migrations run on startup
scripts/create-admin.sh you@eidos.ai "Your Name"  # first admin; admins create everyone else
```

Updating: `git pull && scripts/deploy.sh`. The script takes a pre-deploy backup when the stack is running.
Images are built on the server from the checked-out code; there is no CI/CD pipeline or image registry yet.

Current workflow: develop locally → run the checks → commit → push → on the server `git pull && scripts/deploy.sh`.

HTTPS: put a TLS-terminating reverse proxy (e.g. Caddy or nginx with a certificate) in front of `TEMPO_HTTP_PORT` and keep `TEMPO_COOKIE_SECURE=true`. Over plain HTTP with `true`, browsers drop the session cookie and the login page explains the problem.

Logs: `docker compose logs -f backend` (also `web`, `db`, `backup`).

### Data and backups

- Database files live in `${TEMPO_DATA_DIR}/pgdata`, a host folder that survives container rebuilds and restarts.
- Backups are written to `${TEMPO_DATA_DIR}/backups` daily at `BACKUP_TIME`, before every deploy and before every restore, and are deleted after `BACKUP_RETENTION_DAYS`. Backups are small: a few MB even with years of data.
- Restore: `scripts/restore.sh` lists backups; `scripts/restore.sh <file>` asks for confirmation, takes a safety backup and restores.
- Backups are on the same server as the database. Copy `${TEMPO_DATA_DIR}/backups` elsewhere for disaster recovery.
- Never run `docker compose down -v`, and never upgrade the Postgres major version by only changing the image tag (dump and restore instead).

## Security

The server is reachable from the internet, so:

- **HTTPS is mandatory and not set up yet.** Without it, passwords and session cookies travel in plain text. Terminate TLS in front of nginx and keep `TEMPO_COOKIE_SECURE=true` before exposing the server.
- **Firewall**: expose only 80/443 (and SSH restricted to key-based login). The database and backend are never published; only the `web` container has a port.
- **Every API endpoint requires a session** except `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/health`. Admin endpoints return 403 to members. `backend/tests/test_endpoint_protection.py` enforces this for every route.
- **Login brute force**: nginx allows 5 login attempts per minute per IP (burst 10), then returns 429. Login takes the same time for unknown and existing emails, so accounts can't be discovered.
- **Browser protections**: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, no CORS, `SameSite=Lax` HttpOnly cookies, no server version in headers.
- **Behind a TLS proxy** (Caddy, a load balancer), configure nginx's `real_ip` module to trust the proxy, otherwise all users share one login rate limit.

## Troubleshooting

- **Port 5432 already in use**: the dev database uses 5433 on purpose.
- **Login succeeds but returns to the login page**: the site is served over plain HTTP with `TEMPO_COOKIE_SECURE=true`.
- **"Can't reach the server" screen**: the backend is down or restarting; the page retries automatically.
- **Docker commands return `Internal Server Error`** (Docker Desktop): fully quit Docker Desktop and start it again.
