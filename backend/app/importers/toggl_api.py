import base64
import json
import logging
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

from pydantic import BaseModel, TypeAdapter

logger = logging.getLogger(__name__)

API_URL = "https://api.track.toggl.com"
REQUEST_PAUSE_SECONDS = 1.1
MAX_ATTEMPTS = 6
RETRY_BASE_SECONDS = 5
REPORT_PAGE_SIZE = 1000
SECONDS_PER_HOUR = 3600
TOTALS_TOLERANCE_HOURS = 1.0
TOTALS_TOLERANCE_RATIO = 0.001
PROJECTS_PAGE_SIZE = 200
RETRYABLE_STATUSES = {429, 500, 502, 503, 504}


class TogglUser(BaseModel):
    uid: int
    email: str
    name: str
    inactive: bool


class TogglClient(BaseModel):
    id: int
    name: str
    archived: bool = False


class TogglProject(BaseModel):
    id: int
    name: str
    client_id: int | None = None
    active: bool = True
    billable: bool | None = None
    color: str


class TogglTag(BaseModel):
    id: int
    name: str


class TogglTimeEntry(BaseModel):
    id: int
    user_id: int
    description: str
    project_id: int | None
    billable: bool
    tag_ids: list[int]
    start: datetime
    stop: datetime | None


class TogglSnapshot(BaseModel):
    users: list[TogglUser]
    clients: list[TogglClient]
    projects: list[TogglProject]
    tags: list[TogglTag]
    time_entries: list[TogglTimeEntry]


class _ReportTime(BaseModel):
    id: int
    start: datetime
    stop: datetime | None


class _ReportRow(BaseModel):
    user_id: int
    project_id: int | None
    billable: bool
    description: str | None
    tag_ids: list[int] | None
    time_entries: list[_ReportTime]


class _SummarySubGroup(BaseModel):
    seconds: int


class _SummaryGroup(BaseModel):
    sub_groups: list[_SummarySubGroup]


class _Summary(BaseModel):
    groups: list[_SummaryGroup]


class _Page(BaseModel):
    body: bytes
    next_id: int | None


class TogglApiError(Exception):
    pass


class TogglApi:
    def __init__(self, api_token: str, workspace_id: int) -> None:
        credentials = base64.b64encode(f"{api_token}:api_token".encode()).decode()
        self._headers = {
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
        }
        self._workspace_id = workspace_id
        self._reports = f"/reports/api/v3/workspace/{workspace_id}"
        self._last_request = 0.0

    def fetch_snapshot(self, since: date, until: date) -> TogglSnapshot:
        workspace = f"/api/v9/workspaces/{self._workspace_id}"
        users = TypeAdapter(list[TogglUser]).validate_json(
            self._get(f"{workspace}/workspace_users")
        )
        clients = TypeAdapter(list[TogglClient]).validate_json(
            self._get(f"{workspace}/clients?status=both")
        )
        tags: list[TogglTag] = (
            TypeAdapter(list[TogglTag] | None).validate_json(self._get(f"{workspace}/tags")) or []
        )
        logger.info("Fetched %d users, %d clients and %d tags", len(users), len(clients), len(tags))
        projects = self._fetch_projects(workspace)
        time_entries = self._fetch_time_entries(since, until)
        self._verify_totals(time_entries, since, until)
        return TogglSnapshot(
            users=users, clients=clients, projects=projects, tags=tags, time_entries=time_entries
        )

    def _fetch_projects(self, workspace: str) -> list[TogglProject]:
        projects: list[TogglProject] = []
        page = 1
        while True:
            batch = TypeAdapter(list[TogglProject]).validate_json(
                self._get(
                    f"{workspace}/projects?active=both&per_page={PROJECTS_PAGE_SIZE}&page={page}"
                )
            )
            projects.extend(batch)
            if len(batch) < PROJECTS_PAGE_SIZE:
                logger.info("Fetched %d projects", len(projects))
                return projects
            page += 1

    def _fetch_time_entries(self, since: date, until: date) -> list[TogglTimeEntry]:
        entries: list[TogglTimeEntry] = []
        month_start = since.replace(day=1)
        while month_start <= until:
            next_month = date(
                month_start.year + month_start.month // 12, month_start.month % 12 + 1, 1
            )
            month_end = min(next_month - timedelta(days=1), until)
            entries.extend(self._fetch_period(max(month_start, since), month_end))
            logger.info("Fetched time entries up to %s (%d so far)", month_end, len(entries))
            month_start = next_month
        return entries

    def _fetch_period(self, start: date, end: date) -> list[TogglTimeEntry]:
        body = {
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "page_size": REPORT_PAGE_SIZE,
            "grouped": False,
        }
        page = self._request(
            "POST", f"{self._reports}/search/time_entries", json.dumps(body).encode()
        )
        if page.next_id is not None:
            if start == end:
                raise TogglApiError(f"More than {REPORT_PAGE_SIZE} time entries on {start}")
            middle = start + (end - start) // 2
            return self._fetch_period(start, middle) + self._fetch_period(
                middle + timedelta(days=1), end
            )
        return [
            TogglTimeEntry(
                id=time_entry.id,
                user_id=row.user_id,
                description=row.description or "",
                project_id=row.project_id,
                billable=row.billable,
                tag_ids=row.tag_ids or [],
                start=time_entry.start,
                stop=time_entry.stop,
            )
            for row in TypeAdapter(list[_ReportRow]).validate_json(page.body)
            for time_entry in row.time_entries
        ]

    def _verify_totals(self, entries: list[TogglTimeEntry], since: date, until: date) -> None:
        fetched: dict[int, float] = {}
        for entry in entries:
            if entry.stop is not None:
                hours = (entry.stop - entry.start).total_seconds() / SECONDS_PER_HOUR
                fetched[entry.start.year] = fetched.get(entry.start.year, 0.0) + hours
        for year in range(since.year, until.year + 1):
            body = {
                "start_date": max(since, date(year, 1, 1)).isoformat(),
                "end_date": min(until, date(year, 12, 31)).isoformat(),
                "grouping": "users",
                "sub_grouping": "projects",
            }
            page = self._request(
                "POST", f"{self._reports}/summary/time_entries", json.dumps(body).encode()
            )
            summary = _Summary.model_validate_json(page.body)
            expected = sum(sub.seconds for group in summary.groups for sub in group.sub_groups)
            expected_hours = expected / SECONDS_PER_HOUR
            difference = abs(fetched.get(year, 0.0) - expected_hours)
            if difference > max(TOTALS_TOLERANCE_HOURS, expected_hours * TOTALS_TOLERANCE_RATIO):
                raise TogglApiError(
                    f"Fetched {fetched.get(year, 0.0):.1f} h for {year}, but Toggl's summary "
                    f"reports {expected_hours:.1f} h; refusing to import incomplete data"
                )
            logger.info("Verified %d: %.1f h, matching Toggl's summary", year, expected_hours)

    def _get(self, path: str) -> bytes:
        return self._request("GET", path, None).body

    def _request(self, method: str, path: str, data: bytes | None) -> _Page:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            wait = REQUEST_PAUSE_SECONDS - (time.monotonic() - self._last_request)
            if wait > 0:
                time.sleep(wait)
            self._last_request = time.monotonic()
            request = urllib.request.Request(
                f"{API_URL}{path}", data=data, method=method, headers=self._headers
            )
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    next_id = response.headers.get("X-Next-ID")
                    return _Page(body=response.read(), next_id=int(next_id) if next_id else None)
            except urllib.error.HTTPError as error:
                if error.code not in RETRYABLE_STATUSES or attempt == MAX_ATTEMPTS:
                    detail = error.read().decode(errors="replace")[:300]
                    raise TogglApiError(
                        f"{method} {path} failed with {error.code}: {detail}"
                    ) from error
                delay = RETRY_BASE_SECONDS * 2 ** (attempt - 1)
                logger.warning("Toggl returned %d for %s; retrying in %ds", error.code, path, delay)
                time.sleep(delay)
        raise TogglApiError(f"{method} {path} failed after {MAX_ATTEMPTS} attempts")
