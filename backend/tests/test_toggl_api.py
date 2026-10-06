from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient


@dataclass(frozen=True)
class Workspace:
    hockey_number: int
    hockey_entry_number: int


def login(client: TestClient, email: str, password: str) -> None:
    assert client.post("/api/auth/login", json={"email": email, "password": password}).is_success


def use_api_token(client: TestClient) -> None:
    token = client.post("/api/me/api-token").json()["token"]
    client.cookies.clear()
    client.auth = (token, "api_token")


def add_entry(client: TestClient, start: str, stop: str, **fields: object) -> None:
    body = {"is_billable": False, "tag_ids": [], "start": start, "stop": stop, **fields}
    assert client.post("/api/time-entries", json=body).status_code == 201


@pytest.fixture
def workspace(api_client: TestClient) -> Workspace:
    login(api_client, "admin@eidos.ai", "admin-password")
    client_id = api_client.post("/api/clients", json={"name": "Acme"}).json()["id"]
    hockey = api_client.post(
        "/api/projects",
        json={"name": "HOCKEY", "color": "#2F6FDB", "client_id": client_id, "is_billable": True},
    ).json()
    old = api_client.post("/api/projects", json={"name": "Old", "color": "#B9737C"}).json()
    api_client.put(
        f"/api/projects/{old['id']}", json={"name": "Old", "color": "#B9737C", "is_archived": True}
    )
    tag_id = api_client.post("/api/tags", json={"name": "meeting"}).json()["id"]
    api_client.post("/api/tags", json={"name": "review"})
    add_entry(
        api_client,
        "2026-09-01T12:00:00Z",
        "2026-09-01T15:00:00Z",
        description="Hockey work",
        project_id=hockey["id"],
        is_billable=True,
        tag_ids=[tag_id],
    )
    add_entry(api_client, "2026-09-01T02:30:00Z", "2026-09-01T03:30:00Z", description="Late night")
    add_entry(api_client, "2026-09-02T15:00:00Z", "2026-09-02T16:00:00Z", description="lunch")
    use_api_token(api_client)

    projects = api_client.get("/api/toggl/projects").json()
    details = api_client.get(
        "/api/toggl/reports/details", params={"since": "2026-09-01", "until": "2026-09-01"}
    ).json()
    return Workspace(
        hockey_number=next(p["id"] for p in projects if p["name"] == "HOCKEY"),
        hockey_entry_number=details["data"][0]["id"],
    )


def details(client: TestClient, **params: str) -> dict[str, object]:
    query = {"workspace_id": "6043217", "since": "2026-09-01", "until": "2026-09-30", **params}
    response = client.get("/api/toggl/reports/details", params=query)
    assert response.status_code == 200, response.text
    body: dict[str, object] = response.json()
    return body


def descriptions(body: dict[str, object]) -> list[str]:
    data = body["data"]
    assert isinstance(data, list)
    return [entry["description"] for entry in data]


def test_me_and_projects_use_numeric_ids(api_client: TestClient, workspace: Workspace) -> None:
    assert isinstance(api_client.get("/api/toggl/me").json()["id"], int)
    active = [p["name"] for p in api_client.get("/api/toggl/projects").json()]
    both = [p["name"] for p in api_client.get("/api/toggl/projects?active=both").json()]

    assert active == ["HOCKEY"]
    assert both == ["HOCKEY", "Old"]


def test_days_are_montevideo_days(api_client: TestClient, workspace: Workspace) -> None:
    late_night = details(api_client, since="2026-08-31", until="2026-08-31")["data"]
    assert late_night[0]["start"] == "2026-08-31T23:30:00-03:00"  # type: ignore[index]


def test_details_match_toggl_fields_in_the_api_timezone(
    api_client: TestClient, workspace: Workspace
) -> None:
    body = details(api_client, since="2026-09-01", until="2026-09-01")

    assert body["total_count"] == 1
    assert body["per_page"] == 50
    assert body["total_grand"] == body["total_billable"] == 3 * 3600 * 1000
    entry = body["data"][0]  # type: ignore[index]
    assert entry["start"] == "2026-09-01T09:00:00-03:00"
    assert entry["end"] == "2026-09-01T12:00:00-03:00"
    assert entry["dur"] == 3 * 3600 * 1000
    assert entry["pid"] == workspace.hockey_number
    assert (entry["project"], entry["client"], entry["tags"]) == ("HOCKEY", "Acme", ["meeting"])
    assert entry["is_billable"] is True


def test_details_are_oldest_first_and_filterable(
    api_client: TestClient, workspace: Workspace
) -> None:
    assert descriptions(details(api_client, since="2026-08-31")) == [
        "Late night",
        "Hockey work",
        "lunch",
    ]
    assert descriptions(details(api_client, order_desc="on")) == ["lunch", "Hockey work"]
    assert descriptions(details(api_client, billable="yes")) == ["Hockey work"]
    assert descriptions(details(api_client, project_ids=str(workspace.hockey_number))) == [
        "Hockey work"
    ]
    assert descriptions(details(api_client, project_ids="0")) == ["lunch"]
    response = api_client.get(
        "/api/toggl/reports/details",
        params={"since": "2026-09-01", "until": "2026-09-30", "project_ids": "999"},
    )
    assert response.status_code == 422


def test_summary_groups_by_user_and_description(
    api_client: TestClient, workspace: Workspace
) -> None:
    body = api_client.get(
        "/api/toggl/reports/summary",
        params={
            "since": "2026-09-01",
            "until": "2026-09-30",
            "grouping": "users",
            "subgrouping": "time_entries",
        },
    ).json()

    assert body["total_grand"] == 4 * 3600 * 1000
    assert [group["title"] for group in body["data"]] == [{"user": "Admin"}]
    items = {item["title"]["time_entry"]: item["time"] for item in body["data"][0]["items"]}
    assert items == {"Hockey work": 10_800_000, "lunch": 3_600_000}


def test_update_changes_only_the_fields_sent(api_client: TestClient, workspace: Workspace) -> None:
    url = f"/api/toggl/time_entries/{workspace.hockey_entry_number}"

    stretched = api_client.put(url, json={"duration": 4 * 3600}).json()
    assert stretched["stop"] == "2026-09-01T16:00:00Z"
    assert (stretched["pid"], stretched["tags"]) == (workspace.hockey_number, ["meeting"])

    tagged = api_client.put(url, json={"tags": ["review"], "tag_action": "add"}).json()
    assert tagged["tags"] == ["meeting", "review"]

    moved = api_client.put(url, json={"project_id": None, "billable": False}).json()
    assert (moved["project_id"], moved["billable"], moved["duration"]) == (None, False, 4 * 3600)
    assert api_client.put(url, json={"tags": ["unknown"]}).status_code == 422
    assert api_client.put("/api/toggl/time_entries/123", json={}).status_code == 404


def test_pdfs_are_rendered(api_client: TestClient, workspace: Workspace) -> None:
    params = {
        "since": "2026-09-01",
        "until": "2026-09-30",
        "project_ids": str(workspace.hockey_number),
        "billable": "yes",
    }
    for path, extra in (
        ("summary.pdf", {"grouping": "users", "subgrouping": "time_entries"}),
        ("details.pdf", {"order_field": "date", "order_desc": "off"}),
    ):
        response = api_client.get(f"/api/toggl/reports/{path}", params={**params, **extra})
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")


def test_members_only_see_and_edit_their_own_entries(
    api_client: TestClient, workspace: Workspace
) -> None:
    login(api_client, "admin@eidos.ai", "admin-password")
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
    login(api_client, "member@eidos.ai", "member-password")
    use_api_token(api_client)

    assert details(api_client)["total_count"] == 0
    assert [u["fullname"] for u in api_client.get("/api/toggl/users").json()] == ["Member"]
    url = f"/api/toggl/time_entries/{workspace.hockey_entry_number}"
    assert api_client.put(url, json={"description": "mine"}).status_code == 404
