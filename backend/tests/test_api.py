from datetime import timedelta

from fastapi.testclient import TestClient

from tests.fakes import FakeClock


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "admin@eidos.ai", "password": "admin-password"}
    )
    assert response.status_code == 200


def test_requests_without_session_are_rejected(api_client: TestClient) -> None:
    assert api_client.get("/api/me").status_code == 401


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
