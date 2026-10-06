from dataclasses import dataclass, replace

from app.domain.clients import Client
from app.domain.ids import ClientId, ProjectId, TagId, UserId
from app.domain.projects import Project
from app.domain.reports import Choice, ReportFilter, SummaryLayout, SummaryReport, build_summary
from app.domain.tags import Tag
from app.domain.time_entries import TimeEntry
from app.domain.users import User
from app.domain.value_objects import parse_timezone
from app.repositories.protocols import (
    ClientRepository,
    ProjectRepository,
    TagRepository,
    TimeEntryRepository,
    UserRepository,
)


@dataclass(frozen=True)
class ReportCatalog:
    users: dict[UserId, User]
    projects: dict[ProjectId, Project]
    clients: dict[ClientId, Client]
    tags: dict[TagId, Tag]


class ReportService:
    def __init__(
        self,
        time_entries: TimeEntryRepository,
        users: UserRepository,
        projects: ProjectRepository,
        clients: ClientRepository,
        tags: TagRepository,
    ) -> None:
        self._entries = time_entries
        self._users = users
        self._projects = projects
        self._clients = clients
        self._tags = tags

    def list_entries(self, actor: User, report_filter: ReportFilter) -> list[TimeEntry]:
        return self._entries.list_for_report(visible_to(actor, report_filter))

    def summarize(
        self,
        actor: User,
        report_filter: ReportFilter,
        timezone: str,
        layout: SummaryLayout,
    ) -> SummaryReport:
        zone = parse_timezone(timezone)
        client_of = {
            project.id: project.client_id
            for project in self._projects.list_all(include_archived=True)
        }
        return build_summary(
            self.list_entries(actor, report_filter),
            report_filter.period,
            zone,
            client_of,
            layout,
        )

    def requested_filter(self, actor: User, report_filter: ReportFilter) -> ReportFilter:
        """The filters the actor actually chose; members can't filter by member."""
        return report_filter if actor.is_admin else replace(report_filter, users=Choice())

    def catalog(self, actor: User) -> ReportCatalog:
        users = self._users.list_all() if actor.is_admin else [actor]
        return ReportCatalog(
            users={user.id: user for user in users},
            projects={p.id: p for p in self._projects.list_all(include_archived=True)},
            clients={c.id: c for c in self._clients.list_all(include_archived=True)},
            tags={t.id: t for t in self._tags.list_all(include_archived=True)},
        )


def visible_to(actor: User, report_filter: ReportFilter) -> ReportFilter:
    if actor.is_admin:
        return report_filter
    return replace(report_filter, users=Choice(ids=(actor.id,)))
