# QA checklist

Usage context: the Eidos team tracks time every workday, often with a timer running for hours,
from one or more browser tabs/devices. Admins manage members, clients and projects. Time records
are billing data and must never be lost. Run this list before each release.

Legend: `[x]` verified · `[ ]` pending · `[!]` found a bug, fixed and re-verified

## 1. Auth and sessions
- [x] Login with valid credentials lands on Timer
- [x] Wrong password / unknown email show the same error (no account enumeration)
- [x] Email is case-insensitive and trimmed at login
- [!] Logout returns to login page (was a blank page; fixed)
- [x] Log in → log out → log in again works (from Timer and Members)
- [x] Protected pages redirect to login when logged out (deep link /projects)
- [x] Session survives page reload
- [x] Expired sessions are deleted at login
- [x] Garbage session cookie → 401
- [x] Sliding session: use renews it (at most one write a day) and re-sends the cookie; expires after 90 idle days (unit, API, Postgres and live tests)
- [!] Session cookie rejected by the browser (HTTPS required) now shows an explanation instead of silently bouncing back to login
- [x] Deactivated user is kicked out and cannot log in
- [!] Admin password reset / deactivation ends that user's sessions (sessions survived; fixed)
- [x] Own password change: wrong current rejected (UI + API), new password works, old doesn't

## 2. Roles and permissions
- [x] Member sidebar has no Admin section
- [x] Member opening /members is redirected to Timer
- [x] Member sees Projects/Clients read-only (no New button, rows not editable)
- [x] API: member gets 403 on every user/client/project write and on user listing
- [x] API: member cannot read, edit or delete another user's time entries
- [x] Admin cannot demote or deactivate themselves (API and UI)
- [x] Promoting / demoting a member takes effect immediately

## 3. Timer
- [x] Start with button and with Enter in description
- [x] Project picker: search, Enter selects first match, grouped by client, "No project"
- [x] Billable `$` reflects the project
- [x] Elapsed time ticks, tab title shows it
- [x] Edit description / project while running persists (reload check)
- [x] Stop timer; stop with nothing running returns 409
- [x] Starting a new timer stops the running one
- [x] Continue from list view starts a new timer with same description/project
- [x] Archived project cannot be used for a new timer
- [x] Running timer survives page reload
- [x] Running timer survives backend restart, crash, DB restart, full down/up, restore
- [x] Entry across midnight split correctly across both days, day totals correct
- [!] Failed start (server unreachable) keeps the typed description (was wiped)

## 3b. Description suggestions
- [x] Clicking an empty description shows recent previous entries (description + project/client)
- [!] Opening an entry in the calendar auto-focused the description and popped the list open; the list now opens only on click, typing or ArrowDown
- [x] Typing filters by description, then project/client name; a "Projects" section lists matching projects
- [x] Entries older than a week still suggested (5-week-old entry found); only own entries; deleted entries and archived projects excluded
- [x] Picking a suggestion fills description and project; idle timer doesn't start until Enter/Start; running timer is updated
- [x] Works in the entry editor too; first Escape closes only the dropdown
- [!] After Escape, ArrowDown + Enter submitted the typed text instead of selecting (options now computed while closed)

## 4. Manual entries and editing
- [!] Drag on calendar creates entry with exact snapped times (fast drags lost the end; fixed)
- [x] Single click on calendar creates a 30-minute draft
- [x] Edit an entry: description, project, start, stop
- [x] Edit running entry: stop shows "Running", start editable
- [!] Validation: running entry starting in the future (was server-only and closed the form; client check added)
- [x] Validation: stop before start, manual entry without stop, naive datetimes (API)
- [x] Delete (API): entry disappears, soft-deleted, second delete 404
- [x] Delete from list with confirm dialog (UI); row kept in DB with deleted_at
- [x] Entries on archived projects stay visible and editable
- [!] Description max length (500): API returns a clear error; inputs now limit length

## 5. Calendar view
- [x] Zoom − / + changes hour height and snap, limits disabled at ends
- [x] Zoom keeps the same time at the top of the viewport (all levels)
- [x] 5 / 7 days view
- [x] Overlapping entries laid out side by side
- [x] Current time line on today
- [x] Day totals and week total update instantly, including running entry
- [!] Entry text top-aligned in blocks (was vertically centered; fixed)

## 6. List view
- [x] Grouped by day, newest first, day totals
- [x] Hover action: continue
- [x] Empty week message

## 7. Week navigation
- [x] Previous / next week, "This week", "Last week", date range labels, ISO week number
- [x] Clicking the week label returns to this week
- [x] Entry spanning the week boundary counted in both weeks correctly (Sun 2h / Mon 2h)

## 8. Preferences
- [x] View, days shown, zoom persist across reload and are per user
- [!] Rapid changes do not race (earlier changes were overwritten; fixed)

## 8b. Theme
- [!] Sun/moon toggle in the sidebar switches instantly between light and dark (color transitions briefly showed mixed colors; now paused during the switch)
- [x] Theme is saved per user (survives reload; admin dark and member light kept separately)
- [!] No light flash when loading in dark mode (theme was applied by the app bundle, possibly after first paint; now set by a blocking `theme-init.js`, allowed by the CSP)
- [x] Every page readable in dark: timer, calendar blocks and labels, list, project picker, projects, clients, members, profile, modals, toasts, login
- [x] Logo uses the brandbook dark treatment (sand on navy); login uses a navy→deep violet gradient
- [x] Native controls (date pickers, selects, scrollbars) follow the theme
- [!] Navy project swatch invisible on dark (outline added)
- [!] Single click in the lower half of a calendar slot created a 15-minute entry instead of 30 (click now detected by mouse movement)

## 9. Admin: clients and projects
- [x] Create client; duplicate name (any case) rejected; empty name rejected
- [x] Rename and archive client; Show archived toggle
- [x] Create project with client, color, billable; invalid color rejected; unknown client rejected
- [x] Edit project (archive); archived hidden from pickers
- [!] Color swatches fit on one row (12th wrapped; fixed)

## 10. Admin: members
- [x] Create member; duplicate email (any case) rejected; short password / invalid email rejected
- [x] Edit role, active; reset password
- [x] New member can log in immediately

## 11. Multiple users at the same time
- [x] Two users tracking simultaneously don't affect each other
- [x] Load test, 30 simulated users working concurrently (more than the team): no errors, median 58 ms, p95 ~100 ms, one running timer each
- [!] Same user concurrent stops / edit-vs-stop race (were not serialized; per-user row lock added, 20/20 races safe)
- [x] Same user concurrent starts: never two running timers
- [x] Same user in two tabs: starting in a stale tab stops the other tab's timer cleanly
- [!] Stale tab picks up changes made elsewhere (background sync every 30 s added; verified tab caught up)
- [x] Admin edits a project while 30 simulated members start timers on it

## 12. Durability (server down and up)
- [x] Backend restart: data, sessions and running timer intact
- [!] Backend recreated with a new IP (nginx kept the old IP → 502 outage; fixed with DNS re-resolution)
- [!] Graceful shutdown (backend was SIGKILLed after 10 s; now exits cleanly in 1 s)
- [x] Backend crash → container restarts automatically, data intact
- [x] Database restart: backend reconnects on its own, data intact
- [x] Full `docker compose down` + `up`: data intact, migrations idempotent
- [x] Containers come back after a Docker restart, data/session/running timer identical
- [!] UI while backend is down: said "Bad Gateway" and a reload sent users to login; now a plain message, rollback, an auto-retrying "can't reach the server" screen, and automatic recovery
- [!] Dev and prod compose projects collided on a dev machine (dev now named `eidos-tempo-dev`)

## 13. Backups and restore
- [x] Scheduled daily backup fires at BACKUP_TIME in configured TZ
- [x] Pre-deploy backup via `scripts/deploy.sh`
- [x] Retention deletes backups older than BACKUP_RETENTION_DAYS, keeps newer and unrelated files
- [x] `scripts/restore.sh` end to end: safety backup first, data restored with identical checksum
- [x] Backup size with a year of simulated data for 30 users (78k entries): 2.4 MB

## 14. Deployment
- [x] `scripts/deploy.sh` on a fresh host folder
- [x] `scripts/create-admin.sh` creates the first admin
- [x] SPA deep links served by nginx (/projects)
- [x] `TEMPO_COOKIE_SECURE=true` over plain HTTP: browser drops the cookie (verified), login page explains it

## 15. Security (public IP)
- [x] Every API route classified public/member/admin; anonymous and forged sessions get 401 on all non-public routes (automated, mutation-tested)
- [x] Members get 403 on every admin route (automated)
- [!] API docs and OpenAPI schema were public; now off in production (404)
- [!] Login timing revealed which emails exist (57 ms vs 5 ms); now constant (56 ms both)
- [!] No brute-force protection (100 guesses in 7 s); nginx now allows 5/min per IP, then 429 with a clear message
- [!] Dev database listened on all interfaces with a weak password; now bound to 127.0.0.1
- [x] Only the web port is published; database and backend unreachable from the network
- [!] Security headers added (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy), server version hidden; app verified working under the CSP
- [x] No CORS allowance for other origins; SameSite=Lax HttpOnly session cookie
- [ ] HTTPS in front of the app (required before exposing the public IP)

## 16. Data correctness and scale
- [x] Times stored in UTC, shown in browser local time
- [x] Week query 5–17 ms end to end with a year of simulated data for 30 users (index used)
- [x] Description with HTML/script is shown as text (no XSS)

## Known follow-ups (not bugs, not blocking v1)
- After login you always land on Timer, not the page you originally requested.
- A calendar block split at midnight shows the whole entry's duration, not the part on that day.
- Backups live on the same server as the database; copy them off-server when possible.
