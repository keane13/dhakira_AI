"""Database models. SQLite for local runs; any SQLAlchemy URL (PostgreSQL, Azure SQL) in production."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(16))
    facility: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    demo: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuthSession(Base):
    """Opaque bearer tokens. Only a SHA-256 of the token is stored, so a database leak does not leak sessions."""
    __tablename__ = "auth_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Record(Base):
    """
    One clinical entry for one case. Records are never deleted: removing or replacing
    one sets `retracted_at` with who and why, so the history stays reviewable.
    """
    __tablename__ = "records"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    case_id: Mapped[str] = mapped_column(String(32), index=True)
    kind: Mapped[str] = mapped_column(String(24), index=True)
    key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    retracted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retracted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    retract_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)


class AuditEvent(Base):
    """Append-only. Each event stores the hash of the previous one, so any edit or deletion breaks the chain."""
    __tablename__ = "audit_events"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[str] = mapped_column(String(40))
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role: Mapped[str | None] = mapped_column(String(16), nullable=True)
    action: Mapped[str] = mapped_column(String(48))
    case_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    record_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="{}")
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))


def make_sessionmaker(url: str) -> sessionmaker:
    if url.startswith("sqlite"):
        memory = url in {"sqlite://", "sqlite:///:memory:"}
        engine = create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool if memory else None,
        )
    else:
        engine = create_engine(url, pool_pre_ping=True)
    # Prototype schema creation. A production deployment would use migrations (Alembic).
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)
