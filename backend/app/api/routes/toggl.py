from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response

from app.api.deps import ApiUser, ReportServiceDep, SettingsDep, TogglCompatServiceDep
from app.api.routes.reports import pdf_response
from app.api.schemas.toggl import (
    TogglDetailsOut,
    TogglDetailsQueryIn,
    TogglMeOut,
    TogglProjectOut,
    TogglSummaryOut,
    TogglSummaryQueryIn,
    TogglTimeEntryIn,
    TogglTimeEntryOut,
    TogglUserOut,
)
from app.domain.reports import SummaryLayout
from app.domain.users import User
from app.exports.report_pdf import (
    ReportContext,
    render_detailed_pdf,
    render_summary_pdf,
    report_filename,
)
from app.services.reports import ReportService
from app.services.toggl_compat import ResolvedQuery

router = APIRouter(prefix="/toggl", tags=["toggl"])

ACTIVE_FILTER = {"true": True, "false": False, "both": None}


@router.get("/me")
def get_me(actor: ApiUser, compat: TogglCompatServiceDep, settings: SettingsDep) -> TogglMeOut:
    return TogglMeOut(
        id=compat.user_number(actor),
        email=str(actor.email),
        fullname=actor.full_name,
        timezone=settings.api_timezone,
    )


@router.get("/users")
def list_users(actor: ApiUser, compat: TogglCompatServiceDep) -> list[TogglUserOut]:
    return [TogglUserOut.from_info(user) for user in compat.list_users(actor)]


@router.get("/projects")
def list_projects(
    actor: ApiUser,
    compat: TogglCompatServiceDep,
    active: Literal["true", "false", "both"] = "true",
) -> list[TogglProjectOut]:
    projects = compat.list_projects(actor, ACTIVE_FILTER[active])
    return [TogglProjectOut.from_info(project) for project in projects]


@router.put("/time_entries/{entry_id}")
def update_time_entry(
    entry_id: int, body: TogglTimeEntryIn, actor: ApiUser, compat: TogglCompatServiceDep
) -> TogglTimeEntryOut:
    return TogglTimeEntryOut.from_entry(compat.update_entry(actor, entry_id, body.to_changes()))


@router.get("/reports/details")
def get_details(
    query: Annotated[TogglDetailsQueryIn, Query()], actor: ApiUser, compat: TogglCompatServiceDep
) -> TogglDetailsOut:
    page = compat.details(
        actor, query.to_query(), query.page, query.order_field, query.order_desc == "on"
    )
    return TogglDetailsOut.from_page(page)


@router.get("/reports/summary")
def get_summary(
    query: Annotated[TogglSummaryQueryIn, Query()], actor: ApiUser, compat: TogglCompatServiceDep
) -> TogglSummaryOut:
    summary = compat.summary(actor, query.to_query(), query.grouping, query.subgrouping)
    return TogglSummaryOut.from_summary(summary)


@router.get("/reports/summary.pdf")
def export_summary_pdf(
    query: Annotated[TogglSummaryQueryIn, Query()],
    actor: ApiUser,
    compat: TogglCompatServiceDep,
    reports: ReportServiceDep,
) -> Response:
    resolved = compat.resolve(query.to_query())
    report = compat.summary_report(actor, resolved, query.grouping, query.subgrouping)
    context = pdf_context(resolved, actor, reports)
    return pdf_response(render_summary_pdf(report, context), report_filename("Summary", context))


@router.get("/reports/details.pdf")
def export_details_pdf(
    query: Annotated[TogglDetailsQueryIn, Query()],
    actor: ApiUser,
    compat: TogglCompatServiceDep,
    reports: ReportServiceDep,
) -> Response:
    resolved = compat.resolve(query.to_query())
    context = pdf_context(resolved, actor, reports)
    entries = compat.sorted_entries(
        actor, resolved, context.catalog, query.order_field, query.order_desc == "on"
    )
    report = reports.summarize(actor, resolved.report_filter, resolved.zone.key, SummaryLayout())
    pdf = render_detailed_pdf(report, entries, context)
    return pdf_response(pdf, report_filename("Detailed", context))


def pdf_context(resolved: ResolvedQuery, actor: User, reports: ReportService) -> ReportContext:
    return ReportContext(
        period=resolved.report_filter.period,
        zone=resolved.zone,
        catalog=reports.catalog(actor),
        shown_filter=reports.requested_filter(actor, resolved.report_filter),
        period_name=None,
    )
