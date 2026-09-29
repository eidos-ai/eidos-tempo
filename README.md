# Eidos Tempo

Internal time tracker for Eidos (Toggl-style). FastAPI + PostgreSQL backend, React frontend.

## Architecture

```
frontend (React, TS, Vite, TanStack Query, Tailwind)
   │  /api (JSON, cookie session)
backend/app
   api/           HTTP layer: routes, Pydantic schemas, dependencies, error mapping
   services/      Business rules (timer, projects, clients, users, auth)
   domain/        Dataclasses and value objects, no framework imports
   repositories/  Protocols + SQLAlchemy implementations
   db/            ORM tables and session factory (Alembic migrations in backend/alembic)
```

Adding a feature: domain dataclass → repository protocol + SQL implementation → service → API route → Alembic migration → frontend feature folder.

Rules that protect data:
- Time entries are soft-deleted (`deleted_at`); rows are never removed.
- Foreign keys use `RESTRICT`, so projects, clients and users with time entries can't be deleted.
- A partial unique index guarantees one running timer per user.
- Migrations must be additive. Never drop a column or table that holds data without a backup.

## Local development

```bash
docker compose -f docker-compose.dev.yml up -d      # Postgres on localhost:5433

cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run python -m scripts.seed_dev                   # dev admin + sample data (see scripts/seed_dev.py)
uv run uvicorn app.main:create_app --factory --reload

cd frontend
npm install
npm run dev                                         # http://localhost:5173
```

Checks:

```bash
cd backend && uv run pytest && uv run ruff check . && uv run mypy app
cd frontend && npm run lint && npm run build
```

`TEMPO_TEST_DATABASE_URL` in `backend/.env` enables the Postgres integration tests.

## Server deployment

```bash
cp .env.example .env                 # set a strong POSTGRES_PASSWORD, TEMPO_DATA_DIR, TZ
scripts/deploy.sh                    # pre-deploy backup (if running) + build + start; migrations run on startup
scripts/create-admin.sh you@eidos.ai "Your Name"
```

- Data: `${TEMPO_DATA_DIR}/pgdata` (a host folder, so it survives container rebuilds).
- Backups: `${TEMPO_DATA_DIR}/backups`, daily at `BACKUP_TIME`, kept `BACKUP_RETENTION_DAYS` days.
- Restore: `scripts/restore.sh <file>` (takes a safety backup first).
- `TEMPO_COOKIE_SECURE=true` requires HTTPS in front of the app. Set it to `false` only for plain-HTTP internal access.
- Never run `docker compose down -v`, and never upgrade the Postgres major version by just changing the image tag.
