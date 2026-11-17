"""API tests: each one targets a rule the server must enforce on its own."""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from app.config import Settings
from app.db import AuditEvent
from app.main import create_app

TODAY = date.today().isoformat()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app(Settings(database_url="sqlite://", login_attempts=3)))


def demo(client: TestClient, role: str) -> dict[str, str]:
    r = client.post("/api/auth/demo", json={"role": role})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def decision(status: str = "approved") -> dict:
    return {
        "reviewer": "anyone", "reviewerRole": "doctor", "summary": "s", "stillToClarify": "", "assessment": "a",
        "nextStep": "Refer for qualified review", "contributors": ["medicines", "sleep"], "route": "qualified_review",
        "services": ["geriatrics"], "rationale": "r", "followUpDays": 28, "summaryConfirmed": True,
        "contributorsReviewed": True, "status": status, "decidedAt": TODAY,
    }


def lab(**over) -> dict:
    return {"id": "lab-x1", "test": "b12", "value": 150, "date": TODAY, "low": 200, "high": 900, "enteredBy": "x", **over}


# ---------------------------------------------------------------- accounts

def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json()["ok"] is True


def test_register_login_me_logout(client: TestClient) -> None:
    r = client.post("/api/auth/register", json={"name": "Dr Test", "email": "Test@Example.org", "password": "long-enough-1", "role": "doctor", "facility": "Clinic"})
    assert r.status_code == 201
    assert client.post("/api/auth/register", json={"name": "B", "email": "test@example.org", "password": "long-enough-1", "role": "nurse"}).status_code == 409
    token = client.post("/api/auth/login", json={"email": "test@example.org", "password": "long-enough-1"}).json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=h).json()["email"] == "test@example.org"
    assert client.post("/api/auth/logout", headers=h).status_code == 204
    assert client.get("/api/auth/me", headers=h).status_code == 401


def test_wrong_password_and_unknown_email_look_the_same(client: TestClient) -> None:
    client.post("/api/auth/register", json={"name": "A", "email": "a@b.co", "password": "long-enough-1", "role": "nurse"})
    wrong = client.post("/api/auth/login", json={"email": "a@b.co", "password": "nope-nope-1"})
    unknown = client.post("/api/auth/login", json={"email": "z@b.co", "password": "nope-nope-1"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_login_is_rate_limited(client: TestClient) -> None:
    client.post("/api/auth/register", json={"name": "A", "email": "a@b.co", "password": "long-enough-1", "role": "nurse"})
    for _ in range(3):
        client.post("/api/auth/login", json={"email": "a@b.co", "password": "wrong-wrong"})
    assert client.post("/api/auth/login", json={"email": "a@b.co", "password": "long-enough-1"}).status_code == 429


def test_short_password_and_bad_email_rejected(client: TestClient) -> None:
    assert client.post("/api/auth/register", json={"name": "A", "email": "a@b.co", "password": "short", "role": "nurse"}).status_code == 422
    assert client.post("/api/auth/register", json={"name": "A", "email": "not-an-email", "password": "long-enough-1", "role": "nurse"}).status_code == 422


def test_records_need_a_session(client: TestClient) -> None:
    assert client.get("/api/records").status_code == 401
    assert client.get("/api/records", headers={"Authorization": "Bearer forged"}).status_code == 401


def test_production_switches_off_demo_and_registration() -> None:
    c = TestClient(create_app(Settings(env="production", database_url="sqlite://", allow_demo=False, allow_registration=False, cors_origins=[])))
    assert c.post("/api/auth/demo", json={"role": "doctor"}).status_code == 403
    assert c.post("/api/auth/register", json={"name": "A", "email": "a@b.co", "password": "long-enough-1", "role": "doctor"}).status_code == 403
    assert c.get("/api/docs").status_code == 404


# ----------------------------------------------------------------- records

def test_only_a_doctor_can_approve(client: TestClient) -> None:
    nurse, doctor = demo(client, "nurse"), demo(client, "doctor")
    assert client.post("/api/cases/SYN-102/records/decision", json={"payload": decision("approved")}, headers=nurse).status_code == 403
    prepared = client.post("/api/cases/SYN-102/records/decision", json={"payload": decision("prepared")}, headers=nurse)
    assert prepared.status_code == 201
    # Attribution comes from the session, not the body.
    assert prepared.json()["payload"]["reviewer"] == "Nurse Sara (demo)"
    assert prepared.json()["payload"]["reviewerRole"] == "nurse"
    approved = client.post("/api/cases/SYN-102/records/decision", json={"payload": decision("approved")}, headers=doctor)
    assert approved.status_code == 201
    active = [r for r in client.get("/api/cases/SYN-102/records", headers=doctor).json() if r["kind"] == "decision"]
    assert [r["payload"]["status"] for r in active] == ["approved"]


def test_new_clinical_information_clears_the_sign_off(client: TestClient) -> None:
    doctor = demo(client, "doctor")
    client.post("/api/cases/SYN-102/records/decision", json={"payload": decision()}, headers=doctor)
    assert client.post("/api/cases/SYN-102/records/lab", json={"id": "lab-abcd1", "payload": lab()}, headers=doctor).status_code == 201
    kinds = [r["kind"] for r in client.get("/api/cases/SYN-102/records", headers=doctor).json()]
    assert "decision" not in kinds and "lab" in kinds


def test_lab_validation_matches_the_interface(client: TestClient) -> None:
    h = demo(client, "nurse")
    post = lambda p: client.post("/api/cases/SYN-102/records/lab", json={"payload": p}, headers=h).status_code
    assert post(lab(low=None, high=None)) == 422
    assert post(lab(low=900, high=200)) == 422
    assert post(lab(date=(date.today() + timedelta(days=5)).isoformat())) == 422
    assert post(lab(test="cholesterol")) == 422
    assert post(lab(value=-1)) == 422
    assert post(lab(extra_field=1)) == 422
    assert post(lab()) == 201


def test_instrument_and_observation_rules(client: TestClient) -> None:
    h = demo(client, "nurse")
    base = {"instrument": "minicog", "score": 3, "date": TODAY, "version": "Arabic", "reading": "attention", "givenBy": "x", "trained": True}
    assert client.post("/api/cases/SYN-102/records/instrument", json={"payload": {**base, "score": 6}}, headers=h).status_code == 422
    assert client.post("/api/cases/SYN-102/records/instrument", json={"payload": {**base, "trained": False}}, headers=h).status_code == 422
    assert client.post("/api/cases/SYN-102/records/instrument", json={"payload": base}, headers=h).status_code == 201
    obs = {
        "visit": 6, "date": TODAY, "score": 7, "language": "ar", "mode": "visual", "form": "C",
        "conditions": {"poorSleep": False, "fasting": False, "lowMood": False, "distraction": False, "aidsWorn": False, "assisted": False},
        "source": "live-check", "administration": "device", "parts": {"recall": 2, "sequence": 2, "search": 1, "switching": 2},
    }
    fr = {"date": TODAY, "reporter": "self", "level": 0, "note": {"en": "No change", "ar": "x"}, "source": "live-check"}
    assert client.post("/api/cases/SYN-102/records/observation", json={"payload": {"observation": obs, "functionReport": fr}}, headers=h).status_code == 201
    bad = {**obs, "score": 9}
    assert client.post("/api/cases/SYN-102/records/observation", json={"payload": {"observation": bad, "functionReport": fr}}, headers=h).status_code == 422


def test_keyed_kinds_keep_only_the_latest(client: TestClient) -> None:
    h = demo(client, "nurse")
    for granted in (False, True):
        client.post("/api/cases/SYN-102/records/consent", json={"payload": {"scope": "wearable", "granted": granted}}, headers=h)
    client.post("/api/cases/SYN-102/records/consent", json={"payload": {"scope": "genomic", "granted": True}}, headers=h)
    consent = [r["payload"] for r in client.get("/api/cases/SYN-102/records", headers=h).json() if r["kind"] == "consent"]
    assert sorted((c["scope"], c["granted"]) for c in consent) == [("genomic", True), ("wearable", True)]


def test_only_fictional_case_ids(client: TestClient) -> None:
    h = demo(client, "doctor")
    assert client.get("/api/cases/784-1980-1234567-1/records", headers=h).status_code == 400
    assert client.post("/api/cases/PATIENT-1/records/lab", json={"payload": lab()}, headers=h).status_code == 400


def test_retracted_not_deleted(client: TestClient) -> None:
    h = demo(client, "nurse")
    client.post("/api/cases/SYN-102/records/lab", json={"id": "lab-keep1", "payload": lab()}, headers=h)
    assert client.delete("/api/cases/SYN-102/records/lab/lab-keep1", headers=h).status_code == 204
    assert client.get("/api/cases/SYN-102/records", headers=h).json() == []
    doctor = demo(client, "doctor")
    actions = [e["action"] for e in client.get("/api/audit?case_id=SYN-102", headers=doctor).json()]
    assert "record.retract" in actions and "record.create" in actions


def test_nurse_cannot_withdraw_a_doctor_decision(client: TestClient) -> None:
    nurse, doctor = demo(client, "nurse"), demo(client, "doctor")
    client.post("/api/cases/SYN-102/records/decision", json={"payload": decision()}, headers=doctor)
    assert client.delete("/api/cases/SYN-102/records/decision", headers=nurse).status_code == 403
    assert client.delete("/api/cases/SYN-102/records/decision", headers=doctor).status_code == 204


# ------------------------------------------------------------------- audit

def test_audit_chain_detects_tampering(client: TestClient) -> None:
    doctor = demo(client, "doctor")
    client.post("/api/cases/SYN-102/records/lab", json={"payload": lab()}, headers=doctor)
    assert client.get("/api/audit/verify", headers=doctor).json()["ok"] is True
    SessionLocal = client.app.state.SessionLocal
    with SessionLocal() as db:
        db.execute(update(AuditEvent).where(AuditEvent.seq == 2).values(action="record.forged"))
        db.commit()
    result = client.get("/api/audit/verify", headers=doctor).json()
    assert result["ok"] is False and result["broken_at"] == 2


def test_audit_is_for_doctors_and_holds_no_free_text(client: TestClient) -> None:
    nurse, doctor = demo(client, "nurse"), demo(client, "doctor")
    client.post("/api/cases/SYN-102/records/medicine", json={"payload": {
        "id": "med-abcd1", "name": "Secret sleep aid", "dose": "1 at night", "source": "patient", "confirmed": False,
        "withoutPrescription": True, "anticholinergic": False, "cnsActive": True, "date": TODAY, "enteredBy": "x"}}, headers=nurse)
    assert client.get("/api/audit", headers=nurse).status_code == 403
    log = client.get("/api/audit", headers=doctor).json()
    assert all("Secret" not in e["detail"] for e in log)


def test_security_headers_and_body_limit(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["cache-control"] == "no-store"
    h = demo(client, "nurse")
    big = {"payload": {**lab(), "enteredBy": "x" * 70_000}}
    assert client.post("/api/cases/SYN-102/records/lab", json=big, headers=h).status_code == 413
