# CLAUDE.md

Guide for agents working in this repository. Read README.md for setup, configuration and deployment.

## What this is

Eidos Tempo is Eidos' internal replacement for Toggl: the team tracks time daily, admins manage
members, clients and billable projects. Time entries are billing records, so **never lose data**.
Planned next: reports/metrics API, personal API tokens, a Chrome extension using the same API.

## Commands

```bash
docker compose -f docker-compose.dev.yml up -d                      # dev Postgres on :5433
cd backend && uv run uvicorn app.main:create_app --factory --reload # API on :8000, docs at /api/docs
cd frontend && npm run dev                                          # UI on :5173, proxies /api
cd backend && uv run python -m scripts.seed_dev                     # dev users + sample data (idempotent)
```

Before finishing any change, all of these must pass:

```bash
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app scripts
cd frontend && npm run lint && npm run build
```

## Backend architecture (`backend/app`)

Dependencies point inward only: `api → services → repositories (protocols) → domain`.

- `domain/`: `@dataclass` entities and value objects (`EmailAddress`, `HexColor`, `DateRange`),
  `NewType` ids (`UserId`, `ProjectId`, ...), `StrEnum`/`IntEnum`, domain errors. No framework imports.
- `services/`: all business rules and permission checks (`require_admin`). Services receive
  repositories, a `Clock` and other collaborators through the constructor. Inputs are frozen
  dataclasses (`ProjectDraft`, `TimeEntryDraft`, ...). Updates are full replacements, not partial patches.
- `repositories/protocols.py`: `Protocol` interfaces plus the `Repositories` bundle.
  `repositories/sql/`: SQLAlchemy implementations that map ORM rows ↔ domain dataclasses (`to_x`/`apply_x`).
  This is the only place that touches SQLAlchemy.
- `api/`: thin FastAPI routes. Pydantic schemas live in `api/schemas/` with `from_domain` / `to_draft`.
  `api/deps.py` wires services per request; `get_repositories` opens one DB transaction per request and
  commits at the end. `api/errors.py` maps domain errors to HTTP (NotFound 404, PermissionDenied 403,
  Authentication 401, Conflict 409, InvalidValue 422, IntegrityError 409).
- `db/models.py`: ORM tables. `alembic/versions/`: migrations.

### Adding a backend feature

1. Domain dataclass / value objects in `domain/`.
2. Repository method in `protocols.py`, SQL implementation in `repositories/sql/`, fake in `tests/fakes.py`.
3. Service method with the rules and permission checks, plus unit tests using the in-memory fakes.
4. Pydantic schemas + route in `api/`, dependency in `api/deps.py`, router in `main.py`.
5. ORM change in `db/models.py` → `uv run alembic revision --autogenerate -m "..."` → review the file.
6. API test in `tests/test_api.py`; Postgres test in `tests/test_sql_repositories.py` if SQL behavior matters.

## Frontend architecture (`frontend/src`)

- `api/`: `client.ts` (fetch wrapper, `ApiError`, unreachable-server handling), `endpoints.ts`,
  `types.ts` (mirror the Pydantic schemas by hand), `queryKeys.ts`.
- `features/<name>/`: page components plus hooks (`useX.ts`) wrapping TanStack Query.
- Time-entry mutations go through `useEntryMutation` in `features/time-entries/useTimeEntries.ts`:
  optimistic cache update → rollback + toast on error → invalidate on settle. Keep new entry actions on this path.
- The current user comes from `useCurrentUser()` (context provided by `RequireAuth`); never read the
  session query directly in pages.
- Styling: Tailwind v4 with Eidos brand tokens in `index.css` (`--color-primary`, `--color-ink`, ...).
  Fonts: DM Sans (`font-display`) for headings and the timer, Inter for UI text. Light theme only.
- TypeScript uses `erasableSyntaxOnly`: use string/number union types, not TS `enum`.

## Code standards

- Type hints on every function; `mypy --strict` must pass.
- Structured data uses dataclasses (domain) or Pydantic models (API edge). Avoid raw `dict[str, ...]`
  or `Any` for structured data.
- KISS, self-explanatory names, no comments unless something is truly non-obvious.
- Raise specific domain errors with a meaningful message; don't catch what you can't handle.
- Use `logging` (never `print`) with context in messages.
- Match the style of the surrounding code; one feature per folder/module.

## Data safety rules (do not break)

- Time entries are soft-deleted (`deleted_at`); never hard-delete rows.
- Foreign keys use `RESTRICT`; archive projects, clients and users instead of deleting them.
- One running timer per user is enforced by a partial unique index **and** a per-user row lock
  (`lock_user_entries`) taken at the start of every timer mutation. Keep both.
- All times are timezone-aware and stored in UTC; the browser converts to local time.
- Migrations are additive. Removing or renaming a column takes two releases and a backup.
- Password resets and deactivation must revoke the user's sessions.
- Never commit `.env` files; secrets go only in `.env`.

## Deployment facts

- `docker-compose.yml` (prod) and `docker-compose.dev.yml` (dev, project `eidos-tempo-dev`) must keep
  different project names so a deploy can't replace the dev database.
- nginx re-resolves `backend` via Docker DNS (`resolver 127.0.0.11`). Keep this, or a recreated
  backend container causes 502s.
- The backend container `exec`s uvicorn after `alembic upgrade head` so it shuts down gracefully.
- Backups: `scripts/backup.sh`, `scripts/backup-loop.sh`, `scripts/restore.sh`, `scripts/deploy.sh`.

## Testing and QA

- Unit tests use in-memory fakes (`tests/fakes.py`) and `FakeClock`; test through services.
- Before a release, go through [docs/qa-checklist.md](docs/qa-checklist.md) and update it.
- When verifying UI changes, run the app and exercise the flow in a browser, including the failure path.
