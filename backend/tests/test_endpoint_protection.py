from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import build_test_settings

PUBLIC_ROUTES = {
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/logout"),
    ("GET", "/api/health"),
}
MEMBER_ROUTES = {
    ("GET", "/api/me"),
    ("PUT", "/api/me/preferences"),
    ("PUT", "/api/me/password"),
    ("GET", "/api/clients"),
    ("GET", "/api/projects"),
    ("GET", "/api/time-entries"),
    ("GET", "/api/time-entries/running"),
    ("POST", "/api/time-entries/start"),
    ("POST", "/api/time-entries/stop"),
    ("POST", "/api/time-entries"),
    ("PUT", "/api/time-entries/{entry_id}"),
    ("DELETE", "/api/time-entries/{entry_id}"),
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
}
WEEK = {"start": "2026-09-28T00:00:00Z", "end": "2026-10-05T00:00:00Z"}


def registered_routes() -> set[tuple[str, str]]:
    paths = create_app(build_test_settings()).openapi()["paths"]
    return {(method.upper(), path) for path, operations in paths.items() for method in operations}


def call(client: TestClient, method: str, path: str) -> int:
    url = path.format(entry_id=uuid4(), user_id=uuid4(), client_id=uuid4(), project_id=uuid4())
    body = VALID_BODIES.get((method, path), {})
    params = WEEK if path == "/api/time-entries" and method == "GET" else None
    status_code: int = client.request(method, url, json=body, params=params).status_code
    return status_code


def test_every_route_is_classified() -> None:
    assert registered_routes() == PUBLIC_ROUTES | MEMBER_ROUTES | ADMIN_ROUTES


def test_anonymous_requests_are_rejected(api_client: TestClient) -> None:
    for method, path in MEMBER_ROUTES | ADMIN_ROUTES:
        assert call(api_client, method, path) == 401, (method, path)


def test_forged_session_cookie_is_rejected(api_client: TestClient) -> None:
    api_client.cookies.set("tempo_session", "forged-token")
    for method, path in MEMBER_ROUTES | ADMIN_ROUTES:
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
