from enum import StrEnum

FIRST_TEMPO_NUMBER = 10_000_000_000
"""Numbers below this are Toggl ids kept from the import, so data scripts stored still matches."""


class NumberedEntity(StrEnum):
    USER = "user"
    CLIENT = "client"
    PROJECT = "project"
    TAG = "tag"
    TIME_ENTRY = "time_entry"
