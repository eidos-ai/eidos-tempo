from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    MetaData,
    SmallInteger,
    String,
    Table,
    false,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool]
    calendar_zoom: Mapped[int] = mapped_column(SmallInteger)
    default_view: Mapped[str] = mapped_column(String(20))
    days_shown: Mapped[int] = mapped_column(SmallInteger)
    theme: Mapped[str] = mapped_column(String(10), server_default="light")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuthSessionRow(Base):
    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ClientRow(Base):
    __tablename__ = "clients"
    __table_args__ = (Index("uq_clients_name_lower", func.lower(text("name")), unique=True),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    is_archived: Mapped[bool]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ProjectRow(Base):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    color: Mapped[str] = mapped_column(String(7))
    client_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("clients.id", ondelete="RESTRICT"), index=True
    )
    is_billable: Mapped[bool]
    is_archived: Mapped[bool]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TagRow(Base):
    __tablename__ = "tags"
    __table_args__ = (Index("uq_tags_name_lower", func.lower(text("name")), unique=True),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    is_archived: Mapped[bool]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


time_entry_tags = Table(
    "time_entry_tags",
    Base.metadata,
    Column("time_entry_id", ForeignKey("time_entries.id", ondelete="RESTRICT"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="RESTRICT"), primary_key=True, index=True),
)


class TimeEntryRow(Base):
    __tablename__ = "time_entries"
    __table_args__ = (
        Index("ix_time_entries_user_start", "user_id", "start"),
        Index(
            "uq_time_entries_one_running_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("stop IS NULL AND deleted_at IS NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    project_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    description: Mapped[str] = mapped_column(String(500))
    is_billable: Mapped[bool] = mapped_column(server_default=false())
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    stop: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tags: Mapped[list[TagRow]] = relationship(secondary=time_entry_tags, lazy="selectin")


class ImportLinkRow(Base):
    __tablename__ = "import_links"

    source: Mapped[str] = mapped_column(String(20), primary_key=True)
    entity: Mapped[str] = mapped_column(String(20), primary_key=True)
    external_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    internal_id: Mapped[UUID]
