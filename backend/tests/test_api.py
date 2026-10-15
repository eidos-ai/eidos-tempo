from collections.abc import Iterator
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_repositories
from app.repositories.protocols import Repositories
from tests.fakes import FakeClock


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "admin@eidos.ai", "password": "admin-password"}
    )
    assert response.status_code == 200


def test_wrong_password_is_rejected(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/auth/login", json={"email": "admin@eidos.ai", "password": "nope-nope"}
    )
    assert response.status_code == 401


def test_timer_flow(api_client: TestClient) -> None:
    login(api_client)
    client_response = api_client.post("/api/clients", json={"name": "BrainLogic"})
    project_response = api_client.post(
        "/api/projects",
        json={
            "name": "Vision",
            "color": "#7B4DE7",
            "client_id": client_response.json()["id"],
            "is_billable": True,
        },
    )
    project_id = project_response.json()["id"]

    started = api_client.post(
        "/api/time-entries/start", json={"description": "Model training", "project_id": project_id}
    )
    assert started.status_code == 201
    assert api_client.get("/api/time-entries/running").json()["id"] == started.json()["id"]

    stopped = api_client.post("/api/time-entries/stop")
    assert stopped.json()["stop"] is not None
    assert api_client.get("/api/time-entries/running").json() is None


def test_timer_keeps_the_click_time(api_client: TestClient, api_clock: FakeClock) -> None:
    login(api_client)
    clicked = api_clock.now() - timedelta(seconds=3)
    started = api_client.post(
        "/api/time-entries/start", json={"description": "Queued", "start": clicked.isoformat()}
    )
    assert datetime.fromisoformat(started.json()["start"]) == clicked

    api_clock.advance(timedelta(minutes=5))
    stopped_at = api_clock.now() - timedelta(seconds=1)
    stopped = api_client.post("/api/time-entries/stop", json={"stop": stopped_at.isoformat()})
    assert datetime.fromisoformat(stopped.json()["stop"]) == stopped_at


def test_domain_errors_map_to_http_status(api_client: TestClient) -> None:
    login(api_client)
    assert api_client.post("/api/time-entries/stop").status_code == 409
    response = api_client.post("/api/projects", json={"name": "X", "color": "not-a-color"})
    assert response.status_code == 422


def test_failed_commit_is_reported_as_an_error(api_client: TestClient) -> None:
    login(api_client)
    app = api_client.app
    assert isinstance(app, FastAPI)
    repositories = app.dependency_overrides[get_repositories]()

    def failing_commit() -> Iterator[Repositories]:
        yield repositories
        raise ConnectionError("database went away during commit")

    app.dependency_overrides[get_repositories] = failing_commit
    client = TestClient(app, raise_server_exceptions=False, cookies=api_client.cookies)

    response = client.post("/api/time-entries/start", json={"description": "Lost?"})

    assert response.status_code == 500


def test_logout_ends_session(api_client: TestClient) -> None:
    login(api_client)
    assert api_client.post("/api/auth/logout").status_code == 204
    assert api_client.get("/api/me").status_code == 401


def test_active_session_cookie_is_renewed(api_client: TestClient, api_clock: FakeClock) -> None:
    login(api_client)

    assert "set-cookie" not in api_client.get("/api/me").headers

    api_clock.advance(timedelta(days=2))
    renewed = api_client.get("/api/me")
    assert renewed.status_code == 200
    assert "tempo_session=" in renewed.headers["set-cookie"]


def test_suggestions_endpoint(api_client: TestClient) -> None:
    login(api_client)
    api_client.post("/api/time-entries/start", json={"description": "Deep work"})
    api_client.post("/api/time-entries/stop")

    response = api_client.get("/api/time-entries/suggestions")

    assert response.status_code == 200
    assert response.json() == [{"description": "Deep work", "project_id": None}]


def test_story_endpoint(api_client: TestClient, api_clock: FakeClock) -> None:
    login(api_client)
    api_client.post("/api/time-entries/start", json={"description": "Deep work"})
    api_clock.advance(timedelta(minutes=5))

    response = api_client.get("/api/time-entries/story", params={"timezone": "UTC"})

    assert response.status_code == 200
    assert response.json()["entry_count"] == 1
    bad = api_client.get("/api/time-entries/story", params={"timezone": "Nowhere"})
    assert bad.status_code == 422


def test_entries_carry_billable_and_tags(api_client: TestClient) -> None:
    login(api_client)
    project_id = api_client.post(
        "/api/projects", json={"name": "Vision", "color": "#7B4DE7", "is_billable": True}
    ).json()["id"]
    tag_id = api_client.post("/api/tags", json={"name": "research"}).json()["id"]

    started = api_client.post(
        "/api/time-entries/start", json={"project_id": project_id, "tag_ids": [tag_id]}
    ).json()
    assert started["is_billable"] is True
    assert started["tag_ids"] == [tag_id]

    without_tags = {"description": "x", "project_id": project_id, "start": started["start"]}
    assert (
        api_client.put(f"/api/time-entries/{started['id']}", json=without_tags).status_code == 422
    )

    updated = api_client.put(
        f"/api/time-entries/{started['id']}",
        json={**without_tags, "is_billable": False, "tag_ids": []},
    ).json()
    assert updated["is_billable"] is False
    assert updated["tag_ids"] == []


def test_saving_an_entry_requires_tags_and_billable(api_client: TestClient) -> None:
    login(api_client)
    running = api_client.post("/api/time-entries/start", json={"description": "Tagged"}).json()
    partial = {"description": "Tagged", "start": running["start"], "stop": None}

    update = api_client.put(f"/api/time-entries/{running['id']}", json=partial)
    create = api_client.post("/api/time-entries", json={**partial, "stop": running["start"]})

    assert (update.status_code, create.status_code) == (422, 422)


SEPTEMBER_PARAMS = {
    "start": "2026-09-01T03:00:00Z",
    "end": "2026-10-01T03:00:00Z",
    "timezone": "America/Montevideo",
}


def add_entry(client: TestClient, description: str, start: str, stop: str) -> str:
    response = client.post(
        "/api/time-entries",
        json={
            "description": description,
            "is_billable": True,
            "tag_ids": [],
            "start": start,
            "stop": stop,
        },
    )
    assert response.status_code == 201
    entry_id: str = response.json()["id"]
    return entry_id


def test_report_endpoints(api_client: TestClient) -> None:
    login(api_client)
    add_entry(api_client, "Planning & review", "2026-09-10T12:00:00Z", "2026-09-10T14:30:00Z")

    summary = api_client.get("/api/reports/summary", params=SEPTEMBER_PARAMS).json()
    assert summary["total"] == {"seconds": 9000, "billable_seconds": 9000}
    assert summary["days_tracked"] == 1
    assert summary["resolution"] == "day"
    assert summary["groups"][0]["key"] is None
    assert summary["slices"] == [{"key": None, "seconds": 9000}]
    assert summary["buckets"][9]["segments"] == [{"key": "billable", "seconds": 9000}]
    assert summary["buckets"][9]["projects"] == [
        {"key": None, "seconds": 9000, "billable_seconds": 9000, "subgroups": []}
    ]

    by_member = api_client.get(
        "/api/reports/summary",
        params={**SEPTEMBER_PARAMS, "stack_by": "member", "slice_by": "billable"},
    ).json()
    assert by_member["slices"] == [{"key": "billable", "seconds": 9000}]
    assert by_member["buckets"][9]["segments"][0]["seconds"] == 9000

    with_project = api_client.get(
        "/api/reports/entries",
        params={**SEPTEMBER_PARAMS, "without_project": "true", "exclude_projects": "true"},
    ).json()
    assert with_project == []

    entries = api_client.get(
        "/api/reports/entries", params={**SEPTEMBER_PARAMS, "billable": "true"}
    ).json()
    assert [entry["description"] for entry in entries] == ["Planning & review"]
    assert "user_id" in entries[0]

    for kind in ("summary", "detailed"):
        response = api_client.get(
            f"/api/reports/{kind}.pdf", params={**SEPTEMBER_PARAMS, "period_name": "Last month"}
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert "2026-09-01_to_2026-09-30.pdf" in response.headers["content-disposition"]
        assert response.content.startswith(b"%PDF")


def test_admin_can_edit_a_members_entry_from_reports(api_client: TestClient) -> None:
    login(api_client)
    api_client.post(
        "/api/users",
        json={
            "email": "member@eidos.ai",
            "full_name": "Member",
            "password": "member-password",
            "role": "member",
        },
    )
    api_client.post("/api/auth/logout")
    api_client.post(
        "/api/auth/login", json={"email": "member@eidos.ai", "password": "member-password"}
    )
    entry_id = add_entry(api_client, "Typo", "2026-09-10T12:00:00Z", "2026-09-10T13:00:00Z")
    api_client.post("/api/auth/logout")
    login(api_client)

    response = api_client.put(
        f"/api/time-entries/{entry_id}",
        json={
            "description": "Fixed",
            "is_billable": False,
            "tag_ids": [],
            "start": "2026-09-10T12:00:00Z",
            "stop": "2026-09-10T13:00:00Z",
        },
    )

    assert response.status_code == 200
    entries = api_client.get("/api/reports/entries", params=SEPTEMBER_PARAMS).json()
    assert [(e["description"], e["is_billable"]) for e in entries] == [("Fixed", False)]


def test_split_entry_endpoint(api_client: TestClient) -> None:
    login(api_client)
    entry_id = add_entry(api_client, "Review", "2026-09-10T12:00:00Z", "2026-09-10T14:00:00Z")

    response = api_client.post(
        f"/api/time-entries/{entry_id}/split", json={"at": "2026-09-10T13:15:00Z"}
    )

    assert response.status_code == 201
    split = response.json()
    assert split["later"]["id"] == entry_id
    assert (split["later"]["start"], split["later"]["stop"]) == (
        "2026-09-10T13:15:00Z",
        "2026-09-10T14:00:00Z",
    )
    assert (split["earlier"]["start"], split["earlier"]["stop"]) == (
        "2026-09-10T12:00:00Z",
        "2026-09-10T13:15:00Z",
    )
    assert split["earlier"]["description"] == "Review"
    assert split["earlier"]["is_billable"] is True
    outside = api_client.post(
        f"/api/time-entries/{entry_id}/split", json={"at": "2026-09-10T15:00:00Z"}
    )
    assert outside.status_code == 422
