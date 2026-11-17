"""
Request and record schemas. They mirror the TypeScript types and validators in
src/engine, so the server rejects what the interface would reject, even when a
request does not come from the interface.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

Role = Literal["doctor", "nurse"]
Short = Annotated[str, Field(max_length=200)]
Long = Annotated[str, Field(max_length=4000)]


def _check_date(v: str) -> str:
    """ISO date, not later than tomorrow in UTC (one day of slack for time zones)."""
    try:
        d = date.fromisoformat(v)
    except ValueError as exc:
        raise ValueError("must be a date written YYYY-MM-DD") from exc
    if d > datetime.now(timezone.utc).date() + timedelta(days=1):
        raise ValueError("cannot be in the future")
    return v


IsoDate = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$"), AfterValidator(_check_date)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ------------------------------- Accounts -------------------------------

EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class RegisterIn(Strict):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    email: Annotated[str, Field(max_length=254)]
    password: Annotated[str, Field(min_length=8, max_length=200)]
    role: Role
    facility: Annotated[str, Field(max_length=120)] = ""

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL.match(v):
            raise ValueError("invalid email")
        return v

    @field_validator("name", "facility")
    @classmethod
    def _trim(cls, v: str) -> str:
        return v.strip()


class LoginIn(Strict):
    email: Annotated[str, Field(max_length=254)]
    password: Annotated[str, Field(max_length=200)]


class DemoIn(Strict):
    role: Role


class UserOut(BaseModel):
    name: str
    email: str
    role: Role
    facility: str
    demo: bool


class TokenOut(BaseModel):
    token: str
    expires_at: datetime
    user: UserOut


# ------------------------------- Records -------------------------------

Route = Literal["routine", "repeat", "qualified_review", "urgent", "held", "stopped"]
Service = Literal["primary_care", "neurology", "geriatrics", "mental_health", "audiology", "optometry", "sleep_clinic", "genetic_counselling"]
Contributor = Literal["sleep", "medicines", "mood", "sensory", "vascular", "metabolic", "activity", "social", "function", "family_genetics"]


class DecisionPayload(Strict):
    reviewer: Short = ""
    reviewerRole: Role = "nurse"
    summary: Long
    stillToClarify: Long
    assessment: Long
    nextStep: Long
    contributors: Annotated[list[Contributor], Field(max_length=10)]
    route: Route
    services: Annotated[list[Service], Field(max_length=8)]
    rationale: Long
    followUpDays: Annotated[int, Field(ge=1, le=730)]
    summaryConfirmed: bool
    contributorsReviewed: bool
    status: Literal["approved", "returned", "prepared"]
    decidedAt: IsoDate



LabId = Literal["b12", "folate", "tsh", "ft4", "hba1c", "glucose", "sodium", "calcium", "hb", "creatinine", "egfr"]


class LabPayload(Strict):
    id: Annotated[str, Field(max_length=80)]
    test: LabId
    value: Annotated[float, Field(ge=0, le=100_000)]
    date: IsoDate
    low: float | None
    high: float | None
    enteredBy: Short = ""


    @model_validator(mode="after")
    def _range(self) -> "LabPayload":
        if not math.isfinite(self.value):
            raise ValueError("value must be a number")
        if self.low is None and self.high is None:
            raise ValueError("enter at least one limit of the lab's reference range")
        if self.low is not None and self.high is not None and self.low >= self.high:
            raise ValueError("the lower limit must be below the upper limit")
        return self


class MedicinePayload(Strict):
    id: Annotated[str, Field(max_length=80)]
    name: Annotated[str, Field(min_length=1, max_length=200)]
    dose: Annotated[str, Field(min_length=1, max_length=200)]
    source: Literal["patient", "care_partner", "pharmacy", "prescription"]
    confirmed: bool
    withoutPrescription: bool
    anticholinergic: bool
    cnsActive: bool
    date: IsoDate
    enteredBy: Short = ""


    @field_validator("name", "dose")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("cannot be blank")
        return v.strip()


INSTRUMENT_MAX = {"moca": 30, "rudas": 30, "minicog": 5}


class InstrumentPayload(Strict):
    instrument: Literal["moca", "rudas", "minicog"]
    score: Annotated[int, Field(ge=0)]
    date: IsoDate
    version: Annotated[str, Field(min_length=1, max_length=120)]
    reading: Literal["ok", "attention"]
    givenBy: Short = ""
    trained: bool


    @model_validator(mode="after")
    def _rules(self) -> "InstrumentPayload":
        if self.score > INSTRUMENT_MAX[self.instrument]:
            raise ValueError(f"score must be 0 to {INSTRUMENT_MAX[self.instrument]}")
        if not self.trained:
            raise ValueError("confirm training and the licensed form")
        if not self.version.strip():
            raise ValueError("enter the version and language")
        return self


class Conditions(Strict):
    poorSleep: bool
    fasting: bool
    lowMood: bool
    distraction: bool
    aidsWorn: bool
    assisted: bool


class Parts(Strict):
    recall: Annotated[int, Field(ge=0, le=4)]
    sequence: Annotated[int, Field(ge=0, le=2)]
    search: Annotated[int, Field(ge=0, le=2)]
    switching: Annotated[int, Field(ge=0, le=2)]


class Observation(Strict):
    visit: Annotated[int, Field(ge=1, le=500)]
    date: IsoDate
    score: Annotated[int, Field(ge=0, le=10)]
    language: Literal["ar", "en", "id", "ur"]
    mode: Literal["visual", "auditory"]
    form: Annotated[str, Field(max_length=4)]
    conditions: Conditions
    source: Literal["live-check"]
    administration: Literal["device", "staff-paper"] | None = None
    parts: Parts


    @model_validator(mode="after")
    def _sum(self) -> "Observation":
        p = self.parts
        if p.recall + p.sequence + p.search + p.switching != self.score:
            raise ValueError("task points must add up to the score")
        return self


class LocalisedNote(Strict):
    en: Annotated[str, Field(max_length=500)]
    ar: Annotated[str, Field(max_length=500)]
    id: Annotated[str, Field(max_length=500)] | None = None


class FunctionReport(Strict):
    date: IsoDate
    reporter: Literal["self", "care_partner"]
    level: Literal[0, 1, 2]
    note: LocalisedNote
    source: Literal["live-check"]



class ObservationPayload(Strict):
    observation: Observation
    functionReport: FunctionReport


class ConsentPayload(Strict):
    scope: Literal["clinical", "wearable", "family", "genomic"]
    granted: bool


class PermissionPayload(Strict):
    granted: bool


class WorkupPayload(Strict):
    itemId: Literal["meds", "b12", "thyroid", "glucose", "mood", "sleep", "hearing", "vision"]
    status: Literal["not_started", "ordered", "normal", "abnormal", "not_needed"]
    note: Annotated[str, Field(max_length=1000)]
    date: Annotated[str, Field(max_length=10)]


class HabitPayload(Strict):
    week: IsoDate
    sleepHours: Annotated[float, Field(ge=0, le=16)] | None
    activeMinutes: Annotated[float, Field(ge=0, le=2000)] | None
    socialDays: Annotated[float, Field(ge=0, le=7)] | None
    source: Literal["wearable", "reported"]



class KindSpec(BaseModel):
    model: type[BaseModel]
    # Kinds with a key keep only their latest record per key: a new one supersedes the old.
    key_field: str | None = None
    single: bool = False
    # New clinical information means a doctor has to look again, so it clears the sign-off.
    clears_sign_off: bool = False


KINDS: dict[str, KindSpec] = {
    "decision": KindSpec(model=DecisionPayload, single=True),
    "lab": KindSpec(model=LabPayload, clears_sign_off=True),
    "medicine": KindSpec(model=MedicinePayload, clears_sign_off=True),
    "instrument": KindSpec(model=InstrumentPayload, single=True, clears_sign_off=True),
    "observation": KindSpec(model=ObservationPayload, clears_sign_off=True),
    "consent": KindSpec(model=ConsentPayload, key_field="scope", clears_sign_off=True),
    "permission": KindSpec(model=PermissionPayload, single=True, clears_sign_off=True),
    "workup": KindSpec(model=WorkupPayload, key_field="itemId"),
    "habit": KindSpec(model=HabitPayload, key_field="week"),
}


class RecordIn(Strict):
    id: Annotated[str, Field(pattern=r"^[a-z]+-[a-z0-9-]{4,70}$")] | None = None
    payload: dict[str, Any]


class RecordOut(BaseModel):
    id: str
    case_id: str
    kind: str
    key: str | None
    payload: dict[str, Any]
    created_at: datetime
    created_by: str
