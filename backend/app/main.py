"""
Dhakira API.

What the server enforces, whatever the client sends:
- who is signed in (opaque, hashed, expiring tokens; rate-limited sign-in);
- that only a doctor can approve or return a review;
- that every clinical entry passes the same validation as the interface;
- that new clinical information clears an earlier sign-off;
- that nothing is deleted: entries are retracted with who and why;
- that every change lands in a hash-chained audit log;
- in this prototype, that only fictional case identifiers are accepted.

Run locally:  .venv/Scripts/python -m uvicorn app.main:create_app --factory --reload --port 8000
"""

import re
import secrets
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit
from .config import Settings, load_settings
from .db import AuditEvent, AuthSession, Record, User, make_sessionmaker, utcnow
from .schemas import KINDS, DemoIn, LoginIn, RecordIn, RecordOut, RegisterIn, TokenOut, UserOut
from .security import LoginLimiter, burn_time, hash_password, new_token, token_hash, verify_password

API_VERSION = "1.0.0"

DEMO_ACCOUNTS = {
    "doctor": ("demo-doctor@dhakira.test", "Dr Amal (demo)"),
    "nurse": ("demo-nurse@dhakira.test", "Nurse Sara (demo)"),
}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    SessionLocal = make_sessionmaker(settings.database_url)
    limiter = LoginLimiter(settings.login_attempts, settings.login_window_seconds)
    case_re = re.compile(settings.case_id_pattern)

    app = FastAPI(
        title="Dhakira API",
        version=API_VERSION,
        description="Accounts, clinical records, role rules and audit for the Dhakira brain health prototype. Fictional patients only.",
        docs_url=None if settings.production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.production else "/api/openapi.json",
    )
    app.state.settings = settings
    app.state.SessionLocal = SessionLocal

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.middleware("http")
    async def guard(request: Request, call_next):
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > settings.max_body_bytes:
            return JSONResponse({"detail": "Request too large"}, status_code=413)
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    # ------------------------------ dependencies ------------------------------

    def get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    Db = Annotated[Session, Depends(get_db)]

    def current_user(db: Db, authorization: Annotated[str | None, Header()] = None) -> User:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in first", headers={"WWW-Authenticate": "Bearer"})
        session = db.scalars(select(AuthSession).where(AuthSession.token_hash == token_hash(authorization[7:].strip()))).first()
        now = utcnow()
        if not session or session.revoked_at is not None or _aware(session.expires_at) <= now:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or signed out", headers={"WWW-Authenticate": "Bearer"})
        user = db.get(User, session.user_id)
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
        return user

    Me = Annotated[User, Depends(current_user)]

    def check_case(case_id: str) -> str:
        if not case_re.match(case_id):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This prototype accepts fictional case identifiers only")
        return case_id

    def issue(db: Session, user: User) -> TokenOut:
        token, digest = new_token()
        expires = utcnow() + timedelta(hours=settings.token_ttl_hours)
        db.add(AuthSession(token_hash=digest, user_id=user.id, expires_at=expires))
        return TokenOut(token=token, expires_at=expires, user=_user_out(user))

    # --------------------------------- health ---------------------------------

    @app.get("/api/health")
    def health(db: Db) -> dict[str, Any]:
        db.execute(select(1))
        return {"ok": True, "version": API_VERSION, "env": settings.env}

    # ---------------------------------- auth ----------------------------------

    @app.post("/api/auth/register", status_code=201)
    def register(body: RegisterIn, db: Db) -> TokenOut:
        if not settings.allow_registration:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Accounts are created by an administrator")
        if db.scalars(select(User).where(User.email == body.email)).first():
            raise HTTPException(status.HTTP_409_CONFLICT, "email_taken")
        user = User(email=body.email, name=body.name, role=body.role, facility=body.facility, password_hash=hash_password(body.password))
        db.add(user)
        db.flush()
        out = issue(db, user)
        audit.append(db, user, "account.register")
        db.commit()
        return out

    @app.post("/api/auth/login")
    def login(body: LoginIn, request: Request, db: Db) -> TokenOut:
        email = body.email.strip().lower()
        key = f"{request.client.host if request.client else '?'}|{email}"
        if limiter.blocked(key):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Wait 15 minutes.")
        user = db.scalars(select(User).where(User.email == email)).first()
        if not user:
            burn_time(body.password)
        if not user or not verify_password(body.password, user.password_hash):
            limiter.fail(key)
            audit.append(db, None, "account.login_failed")
            db.commit()
            # Same message for an unknown email and a wrong password.
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad_credentials")
        limiter.reset(key)
        out = issue(db, user)
        audit.append(db, user, "account.login")
        db.commit()
        return out

    @app.post("/api/auth/demo")
    def demo(body: DemoIn, db: Db) -> TokenOut:
        if not settings.allow_demo:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Demo accounts are switched off")
        email, name = DEMO_ACCOUNTS[body.role]
        user = db.scalars(select(User).where(User.email == email)).first()
        if not user:
            user = User(email=email, name=name, role=body.role, facility="Demo wellness clinic", demo=True, password_hash=hash_password(secrets.token_urlsafe(24)))
            db.add(user)
            db.flush()
        out = issue(db, user)
        audit.append(db, user, "account.demo_login")
        db.commit()
        return out

    @app.post("/api/auth/logout", status_code=204)
    def logout(db: Db, me: Me, authorization: Annotated[str | None, Header()] = None) -> Response:
        session = db.scalars(select(AuthSession).where(AuthSession.token_hash == token_hash((authorization or "")[7:].strip()))).first()
        if session:
            session.revoked_at = utcnow()
        audit.append(db, me, "account.logout")
        db.commit()
        return Response(status_code=204)

    @app.get("/api/auth/me")
    def me_route(me: Me) -> UserOut:
        return _user_out(me)

    # -------------------------------- records ---------------------------------

    def active(db: Session, case_id: str | None = None) -> list[Record]:
        q = select(Record).where(Record.retracted_at.is_(None)).order_by(Record.created_at, Record.id)
        if case_id:
            q = q.where(Record.case_id == case_id)
        return list(db.scalars(q))

    def names(db: Session, records: list[Record]) -> dict[int, str]:
        ids = {r.created_by for r in records}
        return {u.id: u.name for u in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}

    def out(r: Record, who: dict[int, str]) -> RecordOut:
        return RecordOut(id=r.id, case_id=r.case_id, kind=r.kind, key=r.key, payload=r.payload, created_at=r.created_at, created_by=who.get(r.created_by, "?"))

    def retract(db: Session, me: User, r: Record, reason: str) -> None:
        r.retracted_at = utcnow()
        r.retracted_by = me.id
        r.retract_reason = reason[:200]
        audit.append(db, me, "record.retract", r.case_id, r.id, {"kind": r.kind, "reason": reason[:200]})

    @app.get("/api/records")
    def all_records(db: Db, me: Me) -> dict[str, list[RecordOut]]:
        """Every active record, grouped by case. The client recomputes routes from these."""
        records = active(db)
        who = names(db, records)
        grouped: dict[str, list[RecordOut]] = defaultdict(list)
        for r in records:
            grouped[r.case_id].append(out(r, who))
        return dict(grouped)

    @app.get("/api/cases/{case_id}/records")
    def case_records(case_id: str, db: Db, me: Me) -> list[RecordOut]:
        check_case(case_id)
        records = active(db, case_id)
        who = names(db, records)
        return [out(r, who) for r in records]

    @app.post("/api/cases/{case_id}/records/{kind}", status_code=201)
    def create_record(case_id: str, kind: str, body: RecordIn, db: Db, me: Me) -> RecordOut:
        check_case(case_id)
        spec = KINDS.get(kind)
        if not spec:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown record kind")
        try:
            payload = spec.model.model_validate(body.payload).model_dump()
        except ValidationError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, _errors(exc)) from exc

        # Attribution comes from the session, never from the request body.
        if kind == "decision":
            if payload["status"] in ("approved", "returned") and me.role != "doctor":
                audit.append(db, me, "record.denied", case_id, None, {"kind": kind, "status": payload["status"]})
                db.commit()
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a doctor can approve or return a review")
            payload["reviewer"] = me.name
            payload["reviewerRole"] = me.role
        for field in ("enteredBy", "givenBy"):
            if field in payload:
                payload[field] = me.name

        record_id = body.id or f"{kind}-{secrets.token_hex(8)}"
        if db.get(Record, record_id):
            raise HTTPException(status.HTTP_409_CONFLICT, "A record with this id exists")
        key = str(payload[spec.key_field]) if spec.key_field else None

        # Latest wins for single and keyed kinds: the previous one is retracted, not overwritten.
        if spec.single or spec.key_field:
            for old in active(db, case_id):
                if old.kind == kind and old.key == key:
                    retract(db, me, old, "superseded")
        if spec.clears_sign_off:
            for old in active(db, case_id):
                if old.kind == "decision":
                    retract(db, me, old, f"new clinical information: {kind}")

        record = Record(id=record_id, case_id=case_id, kind=kind, key=key, payload=payload, created_by=me.id)
        db.add(record)
        audit.append(db, me, "record.create", case_id, record_id, {"kind": kind, **({"status": payload["status"]} if kind == "decision" else {})})
        db.commit()
        return out(record, {me.id: me.name})

    @app.delete("/api/cases/{case_id}/records/{kind}/{record_id}", status_code=204)
    def delete_record(case_id: str, kind: str, record_id: str, db: Db, me: Me, reason: str = "removed by user") -> Response:
        check_case(case_id)
        r = db.get(Record, record_id)
        if not r or r.case_id != case_id or r.kind != kind or r.retracted_at is not None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No active record")
        if kind == "decision" and r.payload.get("status") in ("approved", "returned") and me.role != "doctor":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a doctor can withdraw a doctor's decision")
        retract(db, me, r, reason)
        spec = KINDS.get(kind)
        if spec and spec.clears_sign_off:
            for old in active(db, case_id):
                if old.kind == "decision":
                    retract(db, me, old, f"clinical information removed: {kind}")
        db.commit()
        return Response(status_code=204)

    @app.delete("/api/cases/{case_id}/records/{kind}", status_code=204)
    def delete_latest(case_id: str, kind: str, db: Db, me: Me, key: str | None = None) -> Response:
        """Withdraws the active record of a single or keyed kind, for example the current decision."""
        check_case(case_id)
        matches = [r for r in active(db, case_id) if r.kind == kind and r.key == key]
        if not matches:
            return Response(status_code=204)
        return delete_record(case_id, kind, matches[-1].id, db, me, "withdrawn by user")

    # --------------------------------- audit ----------------------------------

    @app.get("/api/audit")
    def audit_log(db: Db, me: Me, case_id: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        if me.role != "doctor":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Doctors only")
        q = select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(max(1, min(limit, 1000)))
        if case_id:
            q = q.where(AuditEvent.case_id == check_case(case_id))
        return [{"seq": e.seq, "at": e.at, "user_id": e.user_id, "role": e.role, "action": e.action, "case_id": e.case_id, "record_id": e.record_id, "detail": e.detail, "hash": e.hash} for e in db.scalars(q)]

    @app.get("/api/audit/verify")
    def audit_verify(db: Db, me: Me) -> dict[str, Any]:
        return audit.verify(db)

    # ------------------------------ static files ------------------------------

    static = Path(settings.static_dir) if settings.static_dir else None
    if static and static.is_dir():
        index = static / "index.html"

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> FileResponse:
            if path.startswith("api/"):
                raise HTTPException(status.HTTP_404_NOT_FOUND)
            target = (static / path).resolve()
            if path and target.is_file() and static.resolve() in target.parents:
                return FileResponse(target)
            return FileResponse(index)

    return app


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _user_out(u: User) -> UserOut:
    return UserOut(name=u.name, email=u.email, role=u.role, facility=u.facility, demo=u.demo)


def _errors(exc: ValidationError) -> list[dict[str, Any]]:
    return [{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors(include_url=False, include_input=False)]
