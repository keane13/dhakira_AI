"""
Hash-chained audit log. Every event stores the hash of the one before it, so an
edited or deleted event is detected by `verify`. Writes are serialised by a lock;
with several app instances, use a database-side lock or a single writer.
"""
from __future__ import annotations

import hashlib
import json
import threading
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import AuditEvent, User, utcnow

GENESIS = "0" * 64
_lock = threading.Lock()


def _digest(prev: str, at: str, user_id: int | None, role: str | None, action: str, case_id: str | None, record_id: str | None, detail: str) -> str:
    body = json.dumps([prev, at, user_id, role, action, case_id, record_id, detail], separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(body.encode()).hexdigest()


def append(db: Session, user: User | None, action: str, case_id: str | None = None, record_id: str | None = None, detail: dict[str, Any] | None = None) -> AuditEvent:
    """Adds one event to the session. The caller commits, so the event and the change land together."""
    with _lock:
        last = db.scalars(select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(1)).first()
        prev = last.hash if last else GENESIS
        at = utcnow().isoformat()
        # Never patient names or free text: identifiers, kinds and reasons only.
        text = json.dumps(detail or {}, separators=(",", ":"), sort_keys=True, ensure_ascii=False)
        uid = user.id if user else None
        role = user.role if user else None
        event = AuditEvent(at=at, user_id=uid, role=role, action=action, case_id=case_id, record_id=record_id, detail=text, prev_hash=prev,
                           hash=_digest(prev, at, uid, role, action, case_id, record_id, text))
        db.add(event)
        db.flush()
        return event


def verify(db: Session) -> dict[str, Any]:
    prev = GENESIS
    checked = 0
    for e in db.scalars(select(AuditEvent).order_by(AuditEvent.seq)):
        expected = _digest(prev, e.at, e.user_id, e.role, e.action, e.case_id, e.record_id, e.detail)
        if e.prev_hash != prev or e.hash != expected:
            return {"ok": False, "checked": checked, "broken_at": e.seq}
        prev = e.hash
        checked += 1
    return {"ok": True, "checked": checked, "broken_at": None}
