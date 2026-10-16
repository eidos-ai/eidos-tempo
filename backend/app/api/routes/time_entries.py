from uuid import UUID

from fastapi import APIRouter, status
from pydantic import AwareDatetime

from app.api.deps import CurrentUser, TimeEntryServiceDep
from app.api.schemas.time_entries import (
    EntrySuggestionOut,
    SplitIn,
    SplitOut,
    TimeEntryIn,
    TimeEntryOut,
    TimerStartIn,
    TimerStopIn,
    TrackingStoryOut,
)
from app.domain.ids import TimeEntryId
from app.domain.value_objects import DateRange

router = APIRouter(prefix="/time-entries", tags=["time entries"])


@router.get("")
def list_entries(
    start: AwareDatetime, end: AwareDatetime, actor: CurrentUser, entries: TimeEntryServiceDep
) -> list[TimeEntryOut]:
    period = DateRange(start=start, end=end)
    return [TimeEntryOut.from_domain(entry) for entry in entries.list_entries(actor, period)]


@router.get("/suggestions")
def list_suggestions(actor: CurrentUser, entries: TimeEntryServiceDep) -> list[EntrySuggestionOut]:
    return [EntrySuggestionOut.from_domain(s) for s in entries.list_suggestions(actor)]


@router.get("/story")
def get_story(timezone: str, actor: CurrentUser, entries: TimeEntryServiceDep) -> TrackingStoryOut:
    return TrackingStoryOut.from_domain(entries.get_story(actor, timezone))


@router.get("/running")
def get_running(actor: CurrentUser, entries: TimeEntryServiceDep) -> TimeEntryOut | None:
    running = entries.get_running(actor)
    return TimeEntryOut.from_domain(running) if running else None


@router.post("/start", status_code=status.HTTP_201_CREATED)
def start_timer(
    body: TimerStartIn, actor: CurrentUser, entries: TimeEntryServiceDep
) -> TimeEntryOut:
    return TimeEntryOut.from_domain(entries.start_timer(actor, body.to_command()))


@router.post("/stop")
def stop_timer(
    actor: CurrentUser, entries: TimeEntryServiceDep, body: TimerStopIn | None = None
) -> TimeEntryOut:
    return TimeEntryOut.from_domain(entries.stop_timer(actor, body.stop if body else None))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_entry(
    body: TimeEntryIn, actor: CurrentUser, entries: TimeEntryServiceDep
) -> TimeEntryOut:
    return TimeEntryOut.from_domain(entries.create_entry(actor, body.to_draft()))


@router.put("/{entry_id}")
def update_entry(
    entry_id: UUID, body: TimeEntryIn, actor: CurrentUser, entries: TimeEntryServiceDep
) -> TimeEntryOut:
    entry = entries.update_entry(actor, TimeEntryId(entry_id), body.to_draft())
    return TimeEntryOut.from_domain(entry)


@router.post("/{entry_id}/split", status_code=status.HTTP_201_CREATED)
def split_entry(
    entry_id: UUID, body: SplitIn, actor: CurrentUser, entries: TimeEntryServiceDep
) -> SplitOut:
    return SplitOut.from_domain(entries.split_entry(actor, TimeEntryId(entry_id), body.at))


@router.post("/{entry_id}/duplicate", status_code=status.HTTP_201_CREATED)
def duplicate_entry(
    entry_id: UUID, actor: CurrentUser, entries: TimeEntryServiceDep
) -> TimeEntryOut:
    return TimeEntryOut.from_domain(entries.duplicate_entry(actor, TimeEntryId(entry_id)))


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: UUID, actor: CurrentUser, entries: TimeEntryServiceDep) -> None:
    entries.delete_entry(actor, TimeEntryId(entry_id))
