import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import UUID
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from reportlab.graphics.shapes import Circle, Drawing, Group, Line, Rect, String, Wedge
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    Flowable,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.domain.ids import ClientId, ProjectId, UserId
from app.domain.reports import (
    BILLABLE_KEY,
    NON_BILLABLE_KEY,
    Choice,
    Grouping,
    ReportFilter,
    Resolution,
    Share,
    SummaryGroup,
    SummaryReport,
    entry_seconds,
)
from app.domain.time_entries import TimeEntry
from app.domain.value_objects import DateRange
from app.services.reports import ReportCatalog

LOGO_PATH = Path(__file__).with_name("eidos-logo.png")
LOGO_ASPECT = 1880 / 500
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 16 * mm
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

INK = colors.HexColor("#181633")
INK_SOFT = colors.HexColor("#4A4870")
MUTED = colors.HexColor("#8A88A8")
LINE = colors.HexColor("#E7E6F0")
CANVAS = colors.HexColor("#F7F7FB")
BILLABLE = colors.HexColor("#6A3FE0")
NON_BILLABLE = colors.HexColor("#9F7FEE")
NO_PROJECT_COLOR = "#9D9AC8"
CATEGORICAL_COLORS = (
    "#2A78D6",
    "#EB6834",
    "#1BAF7A",
    "#EDA100",
    "#E87BA4",
    "#008300",
    "#4A3AA7",
    "#E34948",
)
QUARTER_HOUR = 0.25
AXIS_INTERVALS = 5
MAX_CHIP_DESCRIPTION = 80

TITLE = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=INK)
SUBTITLE = ParagraphStyle("subtitle", fontName="Helvetica", fontSize=9, textColor=INK_SOFT)
HEADING = ParagraphStyle("heading", fontName="Helvetica-Bold", fontSize=11, textColor=INK)
LABEL = ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=8, textColor=INK_SOFT)
VALUE = ParagraphStyle("value", fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=INK)
CELL = ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK)
CELL_RIGHT = ParagraphStyle("cell_right", parent=CELL, alignment=TA_RIGHT)
CELL_BOLD = ParagraphStyle("cell_bold", parent=CELL, fontName="Helvetica-Bold")
BILLABLE_SIGN = ParagraphStyle(
    "billable_sign",
    parent=CELL,
    fontName="Helvetica-Bold",
    alignment=TA_CENTER,
    textColor=colors.HexColor("#7B4DE7"),
)
HEADER_CELL = ParagraphStyle("header_cell", parent=CELL, fontSize=7, textColor=MUTED)

GROUPING_TITLES = {
    Grouping.PROJECT: "Project",
    Grouping.CLIENT: "Client",
    Grouping.MEMBER: "Member",
    Grouping.DESCRIPTION: "Description",
    Grouping.BILLABLE: "Billable",
}
EMPTY_GROUP_LABELS = {
    Grouping.PROJECT: "Without project",
    Grouping.CLIENT: "Without client",
    Grouping.MEMBER: "Unknown member",
    Grouping.DESCRIPTION: "(no description)",
    Grouping.BILLABLE: "Non-billable",
}
BILLABLE_LABELS = {BILLABLE_KEY: "Billable", NON_BILLABLE_KEY: "Non-billable"}


@dataclass(frozen=True)
class ReportContext:
    period: DateRange
    zone: ZoneInfo
    catalog: ReportCatalog
    shown_filter: ReportFilter
    period_name: str | None = None


def render_summary_pdf(report: SummaryReport, context: ReportContext) -> bytes:
    story: list[Flowable] = [
        *header("Summary report", context),
        totals_card(report),
        Spacer(1, 6 * mm),
        card(f"Duration by {report.resolution.value}", duration_chart(report, context.catalog)),
        Spacer(1, 6 * mm),
        card(
            f"{GROUPING_TITLES[report.slice_by]} distribution",
            distribution(report, context.catalog),
        ),
        PageBreak(),
        breakdown_table(report, context.catalog),
    ]
    return build(story)


def render_detailed_pdf(
    report: SummaryReport, entries: list[TimeEntry], context: ReportContext
) -> bytes:
    story: list[Flowable] = [
        *header("Detailed report", context),
        totals_card(report),
        Spacer(1, 6 * mm),
        entries_table(entries, context),
    ]
    return build(story)


def report_filename(kind: str, context: ReportContext) -> str:
    first, last = local_bounds(context)
    return f"Tempo_{kind}_report_{first.isoformat()}_to_{last.isoformat()}.pdf"


def build(story: list[Flowable]) -> bytes:
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title="Eidos Tempo report",
        author="Eidos Tempo",
    )
    document.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return buffer.getvalue()


def draw_footer(canvas: Canvas, _document: SimpleDocTemplate) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 8 * mm, "Eidos Tempo")
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 8 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def header(title: str, context: ReportContext) -> list[Flowable]:
    first, last = local_bounds(context)
    dates = f"{format_date(first)} – {format_date(last)}"
    suffix = context.period_name or f"from {format_date(first)} to {format_date(last)}"
    logo_height = 9 * mm
    title_block = [
        Paragraph(escape(f"{title} ({suffix})"), TITLE),
        Paragraph(dates, SUBTITLE),
    ]
    logo = Image(str(LOGO_PATH), width=logo_height * LOGO_ASPECT, height=logo_height)
    table = Table([[title_block, logo]], colWidths=[CONTENT_WIDTH - 40 * mm, 40 * mm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    chips = filter_chips(context.shown_filter, context.catalog)
    if not chips:
        return [table, Spacer(1, 7 * mm)]
    return [table, Spacer(1, 4 * mm), FilterChips(chips), Spacer(1, 6 * mm)]


def filter_chips(report_filter: ReportFilter, catalog: ReportCatalog) -> list[tuple[str, str]]:
    chips = [
        choice_chip("Member", report_filter.users, catalog.users, lambda user: user.full_name),
        choice_chip("Client", report_filter.clients, catalog.clients, lambda client: client.name),
        choice_chip(
            "Project", report_filter.projects, catalog.projects, lambda project: project.name
        ),
        choice_chip("Tag", report_filter.tags, catalog.tags, lambda tag: tag.name),
    ]
    if report_filter.is_billable is not None:
        chips.append(
            ("Billable", "is billable" if report_filter.is_billable else "is non-billable")
        )
    if report_filter.description:
        description = shorten(report_filter.description, MAX_CHIP_DESCRIPTION)
        chips.append(("Description", f'contains "{description}"'))
    return [chip for chip in chips if chip is not None]


def choice_chip[K, V](
    label: str, choice: Choice[K], items: Mapping[K, V], name_of: Callable[[V], str]
) -> tuple[str, str] | None:
    if not choice.is_active:
        return None
    if choice.include_none:
        return label, "is not empty" if choice.negate else "is empty"
    names = ", ".join(name_of(items[key]) if key in items else "Unknown" for key in choice.ids)
    return label, f"{'is not' if choice.negate else 'is'} {names}"


def shorten(text: str, limit: int) -> str:
    return text if len(text) <= limit else f"{text[: limit - 1]}…"


class FilterChips(Flowable):
    FONT_SIZE = 8.5
    HEIGHT = 18.0
    PADDING = 8.0
    GAP = 6.0

    def __init__(self, chips: list[tuple[str, str]]) -> None:
        super().__init__()
        self.chips = chips
        self.rows: list[list[tuple[str, str, float]]] = []
        self.left = 0.0

    def wrap(self, available_width: float, _available_height: float) -> tuple[float, float]:
        self.left = (available_width - CONTENT_WIDTH) / 2
        self.rows = [[]]
        used = 0.0
        for label, text in self.chips:
            width = min(self.text_width(label, text) + 2 * self.PADDING, CONTENT_WIDTH)
            if self.rows[-1] and used + width > CONTENT_WIDTH:
                self.rows.append([])
                used = 0
            self.rows[-1].append((label, text, width))
            used += width + self.GAP
        return available_width, len(self.rows) * (self.HEIGHT + self.GAP) - self.GAP

    def draw(self) -> None:
        canvas = self.canv
        for index, row in enumerate(self.rows):
            y = (len(self.rows) - 1 - index) * (self.HEIGHT + self.GAP)
            x = self.left
            for label, text, width in row:
                canvas.setStrokeColor(MUTED)
                canvas.setLineWidth(0.8)
                canvas.roundRect(x, y, width, self.HEIGHT, 4, stroke=1, fill=0)
                baseline = y + (self.HEIGHT - self.FONT_SIZE) / 2 + 1.5
                canvas.setFillColor(INK)
                canvas.setFont("Helvetica-Bold", self.FONT_SIZE)
                canvas.drawString(x + self.PADDING, baseline, label)
                label_width = stringWidth(f"{label} ", "Helvetica-Bold", self.FONT_SIZE)
                canvas.setFont("Helvetica", self.FONT_SIZE)
                canvas.drawString(x + self.PADDING + label_width, baseline, text)
                x += width + self.GAP

    def text_width(self, label: str, text: str) -> float:
        return stringWidth(f"{label} ", "Helvetica-Bold", self.FONT_SIZE) + stringWidth(
            text, "Helvetica", self.FONT_SIZE
        )


def totals_card(report: SummaryReport) -> Table:
    total = report.total
    share = total.billable_seconds / total.seconds * 100 if total.seconds else 0
    cells = [
        ("Total Hours", format_duration(total.seconds)),
        (
            "Billable Hours",
            f"{format_duration(total.billable_seconds)} ({share:.2f}%)"
            if total.billable_seconds
            else "-",
        ),
        ("Average Daily Hours", f"{report.average_daily_seconds / 3600:.2f} Hours"),
    ]
    table = Table(
        [
            [Paragraph("Summary", HEADING), "", ""],
            [Paragraph(label, LABEL) for label, _ in cells],
            [Paragraph(value, VALUE) for _, value in cells],
        ],
        colWidths=[CONTENT_WIDTH / 3] * 3,
    )
    table.setStyle(
        TableStyle(
            [
                ("SPAN", (0, 0), (-1, 0)),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("LINEBEFORE", (1, 1), (-1, -1), 0.6, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, 0), 9),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
            ]
        )
    )
    return table


def card(title: str, content: Flowable) -> Table:
    table = Table([[Paragraph(title, HEADING)], [content]], colWidths=[CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, 0), 9),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
            ]
        )
    )
    return table


def duration_chart(report: SummaryReport, catalog: ReportCatalog) -> Drawing:
    width, height = CONTENT_WIDTH - 20, 80 * mm
    left = 36
    buckets = report.buckets
    slot = (width - left) / max(len(buckets), 1)
    bar_width = min(slot * 0.55, 60)
    tick_labels = [bucket_label(bucket.start, report.resolution) for bucket in buckets]
    widest_tick = max((stringWidth(label, "Helvetica", 7.5) for label in tick_labels), default=0)
    upright = slot >= widest_tick + 8 and bar_width >= stringWidth("00.00 h", "Helvetica", 7)
    bottom, top = (30, 16) if upright else (44, 30)
    plot_height = height - bottom - top
    drawing = Drawing(width, height)
    max_hours = max((bucket.duration.seconds for bucket in buckets), default=0) / 3600
    step = axis_step(max_hours)
    scale_max = step * AXIS_INTERVALS
    stack_order = stacking_order(report)
    color_of = share_colors(report.stack_by, catalog, stack_order)

    for index in range(AXIS_INTERVALS + 1):
        y = bottom + plot_height * index / AXIS_INTERVALS
        drawing.add(Line(left, y, width, y, strokeColor=LINE, strokeWidth=0.5))
        drawing.add(
            String(
                0,
                y - 2.5,
                format_axis_hours(step * index),
                fontName="Helvetica",
                fontSize=7.5,
                fillColor=MUTED,
            )
        )

    label_every = 1 if upright else max(1, math.ceil(len(buckets) / 16))
    for index, bucket in enumerate(buckets):
        x = left + slot * index + (slot - bar_width) / 2
        center = x + bar_width / 2
        seconds_by_key = {share.key: share.seconds for share in bucket.segments}
        y = float(bottom)
        for key in stack_order:
            segment_height = plot_height * seconds_by_key.get(key, 0) / 3600 / scale_max
            if segment_height:
                drawing.add(bar(x, y, bar_width, segment_height, color_of(key)))
                y += segment_height
        if bucket.duration.seconds:
            text = hours_label(bucket.duration.seconds)
            if upright:
                drawing.add(
                    String(
                        center,
                        y + 4,
                        text,
                        fontName="Helvetica",
                        fontSize=7,
                        fillColor=INK_SOFT,
                        textAnchor="middle",
                    )
                )
            else:
                label = String(0, 0, text, fontName="Helvetica", fontSize=7, fillColor=INK_SOFT)
                drawing.add(rotated(label, center + 2.5, y + 3, 90))
        if index % label_every == 0:
            if upright:
                drawing.add(
                    String(
                        center,
                        bottom - 12,
                        tick_labels[index],
                        fontName="Helvetica",
                        fontSize=7.5,
                        fillColor=INK_SOFT,
                        textAnchor="middle",
                    )
                )
            else:
                tick = String(
                    0, 0, tick_labels[index], fontName="Helvetica", fontSize=7.5, fillColor=INK_SOFT
                )
                drawing.add(rotated(tick, center, bottom - 6, 45, anchor_end=True))

    tracked = {share.key for bucket in buckets for share in bucket.segments if share.seconds}
    legend = [
        (group_label(key, report.stack_by, catalog), color_of(key))
        for key in stack_order
        if key in tracked
    ][:8]
    x = width / 2 - sum(legend_width(name) for name, _ in legend) / 2
    for name, color in legend:
        drawing.add(bar(x, 2, 10, 5, color))
        drawing.add(
            String(x + 14, 2, name[:24], fontName="Helvetica", fontSize=7, fillColor=INK_SOFT)
        )
        x += legend_width(name)
    return drawing


def legend_width(name: str) -> float:
    return 22 + len(name[:24]) * 3.6


def stacking_order(report: SummaryReport) -> list[str | None]:
    if report.stack_by is Grouping.BILLABLE:
        return [NON_BILLABLE_KEY, BILLABLE_KEY]
    totals: dict[str | None, int] = {}
    for bucket in report.buckets:
        for share in bucket.segments:
            totals[share.key] = totals.get(share.key, 0) + share.seconds
    return sorted(totals, key=lambda key: totals[key], reverse=True)


def share_colors(
    grouping: Grouping, catalog: ReportCatalog, keys: list[str | None]
) -> Callable[[str | None], colors.Color]:
    stable_order = categorical_order(grouping, catalog, keys)

    def color_of(key: str | None) -> colors.Color:
        if grouping is Grouping.BILLABLE:
            return BILLABLE if key == BILLABLE_KEY else NON_BILLABLE
        if grouping is Grouping.PROJECT:
            return colors.HexColor(project_color(project_id_of(key), catalog))
        if key is None:
            return colors.HexColor(NO_PROJECT_COLOR)
        index = stable_order.index(key) if key in stable_order else 0
        return colors.HexColor(CATEGORICAL_COLORS[index % len(CATEGORICAL_COLORS)])

    return color_of


def categorical_order(
    grouping: Grouping, catalog: ReportCatalog, keys: list[str | None]
) -> list[str]:
    present = [key for key in keys if key is not None]
    return sorted(present, key=lambda key: group_label(key, grouping, catalog).lower())


def distribution(report: SummaryReport, catalog: ReportCatalog) -> Table:
    size = 62 * mm
    drawing = Drawing(size, size)
    center, outer, inner = size / 2, size / 2 - 4, size / 2 - 22
    slices: list[Share] = [share for share in report.slices if share.seconds]
    total = sum(share.seconds for share in slices)
    color_of = share_colors(report.slice_by, catalog, [share.key for share in slices])
    angle = 90.0
    for share in slices:
        sweep = 360 * share.seconds / total
        if sweep >= 359.99:
            drawing.add(
                Circle(center, center, outer, fillColor=color_of(share.key), strokeColor=None)
            )
        else:
            wedge = Wedge(
                center,
                center,
                outer,
                angle - sweep,
                angle,
                radius1=inner,
                fillColor=color_of(share.key),
            )
            wedge.strokeColor = colors.white
            wedge.strokeWidth = 0.8
            drawing.add(wedge)
        angle -= sweep
    drawing.add(Circle(center, center, inner, fillColor=colors.white, strokeColor=None))
    drawing.add(
        String(
            center,
            center,
            format_duration(total),
            fontName="Helvetica-Bold",
            fontSize=11,
            fillColor=INK,
            textAnchor="middle",
        )
    )
    drawing.add(
        String(
            center,
            center - 11,
            GROUPING_TITLES[report.slice_by].upper(),
            fontName="Helvetica",
            fontSize=6.5,
            fillColor=MUTED,
            textAnchor="middle",
        )
    )

    legend_rows: list[list[Flowable | str]] = [
        [
            dot(color_of(share.key)),
            Paragraph(escape(group_label(share.key, report.slice_by, catalog)), CELL),
            Paragraph(percent(share.seconds, total), CELL_RIGHT),
            Paragraph(format_duration(share.seconds), CELL_RIGHT),
        ]
        for share in slices
    ] or [["", Paragraph("No time tracked", CELL), "", ""]]
    legend_width_points = CONTENT_WIDTH - 20 - size - 8 * mm
    legend = Table(legend_rows, colWidths=[12, legend_width_points - 12 - 100, 45, 55])
    legend.setStyle(
        TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 2)])
    )
    layout = Table([[drawing, legend]], colWidths=[size + 8 * mm, legend_width_points])
    layout.setStyle(
        TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0)])
    )
    return layout


def breakdown_table(report: SummaryReport, catalog: ReportCatalog) -> Table:
    group_title, subgroup_title = (
        GROUPING_TITLES[report.group_by],
        GROUPING_TITLES[report.subgroup_by],
    )
    title = f"{group_title} and {subgroup_title.lower()} breakdown"
    columns = f"{group_title} | {subgroup_title}".upper()
    total = report.total.seconds
    rows: list[list[Flowable | str]] = [
        [Paragraph(title, HEADING), "", ""],
        [
            Paragraph(columns, HEADER_CELL),
            Paragraph("DURATION", HEADER_CELL),
            Paragraph("DURATION %", HEADER_CELL),
        ],
    ]
    group_rows: list[int] = []
    for group in sorted_groups(report.groups, report.group_by, catalog):
        group_rows.append(len(rows))
        rows.append(
            [
                Paragraph(group_cell(group, report.group_by, catalog), CELL),
                Paragraph(format_duration(group.duration.seconds), CELL),
                Paragraph(percent(group.duration.seconds, total), CELL),
            ]
        )
        for subgroup in sorted_groups(group.subgroups, report.subgroup_by, catalog):
            rows.append(
                [
                    Paragraph(
                        "&nbsp;" * 6
                        + escape(group_label(subgroup.key, report.subgroup_by, catalog)),
                        CELL,
                    ),
                    Paragraph(format_duration(subgroup.duration.seconds), CELL),
                    Paragraph(percent(subgroup.duration.seconds, total), CELL),
                ]
            )
    rows.append(
        [
            Paragraph("TOTAL", HEADER_CELL),
            Paragraph(format_duration(total), CELL_BOLD),
            Paragraph("100%", CELL_BOLD),
        ]
    )
    table = Table(rows, colWidths=[CONTENT_WIDTH - 150, 80, 70], repeatRows=2)
    style: list[tuple[Any, ...]] = [
        ("SPAN", (0, 0), (-1, 0)),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    style += [("BACKGROUND", (0, row), (-1, row), CANVAS) for row in group_rows]
    table.setStyle(TableStyle(style))
    return table


def entries_table(entries: list[TimeEntry], context: ReportContext) -> Table:
    catalog = context.catalog
    title = (
        f"Time entries from {context.period_name.lower()}"
        if context.period_name
        else "Time entries"
    )
    headers = ["DESCRIPTION", "", "DURATION", "MEMBER", "PROJECT", "TAGS", "TIME | DATE"]
    blank = ["", "", "", "", "", ""]
    rows: list[list[Flowable | str]] = [
        [Paragraph(escape(title), HEADING), *blank],
        [Paragraph(header_text, HEADER_CELL) for header_text in headers],
    ]
    for entry in entries:
        start = entry.start.astimezone(context.zone)
        stop = (entry.stop or entry.start).astimezone(context.zone)
        tags = ", ".join(catalog.tags[tag].name for tag in entry.tag_ids if tag in catalog.tags)
        rows.append(
            [
                Paragraph(escape(entry.description or "-"), CELL),
                Paragraph("$", BILLABLE_SIGN) if entry.is_billable else "",
                Paragraph(format_duration(entry_seconds(entry)), CELL),
                Paragraph(escape(member_name(entry.user_id, catalog)), CELL),
                Paragraph(entry_project_cell(entry.project_id, catalog), CELL),
                Paragraph(escape(tags or "-"), CELL),
                Paragraph(
                    f"{format_time(start)} - {format_time(stop)}<br/>{format_date(start.date())}",
                    CELL,
                ),
            ]
        )
    if not entries:
        rows.append([Paragraph("No time entries match these filters.", CELL), *blank])
    widths = [0.23, 0.04, 0.1, 0.13, 0.2, 0.11, 0.19]
    table = Table(rows, colWidths=[CONTENT_WIDTH * w for w in widths], repeatRows=2)
    table.setStyle(
        TableStyle(
            [
                ("SPAN", (0, 0), (-1, 0)),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (1, 1), (1, -1), 0),
                ("RIGHTPADDING", (1, 1), (1, -1), 0),
            ]
        )
    )
    if not entries:
        table.setStyle(TableStyle([("SPAN", (0, 2), (-1, 2))]))
    return table


def sorted_groups(
    groups: list[SummaryGroup], grouping: Grouping, catalog: ReportCatalog
) -> list[SummaryGroup]:
    return sorted(
        groups,
        key=lambda group: (group.key is None, group_label(group.key, grouping, catalog).lower()),
    )


def group_cell(group: SummaryGroup, grouping: Grouping, catalog: ReportCatalog) -> str:
    if grouping is Grouping.PROJECT:
        return project_cell(project_id_of(group.key), catalog)
    return f"<b>{escape(group_label(group.key, grouping, catalog))}</b>"


def group_label(key: str | None, grouping: Grouping, catalog: ReportCatalog) -> str:
    if not key:
        return EMPTY_GROUP_LABELS[grouping]
    if grouping is Grouping.PROJECT:
        return project_label(project_id_of(key), catalog)
    if grouping is Grouping.CLIENT:
        client = catalog.clients.get(ClientId(UUID(key)))
        return client.name if client else EMPTY_GROUP_LABELS[grouping]
    if grouping is Grouping.MEMBER:
        return member_name(UserId(UUID(key)), catalog)
    if grouping is Grouping.BILLABLE:
        return BILLABLE_LABELS.get(key, key)
    return key


def project_label(project_id: ProjectId | None, catalog: ReportCatalog) -> str:
    project = catalog.projects.get(project_id) if project_id else None
    if project is None:
        return "Without project"
    client = catalog.clients.get(project.client_id) if project.client_id else None
    return f"{project.name} • {client.name}" if client else project.name


def project_cell(project_id: ProjectId | None, catalog: ReportCatalog) -> str:
    project = catalog.projects.get(project_id) if project_id else None
    if project is None:
        return '<font color="#8A88A8">Without project</font>'
    client = catalog.clients.get(project.client_id) if project.client_id else None
    name = f'<font color="{project.color.value}"><b>{escape(project.name)}</b></font>'
    return f'{name} <font color="#8A88A8">• {escape(client.name)}</font>' if client else name


def entry_project_cell(project_id: ProjectId | None, catalog: ReportCatalog) -> str:
    project = catalog.projects.get(project_id) if project_id else None
    if project is None:
        return '<font color="#8A88A8">Without project</font>'
    client = catalog.clients.get(project.client_id) if project.client_id else None
    color = project.color.value
    name = f'<font color="{color}">•</font> <font color="{color}">{escape(project.name)}</font>'
    return f'{name}<br/><font color="#8A88A8">• {escape(client.name)}</font>' if client else name


def project_color(project_id: ProjectId | None, catalog: ReportCatalog) -> str:
    project = catalog.projects.get(project_id) if project_id else None
    return project.color.value if project else NO_PROJECT_COLOR


def member_name(user_id: UserId, catalog: ReportCatalog) -> str:
    user = catalog.users.get(user_id)
    return user.full_name if user else "Unknown member"


def project_id_of(key: str | None) -> ProjectId | None:
    return ProjectId(UUID(key)) if key else None


def dot(color: colors.Color) -> Drawing:
    drawing = Drawing(8, 8)
    drawing.add(Circle(4, 4, 3.5, fillColor=color, strokeColor=None))
    return drawing


def bar(x: float, y: float, width: float, height: float, color: colors.Color) -> Rect:
    rect = Rect(x, y, width, height, rx=1.5, ry=1.5)
    rect.fillColor = color
    rect.strokeColor = None
    return rect


def rotated(label: String, x: float, y: float, degrees: float, anchor_end: bool = False) -> Group:
    label.textAnchor = "end" if anchor_end else "start"
    group = Group(label)
    group.translate(x, y)
    group.rotate(degrees)
    return group


def axis_step(max_hours: float) -> float:
    quarters = math.ceil(max_hours / AXIS_INTERVALS / QUARTER_HOUR)
    return max(quarters, 1) * QUARTER_HOUR


def hours_label(seconds: int) -> str:
    return f"{round(seconds / 3600, 2):g} h"


def bucket_label(start: date, resolution: Resolution) -> str:
    if resolution is Resolution.MONTH:
        return start.strftime("%b %Y")
    if resolution is Resolution.WEEK:
        return f"W{start.isocalendar().week} {start.strftime('%m/%d')}"
    return start.strftime("%a %m/%d")


def local_bounds(context: ReportContext) -> tuple[date, date]:
    first = context.period.start.astimezone(context.zone).date()
    last = (context.period.end - timedelta(microseconds=1)).astimezone(context.zone).date()
    return first, last


def format_duration(seconds: int) -> str:
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}"


def format_axis_hours(hours: float) -> str:
    whole = int(hours)
    minutes = round((hours - whole) * 60)
    return f"{whole}h" if not minutes else f"{whole}h {minutes:02d}"


def format_date(day: date) -> str:
    return day.strftime("%m/%d/%Y")


def format_time(moment: datetime) -> str:
    return moment.strftime("%I:%M %p").lstrip("0")


def percent(seconds: int, total: int) -> str:
    return f"{seconds / total * 100:.2f}%" if total else "0%"
