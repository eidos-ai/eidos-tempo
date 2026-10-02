from collections.abc import Iterator
from datetime import timedelta

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
