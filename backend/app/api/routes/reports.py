from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import CurrentUser, ReportServiceDep
from app.api.schemas.reports import (
    ReportEntryOut,
    ReportQueryIn,
    SummaryQueryIn,
    SummaryReportOut,
)
from app.domain.users import User
from app.domain.value_objects import parse_timezone
from app.exports.report_pdf import (
    ReportContext,
    render_detailed_pdf,
    render_summary_pdf,
    report_filename,
)
from app.services.reports import ReportService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary")
def get_summary(
    query: Annotated[SummaryQueryIn, Query()], actor: CurrentUser, reports: ReportServiceDep
) -> SummaryReportOut:
    report = reports.summarize(actor, query.to_filter(), query.timezone, query.to_layout())
    return SummaryReportOut.from_domain(report)


@router.get("/entries")
def list_entries(
    query: Annotated[ReportQueryIn, Query()], actor: CurrentUser, reports: ReportServiceDep
) -> list[ReportEntryOut]:
    return [ReportEntryOut.from_report(e) for e in reports.list_entries(actor, query.to_filter())]


@router.get("/summary.pdf")
def export_summary_pdf(
    query: Annotated[SummaryQueryIn, Query()], actor: CurrentUser, reports: ReportServiceDep
) -> Response:
    report = reports.summarize(actor, query.to_filter(), query.timezone, query.to_layout())
    context = report_context(query, actor, reports)
    return pdf_response(render_summary_pdf(report, context), report_filename("Summary", context))


@router.get("/detailed.pdf")
def export_detailed_pdf(
    query: Annotated[SummaryQueryIn, Query()], actor: CurrentUser, reports: ReportServiceDep
) -> Response:
    report_filter = query.to_filter()
    report = reports.summarize(actor, report_filter, query.timezone, query.to_layout())
    entries = reports.list_entries(actor, report_filter)
    context = report_context(query, actor, reports)
    pdf = render_detailed_pdf(report, entries, context)
    return pdf_response(pdf, report_filename("Detailed", context))


def report_context(query: SummaryQueryIn, actor: User, reports: ReportService) -> ReportContext:
    return ReportContext(
        period=query.to_filter().period,
        zone=parse_timezone(query.timezone),
        catalog=reports.catalog(actor),
        shown_filter=reports.requested_filter(actor, query.to_filter()),
        period_name=query.period_name,
    )


def pdf_response(content: bytes, filename: str) -> Response:
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
