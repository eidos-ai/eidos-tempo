# CLAUDE.md

Guide for agents working in this repository. Read README.md for setup, configuration and deployment.

## What this is

Eidos Tempo is Eidos' internal replacement for Toggl: the team tracks time daily, admins manage
members, clients and billable projects. Time entries are billing records, so **never lose data**.
Production: Google Cloud Run with the database inside the service (`infra/`, `db/`, `app/durability/`; see "Deployment facts"). Not set up yet:
CI/CD (`scripts/cloudrun-deploy.sh` builds and deploys from a developer machine; the `deploy` skill in
`.claude/skills/deploy/` guides it, and `scripts/deploy-status.sh` compares production with the local checkout).

## Commands

```bash
docker compose -f docker-compose.dev.yml up -d                      # dev Postgres on :5433
cd backend && uv run uvicorn app.main:create_app --factory --reload # API on :8000, docs at /api/docs
cd frontend && npm run dev                                          # UI on :5173, proxies /api
cd backend && uv run python -m scripts.seed_dev                     # dev users + sample data (idempotent)
cd extension && npm run build                                       # Chrome extension into extension/dist
```

Before finishing any change, all of these must pass:

```bash
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy app scripts tests
cd frontend && npm run lint && npm run build
cd extension && npm run lint && npm run build   # when the extension changed
```

There is no CI, so nothing else runs these for you.

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

### Reports

`GET /api/reports/summary|entries|summary.pdf|detailed.pdf` (`services/reports.py`, `domain/reports.py`) mirror
Toggl's Summary and Detailed reports: filter by member, client, project, tag, billable and description; running
and deleted entries are left out; days are grouped in the browser's timezone. PDFs are drawn with reportlab in
`app/exports/report_pdf.py`. The frontend keeps report filters in the URL (`features/reports/reportFilters.ts`).

### API tokens and the Toggl-compatible API

Personal API tokens (`services/api_tokens.py`, hashed in `api_tokens`, one per user, managed on the Profile page)
authenticate only the `/api/toggl/*` routes (`ApiUser` in `api/deps.py`: HTTP Basic `<token>:api_token`); every other
route needs the session cookie. `/api/toggl/*` (`services/toggl_compat.py`, `api/schemas/toggl.py`) copies Toggl's v9 and
Reports v2 shapes so Eidos scripts written for Toggl keep working: integer ids from `numeric_ids` (Toggl ids kept from the
import, new ids from 10,000,000,000), `dur` in ms, days in `TEMPO_API_TIMEZONE`, details oldest first in pages of 50, partial
`PUT`s merged onto the entry before the normal full-replacement update. Verified against the real Toggl API; when changing
these shapes, compare with Toggl again.

## Frontend architecture (`frontend/src`)

- `api/`: `client.ts` (fetch wrapper, `ApiError`, unreachable-server handling), `endpoints.ts`,
  `types.ts` (mirror the Pydantic schemas by hand), `queryKeys.ts`.
- `features/<name>/`: page components plus hooks (`useX.ts`) wrapping TanStack Query.
- Time-entry mutations go through `useEntryMutation` in `features/time-entries/useTimeEntries.ts`:
  optimistic cache update → rollback + toast on error → invalidate on settle. Keep new entry actions on this path.
  Changing many entries at once uses one mutation (`useUpdateEntries`/`useDeleteEntries`).
  Entry requests are sent in order by `inOrder`, not a TanStack `scope`: queued scoped mutations stay paused
  while the tab is hidden, so changes were lost. Saves are full replacements, so quick edits on one row must
  build on the row's latest input, not on the possibly stale `entry` prop (see `EntryRow` in `DetailedTable.tsx`).
  Timer start/stop send the click time (`start`/`stop`); the server keeps it if it is under a minute old, so a
  request queued behind slow saves doesn't move the entry and the timer never jumps back.
- The current user comes from `useCurrentUser()` (context provided by `RequireAuth`); never read the
  session query directly in pages.
- Styling: Tailwind v4 with Eidos brand tokens in `index.css` (`--color-primary`, `--color-ink`, ...).
  Fonts: DM Sans (`font-display`) for headings and the timer, Inter for UI text.
- Themes: light and dark, stored per user in `preferences.theme` and applied as `data-theme` on `<html>`
  (`lib/theme.ts`; cached in localStorage only to avoid a flash on load). Dark values override the same
  tokens under `:root[data-theme="dark"]`. Always use tokens (`bg-surface`, `text-ink`, `text-accent`,
  `bg-inverse`, `bg-overlay`), never raw colors or `text-white`/`bg-ink` for surfaces. Project colors go
  through `projectTextColor` / `projectTint` so they stay readable in both themes. Use the `dark:` variant
  only for one-off cases (e.g. the login gradient). The logo is `<Logo>` (a mask colored by `--color-logo`).
- TypeScript uses `erasableSyntaxOnly`: use string/number union types, not TS `enum`.

## Code standards

- Type hints on every function; `mypy --strict` must pass.
- Structured data uses dataclasses (domain) or Pydantic models (API edge). Avoid raw `dict[str, ...]`
  or `Any` for structured data.
- KISS, self-explanatory names, no comments unless something is truly non-obvious.
- Raise specific domain errors with a meaningful message; don't catch what you can't handle.
- Use `logging` (never `print`) with context in messages.
- Match the style of the surrounding code; one feature per folder/module.

## Chrome extension (`extension/`)

- Manifest V3, React + Tailwind built with Vite into `extension/dist` (load it unpacked in Chrome).
- No separate login: it calls the same API with the browser's `tempo_session` cookie (host permission
  for the Tempo address). Logged out → the popup links to the web app.
- The server address is a setting (`src/config.ts`, options page); the default is production's `run.app` address,
  which is also in the manifest's `host_permissions` so no permission prompt appears. Only `https://` or `http://localhost`
  are accepted, so moving to HTTPS is a settings change.
- `src/api.ts` mirrors the API types by hand, like the frontend. Actions are optimistic (`act` in `popup/useTempo.ts`:
  shown at once, sent in order, refreshed once the queue is empty). Failed actions show "… was not saved", roll back
  in the popup and keep the user's input; the toolbar icon (a simplified three-ring version of the logo, drawn as vectors in `src/badge.ts` so it stays crisp at 16 px) is purple while a timer runs, gray otherwise, and shows a red `!` when not connected.
- Agents can't open `chrome-extension://` or `chrome://` pages; to test the popup, copy `dist` under
  `frontend/public/` temporarily and stub `chrome.storage`/`chrome.action` (remove the copy afterwards).

## Data safety rules (do not break)

- Time entries are soft-deleted (`deleted_at`); never hard-delete rows.
- Saving an entry requires `tag_ids` and `is_billable` (full replacement); every client must send the
  entry's current values so an update never wipes tags. Starting a timer may omit them.
- Foreign keys use `RESTRICT`; archive projects, clients and users instead of deleting them.
- One running timer per user is enforced by a partial unique index **and** a per-user row lock
  (`lock_user_entries`) taken at the start of every timer mutation. Keep both.
- All times are timezone-aware and stored in UTC; the browser converts to local time.
- Migrations are additive. Removing or renaming a column takes two releases and a backup.
- `RepositoriesDep` uses `scope="function"` so the transaction commits before the response is sent;
  keep it, or a failed commit returns 200 and the change is silently lost.
- Sessions slide: `AuthService.authenticate` extends them (at most once a day) and `get_current_user`
  re-sends the cookie. Password resets and deactivation must revoke the user's sessions and API token.
- Never commit `.env` files; secrets go only in `.env`.

## Security rules (the server has a public IP)

- Every new route must be added to exactly one of `PUBLIC_ROUTES`, `MEMBER_ROUTES`, `ADMIN_ROUTES` or
  `API_TOKEN_ROUTES` in `tests/test_endpoint_protection.py`; the test fails otherwise. Public routes need a strong reason.
- Protected routes take `CurrentUser`; admin rules are enforced in services with `require_admin`.
- Members may only see and touch their own time entries; return 404 (not 403) for other users' entries.
  Admins may edit and delete anyone's entries (Detailed report); `TimeEntryService` logs each change made on
  someone else's behalf, and `ReportService.visible_to` limits members' reports to their own entries.
- Keep login constant-time (`verify_dummy` for unknown emails) and keep the nginx login rate limit.
- API docs stay off in production (`TEMPO_ENABLE_API_DOCS=false`).
- Don't add CORS, don't publish the database or backend ports, don't weaken the CSP in `frontend/nginx.conf`.

## Deployment facts

Cloud Run (production; `db/`, `infra/`, `app/durability/`, `docker-compose.cloudrun.yml` simulates it locally):
- The disk is in memory: the `db` container takes the GCS lease (`lease/owner`), waits a grace period, restores
  the latest WAL-G backup and replays WAL. Restores end on a new timeline, so an old instance's late WAL never mixes in.
- `get_repositories` commits through `Durability.committer`. On Cloud Run (`TEMPO_DURABLE_WRITES`) a transaction that
  wrote checks the lease, commits, switches the WAL segment (1 MB segments) and waits until it is archived, then
  checks the lease again. Never respond "saved" before that; never write to the database outside this path while
  serving. Lease lost → 503 and the process stops; archive timeout → 503.
- The runtime service account can create and read under `backups/` but not delete or overwrite (only WAL-G's
  temporary `_chunks/` objects), and owns `lease/`. Keep it that way; ask before changing how data is stored or deleted.
- `/api/internal/backup` (scheduler, OIDC) pushes a base backup and uploads a `pg_dump` to `backups/<prefix>/dumps/`.
- nginx: `frontend/nginx/app.conf` is shared; `cloudrun.conf` (port 8080, backend on 127.0.0.1, client IP = last
  X-Forwarded-For entry) and `compose.conf` (Docker DNS) only set the server. Build with `NGINX_SITE`.
- Images must be built for linux/amd64 (`scripts/cloudrun-deploy.sh` does). Seed and restore scripts also use
  amd64 so physical backups match Cloud Run's architecture.

Docker Compose (previous server setup):

- `docker-compose.yml` (prod) and `docker-compose.dev.yml` (dev, project `eidos-tempo-dev`) must keep
  different project names so a deploy can't replace the dev database.
- nginx (`frontend/nginx/compose.conf`) re-resolves `backend` via Docker DNS (`resolver 127.0.0.11`). Keep this, or a recreated
  backend container causes 502s.
- The backend container `exec`s uvicorn after `alembic upgrade head` so it shuts down gracefully.
- Backups: `scripts/backup.sh`, `scripts/backup-loop.sh`, `scripts/restore.sh`, `scripts/deploy.sh`.
- Toggl import: `backend/scripts/import_toggl.py` (logic in `app/importers/`, writes through the services;
  `import_links` maps Toggl ids so re-runs update instead of duplicating). Toggl's report cursor stops after
  ~100 entries, so the client fetches one big page per month and checks totals against Toggl's summary.

## Testing and QA

- Unit tests use in-memory fakes (`tests/fakes.py`) and `FakeClock`; test through services.
- Before a release, go through [docs/qa-checklist.md](docs/qa-checklist.md) and update it.
- When verifying UI changes, run the app and exercise the flow in a browser, including the failure path.
- To check the member view, run `uv run python -m scripts.seed_dev`: on a database with data it only adds the
  test member `member@eidos.local` (password in `scripts/seed_dev.py`). Log in as them at `http://127.0.0.1:5173`,
  a separate cookie jar, so the admin's session on `localhost:5173` is not replaced.
