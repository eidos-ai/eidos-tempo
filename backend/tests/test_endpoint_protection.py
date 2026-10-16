from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import build_test_settings

PUBLIC_ROUTES = {
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/logout"),
    ("GET", "/api/health"),
    # Authenticated by a Google OIDC token from the tempo-scheduler service account, not a session.
    ("POST", "/api/internal/backup"),
}
MEMBER_ROUTES = {
    ("GET", "/api/me"),
    ("PUT", "/api/me/preferences"),
    ("PUT", "/api/me/password"),
    ("GET", "/api/clients"),
    ("GET", "/api/projects"),
    ("GET", "/api/tags"),
    ("POST", "/api/tags"),
    ("GET", "/api/time-entries"),
    ("GET", "/api/time-entries/running"),
    ("GET", "/api/time-entries/suggestions"),
    ("GET", "/api/time-entries/story"),
    ("POST", "/api/time-entries/start"),
    ("POST", "/api/time-entries/stop"),
    ("POST", "/api/time-entries"),
    ("PUT", "/api/time-entries/{entry_id}"),
    ("DELETE", "/api/time-entries/{entry_id}"),
    ("POST", "/api/time-entries/{entry_id}/split"),
    ("POST", "/api/time-entries/{entry_id}/duplicate"),
    ("GET", "/api/reports/summary"),
    ("GET", "/api/reports/entries"),
    ("GET", "/api/reports/summary.pdf"),
    ("GET", "/api/reports/detailed.pdf"),
    ("GET", "/api/me/api-token"),
    ("POST", "/api/me/api-token"),
    ("DELETE", "/api/me/api-token"),
}
API_TOKEN_ROUTES = {
    ("GET", "/api/toggl/me"),
    ("GET", "/api/toggl/users"),
    ("GET", "/api/toggl/projects"),
    ("PUT", "/api/toggl/time_entries/{entry_id}"),
    ("GET", "/api/toggl/reports/details"),
    ("GET", "/api/toggl/reports/summary"),
    ("GET", "/api/toggl/reports/summary.pdf"),
    ("GET", "/api/toggl/reports/details.pdf"),
}
ADMIN_ROUTES = {
    ("GET", "/api/users"),
    ("POST", "/api/users"),
    ("PUT", "/api/users/{user_id}"),
    ("PUT", "/api/users/{user_id}/password"),
    ("POST", "/api/clients"),
    ("PUT", "/api/clients/{client_id}"),
    ("POST", "/api/projects"),
    ("PUT", "/api/projects/{project_id}"),
    ("PUT", "/api/tags/{tag_id}"),
}
VALID_BODIES = {
    ("POST", "/api/users"): {
        "email": "x@eidos.ai",
        "full_name": "X",
        "password": "long-password",
        "role": "member",
    },
    ("PUT", "/api/users/{user_id}"): {"full_name": "X", "role": "admin", "is_active": True},
    ("PUT", "/api/users/{user_id}/password"): {"new_password": "long-password"},
    ("POST", "/api/clients"): {"name": "X"},
    ("PUT", "/api/clients/{client_id}"): {"name": "X", "is_archived": False},
    ("POST", "/api/projects"): {"name": "X", "color": "#7B4DE7"},
    ("PUT", "/api/projects/{project_id}"): {"name": "X", "color": "#7B4DE7"},
    ("PUT", "/api/tags/{tag_id}"): {"name": "X"},
}
REPORT_PARAMS = {
    "start": "2026-09-01T00:00:00Z",
    "end": "2026-10-01T00:00:00Z",
    "timezone": "UTC",
}
QUERY_PARAMS = {
    ("GET", "/api/time-entries"): {"start": "2026-09-28T00:00:00Z", "end": "2026-10-05T00:00:00Z"},
    ("GET", "/api/time-entries/story"): {"timezone": "UTC"},
    ("GET", "/api/reports/summary"): REPORT_PARAMS,
    ("GET", "/api/reports/entries"): REPORT_PARAMS,
    ("GET", "/api/reports/summary.pdf"): REPORT_PARAMS,
    ("GET", "/api/reports/detailed.pdf"): REPORT_PARAMS,
}


def registered_routes() -> set[tuple[str, str]]:
    paths = create_app(build_test_settings()).openapi()["paths"]
    return {(method.upper(), path) for path, operations in paths.items() for method in operations}


def call(client: TestClient, method: str, path: str) -> int:
    url = path.format(
        entry_id=uuid4(), user_id=uuid4(), client_id=uuid4(), project_id=uuid4(), tag_id=uuid4()
    )
    body = VALID_BODIES.get((method, path), {})
    params = QUERY_PARAMS.get((method, path))
    status_code: int = client.request(method, url, json=body, params=params).status_code
    return status_code


def test_every_route_is_classified() -> None:
    assert registered_routes() == PUBLIC_ROUTES | MEMBER_ROUTES | ADMIN_ROUTES | API_TOKEN_ROUTES


def test_anonymous_requests_are_rejected(api_client: TestClient) -> None:
    for method, path in MEMBER_ROUTES | ADMIN_ROUTES | API_TOKEN_ROUTES:
        assert call(api_client, method, path) == 401, (method, path)


def test_forged_session_cookie_is_rejected(api_client: TestClient) -> None:
    api_client.cookies.set("tempo_session", "forged-token")
    for method, path in MEMBER_ROUTES | ADMIN_ROUTES | API_TOKEN_ROUTES:
        assert call(api_client, method, path) == 401, (method, path)


def test_members_cannot_use_admin_routes(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login", json={"email": "admin@eidos.ai", "password": "admin-password"}
    )
    api_client.post(
        "/api/users",
        json={
            "email": "member@eidos.ai",
            "full_name": "M",
            "password": "member-password",
            "role": "member",
        },
    )
    api_client.post("/api/auth/logout")
    api_client.post(
        "/api/auth/login", json={"email": "member@eidos.ai", "password": "member-password"}
    )
    for method, path in ADMIN_ROUTES:
        assert call(api_client, method, path) == 403, (method, path)


def test_api_docs_are_disabled_by_default(api_client: TestClient) -> None:
    for path in ("/api/docs", "/api/openapi.json", "/redoc", "/docs"):
        assert api_client.get(path).status_code == 404, path


def test_toggl_routes_need_an_api_token_not_a_session(api_client: TestClient) -> None:
    api_client.post(
        "/api/auth/login", json={"email": "admin@eidos.ai", "password": "admin-password"}
    )
    for method, path in API_TOKEN_ROUTES:
        assert call(api_client, method, path) == 401, (method, path)


def test_forged_api_token_is_rejected(api_client: TestClient) -> None:
    api_client.auth = ("forged-token", "api_token")
    for method, path in API_TOKEN_ROUTES:
        assert call(api_client, method, path) == 401, (method, path)
