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
- [x] Start/stop fields accept `10:10`, `10.10`, `10,10`, `10 10`, `1010`, `9:5`, `10.10pm`, `10:10 a.m.` (like Toggl); invalid text (`10-10`, `10:60`) shows "Enter valid start and stop times" on Save
- [x] Edit running entry: stop shows "Running", start editable
- [ ] Click the running timer: duration becomes editable; Start (Today/date), Stop disabled, calendar with future days off; Enter or a click outside saves (the click does nothing else), Escape cancels; future start shows an error; a failed save rolls back with a message
- [ ] Timer bar tooltips (project, tags, billable, duration, start/stop) appear after a short delay, fade in, hide on click
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
- [!] Enter on a focused entry opens its editor (the same keypress used to submit and close it; the editor now ignores an Enter, or a held Enter, that started before it opened; fixed)
- [!] Reopening an entry after it changed elsewhere shows its current times (the editor kept the old ones; fixed)
- [!] Enter on the hovered ▶ continues the entry without opening the editor (fixed)
- [!] Opening another entry with the keyboard while the editor is open shows that entry's data (kept the first entry's fields, so Save overwrote the wrong entry; fixed)

- [x] Project distribution bar under the week toolbar (like Toggl): one segment per project sized by its share, label in the project color plus client, biggest first; tooltip with time and %
- [x] Bar total equals the week total and grows with a running timer; readable in light and dark; hidden for a week without time
- [!] Font sizes measured against Toggl: running time (24→18 px, same as the description), week total (18→14), WEEK TOTAL label and weekdays (12→11), distribution labels (11→12) now match; the rest already did
- [x] Hovering an entry block lightens its tint (0.15 s), and the editor grows from the side facing the entry (0.15 s, content fades in), like Toggl; no animation with reduced motion
- [x] While the mouse button is held on an entry it lifts (stronger tint, light rim, shadow) and goes back on release, like Toggl
- [ ] Running entry editor shows a stop button top-left (like Toggl); pressing it stops the timer and closes the editor (shown, not pressed yet)
- [x] The running entry looks different from stopped ones (faint tint, diagonal stripes, border, open bottom), in light and dark

## 4b. Split entries (web, 2026-10-14)
- [x] Split from the calendar editor ⋮, List view ⋮, running timer bar ⋮ and Detailed row ⋮; the new entry is the earlier part, the original keeps its id, description, project, tags and billable are copied
- [x] Running timer: split keeps the later part running; the dialog's end label ticks
- [x] Dialog: default midpoint on a 5-minute step; drag and handles clamp to start+5 min and the last step; ArrowUp/Down, Home/End, Enter; Escape/Cancel don't split; labels never overlap; dark mode
- [x] Split disabled with "Too short to split" for entries of 5 minutes or less, in every menu
- [x] Failed split request rolls back with a toast (Timer page and Detailed)
- [x] Admin splits a member's entry from Detailed; both parts stay the member's
- [x] ⋮ menus: not clipped by cards or lists, open upward near the bottom, close on outside click/scroll/Escape (Escape inside the editor closes only the menu), red Delete last
- [!] ⋮ menus by keyboard: focus was lost on open and Tab couldn't reach the items; now the first item is focused, arrows move, Tab/Escape return to ⋮
- [x] Delete from the editor and timer bar menus (no confirm), List view and Detailed (confirm); deleting the running timer clears the bar

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

## 14b. Cloud Run (local simulation, docker-compose.cloudrun.yml, 2026-10-06)
- [x] Empty bucket prefix: initdb, first base backup, migrations, app serves
- [x] Save latency with archive-before-response: ~70 ms against the emulator
- [x] Crash during a save loop (kill all containers, wipe in-memory volumes): 676 confirmed saves, 0 lost, ~28 s down
- [x] Second instance started during saves: takes the lease, old instance returns 503 and stops; 132 confirmed, 0 lost,
      1 save answered 503 but kept (the known duplicate-on-retry case)
- [x] Two instances started at once: the one that lost the lease exits before restoring; one serves
- [x] WAL uploads failing (wal-push replaced by a failing script; 2026-10-09): 40 s outage → save answered 200 after
      62 s (Postgres retries a failed archive after up to 60 s); 100 s outage → 503 at 90 s, change kept; reads
      unaffected. Emulator paused instead: the lease check before commit waits for Cloud Storage, nothing committed
- [x] Lease taken while idle (lease object overwritten; 2026-10-09): backend logs the loss and stops 15 s later
      (checked every 30 s); Cloud Storage paused 70 s: no false stop
- [x] On Cloud Run, same drill (2026-10-09, revision tempo-00007-8fp): loss logged 14 s after the takeover, backend
      exit(0) 18 s later, Cloud Run started a new instance 4 s after that, which took the lease and served
- [x] Nightly backup (`app.cli backup`): base backup + dump uploaded; dump restored with `pg_restore`, same row count
- [x] Seed mode on linux/amd64 (emulated): migrations, ensure-admin (create, then promote), base backup
- [ ] On Cloud Run: same drills (deploy during saves, restore), IAM conditions allow WAL-G and deny deletes
- [ ] On Cloud Run: login rate limit sees the real client IP (X-Forwarded-For)

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

## 17. Tags, billable per entry and Toggl import
- [x] Create a tag from the editor's tag picker (Enter on a new name); it is selected right away
- [x] Tags page (Manage → Tags): list sorted A→Z with numbers in order (sprint2 before Sprint19), search, show archived
- [x] Anyone can create a tag there; a duplicate name in any case ("DEV") shows "A tag named 'DEV' already exists"
- [x] Admins rename and archive a tag; archived tags leave the list and come back with "Show archived"
- [x] Members (tested as `member@eidos.local`) see the Tags page and can create tags, but rows don't open; a direct PUT returns 403
- [x] Billable `$` toggles per entry; changing the project resets it to the project's default
- [x] Calendar drag/resize and continue keep the entry's tags and billable
- [x] Saving an entry without `tag_ids`/`is_billable` is rejected (422), so old clients can't wipe tags
- [!] Project and tag pickers opened off-screen near the bottom of the window; they now open upward
- [!] Toggl's detailed report stopped paging after ~100 entries per period (first dry run had half the hours); fixed, and the import now verifies yearly totals against Toggl's summary
- [x] Toggl import into an empty database: 12,837 entries, hours per year identical to Toggl (2022–2026)
- [x] Re-running the import changes nothing (all unchanged)
- [!] Back-to-back Toggl entries overlapping by seconds (e.g. stop 15:36:36, next start 15:36:00) were drawn side by side; overlaps under a minute now stack in one column like Toggl (times are kept exact)
- [!] Gaps between back-to-back entries varied by a pixel or two because blocks were drawn to the second; blocks are now drawn to the minute like Toggl (stored times, durations and resize handles unchanged)
- [x] Active Toggl members are active; former members are imported deactivated; `--admin` people are admins

## 17b. Instant timer (web)
- [x] With saves slowed to 1.5 s: ▶ continue shows description, project, tag and billable at once; the timer never jumps back
- [x] Typed description/project/tag/billable before Start and suggestions picked while running don't change when the save finishes
- [x] Start and stop are saved at the click time (a request queued behind slow saves keeps it; clocks off by more than a minute fall back to server time)

## 18. Chrome extension
- [x] Uses the browser's Tempo login with no extra setup (verified loading unpacked)
- [ ] Default address is production (`https://tempo.eidos.ai`), no permission prompt; "Use default" restores it
- [x] Logged out: popup explains it and links to the web app; icon shows a red `!`
- [x] Toolbar icon is a simplified three-ring logo, crisp at 16 and 32 px; purple while a timer runs, gray when idle (no time on the icon)
- [x] Suggestions while typing; ArrowDown + Enter picks one (description + project), Enter starts
- [x] Running entry: description and project edits are saved; billable $ follows the project
- [x] Project picker: search, grouped by client, "No project"
- [x] Stop with the server unreachable: "Stopping the timer was not saved…", timer keeps running, icon shows `!`
- [x] Stop, then the entry appears under Today with the day total; ▶ continue starts it again
- [x] Follows the user's light/dark theme; logo readable in both
- [x] Layout follows Toggl's popup (450×600): "Eidos Tempo" header with open, refresh and settings; description, timer and stop on one row; Today and Week totals; flat day sections; same tokens and fonts as the web app
- [x] Long running descriptions fit (16 px) and end in "…" when too long
- [x] Timer tags: search, toggle, create a new tag with Enter; chips shown next to the project; a failed create keeps the typed name
- [x] Timer billable $ is a toggle; choosing a project resets it to the project's default
- [ ] Billable $ when off uses the same grey and purple hover as the folder and tag icons (readable in dark mode)
- [x] Entries on one day with the same description, project, billable and tags are grouped with a count badge; clicking the group opens and closes a drawer with each entry's times; ▶ continues the latest
- [x] Past entries: clicking one (or one in a drawer) opens the edit overlay inside the popup: description with suggestions, project, tags, billable, duration; the "Duration" field (the only way to edit times) opens start/stop/date (changing duration moves stop, picking a day keeps times and duration, stop before start crosses midnight); Save or Enter saves, Cancel, × or Escape discards; Escape in a menu closes only the menu; an edited entry leaves its group
- [x] Failed save from the edit overlay (server unreachable): the list shows the server's version, the overlay reopens with every typed field and selection and "Your changes were not saved…"; Save again succeeds once reconnected
- [x] Escape order in the edit overlay: menu (focus returns to its button) → time popover → overlay; Escape after ticking a tag checkbox or after picking a project still only closes one level; none reaches Chrome (which would close the popup)
- [x] Picking a project with Enter closes the menu and doesn't reopen it (timer and overlay)
- [x] The whole entry row is clickable (text, duration, empty space) with a pointer cursor and no text selection; ▶ only continues; Tab focus highlights the whole row and Enter/Space opens it
- [x] Only the duration field opens the time popover; the "Duration" label and the empty space next to it don't
- [x] Time errors ("Enter a valid…", "Stop must be after start") show inside the popover while it is open; the duration keeps its last valid value instead of 0:00:00
- [x] Running timer editor: Escape closes it even when focus is outside its fields (e.g. after clicking the month); a future start keeps the last valid duration
- [x] Running timer: clicking the time opens the start editor like the web (duration, start time, date; future starts rejected); Enter or click outside saves; an edited start is kept when the start request was still pending
- [x] Failed edit on a past entry: "Updating the entry was not saved…", the typed value stays; requests are sent in order so quick edits don't overwrite each other
- [x] Dropdowns near the bottom of the list scroll into view
- [!] Tag menu opened from chips on the right overflowed the 450 px popup and shifted the whole window sideways; menus now shift left to stay inside
- [x] With saves slowed to 1.5 s: start, stop, ▶ continue, typed description/project/tag/billable and picked suggestions show at once; nothing changes when the save finishes; buttons are never disabled
- [x] Stop with the server fully unreachable: the popup goes back to running, shows "Stopping the timer was not saved…", icon ends on `!`
- [x] Popup served by the server in an iframe: logged in through the frame, entry created from the popup shows on the web (Cloud Run simulation)
- [x] Only the extension can frame `/extension-popup.html`; a web page framing it or `/` is refused (Cloud Run simulation)
- [x] Header says "Eidos Tempo" (no wordmark, too small to be sharp)
- [ ] Server down when opening the popup: spinner, then "Can't reach Eidos Tempo" with Try again and Settings after 10 s, icon shows `!`

## 19. Reports
- [x] Summary for September matches Toggl: everyone 652:43:46 total, 282:33:31 billable (43.29%), 29.67 h daily average; one member 121:26:45, 4:54:49 (4.05%), 5.52
- [x] Summary: totals card, duration chart with Stack by (billable, members, clients, projects), donut with Slice by (adds descriptions, "Other (n)"), breakdown with "Breakdown by" / "and", sort, expand/collapse
- [x] Date control: presets, "All shortcuts" with search, two-month range picking, ‹ › shifting by week or month
- [x] Filters: member is / is not (admins only, Show Active/All), client and project (is, is not, is empty, is not empty), tag, billable (Add filter), description contains; chip edit, ×, clear all, Escape discards an unapplied chip; filters live in the URL
- [x] Detailed: inline description and duration (invalid duration rejected), $ toggle, project picker (sets billable from the project), tag picker (several toggles saved once on close)
- [x] Detailed time/date popover: start, stop, calendar date (keeps times and duration), stop before start crosses midnight, Enter and click outside save, Escape cancels
- [x] Row menu: Duplicate (own entries only), Set as (non-)billable, Go to project, Delete
- [x] Header sort on every column, both directions; select all, "N items selected", clear selection
- [x] Bulk edit: description (prefilled for one, "Multiple descriptions" for several), project, add tags, remove existing tags, date, Billable Unchanged / Billable / Non-billable; Save disabled until something changes; bulk delete
- [x] "Load more" past 100 rows; title "Time entries from <preset>"
- [!] Several quick edits on one row: later requests stayed paused in a hidden tab (TanStack `scope`) and a second edit could overwrite the first with stale values; fixed (`inOrder` queue, row builds on its latest input)
- [!] Bulk edit Project / Add tags fields only opened when clicking the text; the whole field is now the trigger
- [x] Server unreachable on save or delete: toast "Your change was not saved", row rolls back; failed PDF export shows "The PDF could not be exported: …"
- [x] Export PDF (Summary and Detailed) downloads `Tempo_<Summary|Detailed>_report_<from>_to_<to>.pdf`, title includes the preset ("Summary report (Last month)"), filters applied
- [x] PDFs list the applied filters as chips under the dates, like Toggl ("Member is Cristian", "Project is eidos"); members never get a Member chip; custom ranges are titled "(from MM/DD/YYYY to MM/DD/YYYY)"; zero billable shows "-"; Detailed PDF has its own $ column and the title "Time entries from <preset>"
- [x] Detailed PDF for September (Cristian) matches Toggl's export entry by entry: 53 entries, same date, time, duration, description, member, project, tags and billable marks; empty descriptions print "-", projects show a colored dot with the client on a second line
- [x] Duration chart follows Toggl's layouts: a week has wide bars and horizontal labels, a month has thin bars, −45° day labels and vertical values (web and PDF)
- [x] Members: no Member filter; a member filter in the URL still returns only their entries; PDFs name only them; inline, bulk edit and delete on their own entries; PUT/DELETE on others' entries return 404; no 403s in the console
- [x] Admins edit members' entries from Detailed; the member sees the change with tags kept
- [x] Light and dark themes

## 20. API tokens and Toggl-compatible API
- [x] Profile: generate shows the token once with Copy; regenerate replaces it; revoke removes it (UI)
- [x] Old token stops working after regenerate/revoke; password reset and deactivation revoke it
- [x] `/api/toggl/*` rejects no token, a forged token and a session cookie (401); other routes ignore tokens
- [x] Marcelo's `TogglAPI` (`details`, `list_projects`, `summary`) run unchanged against Tempo and Toggl for Sep 1–15:
      same 85 entries, every field equal, same order, same totals
- [x] Invoice PDF recipe (`project_ids`, `billable=yes`, users/time_entries, date ascending) returns both PDFs
- [x] Mongo sync code (`toggl_app.py`) works in both modes (since date, since last id)
- [x] Partial PUT: stretch by `duration`, change/remove project, add tags; unknown id 404; members can't edit others'
- [x] Days follow America/Montevideo (an entry at 23:30 local belongs to that day, not the next UTC day)

## Known follow-ups (not bugs, not blocking v1)
- After login you always land on Timer, not the page you originally requested.
- A calendar block split at midnight shows the whole entry's duration, not the part on that day.
- Backups live on the same server as the database; copy them off-server when possible.
- Reports: no CSV/XLSX export, Amount column, rounding or saved reports (Toggl has them; not used by the team so far).
