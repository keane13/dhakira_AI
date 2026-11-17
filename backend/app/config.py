"""Settings come from environment variables, so the same image runs locally and in the cloud."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    return default if raw is None else raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    env: str = "development"
    database_url: str = "sqlite:///./dhakira.db"
    cors_origins: list[str] = field(default_factory=lambda: ["http://localhost:5173", "http://localhost:5174"])
    token_ttl_hours: int = 12
    allow_registration: bool = True
    allow_demo: bool = True
    # Prototype guard: only the fictional case identifiers are accepted.
    case_id_pattern: str = r"^SYN-\d{3}$"
    static_dir: str | None = None
    max_body_bytes: int = 64_000
    login_attempts: int = 5
    login_window_seconds: int = 900

    @property
    def production(self) -> bool:
        return self.env == "production"


def load_settings() -> Settings:
    env = os.environ.get("DHAKIRA_ENV", "development")
    production = env == "production"
    origins = os.environ.get("DHAKIRA_CORS_ORIGINS")
    return Settings(
        env=env,
        database_url=os.environ.get("DHAKIRA_DATABASE_URL", "sqlite:///./dhakira.db"),
        cors_origins=[o.strip() for o in origins.split(",") if o.strip()] if origins else ([] if production else Settings().cors_origins),
        token_ttl_hours=int(os.environ.get("DHAKIRA_TOKEN_TTL_HOURS", "12")),
        # In production, open sign-up and demo accounts are off unless switched on explicitly.
        allow_registration=_bool("DHAKIRA_ALLOW_REGISTRATION", not production),
        allow_demo=_bool("DHAKIRA_ALLOW_DEMO", not production),
        case_id_pattern=os.environ.get("DHAKIRA_CASE_ID_PATTERN", Settings.case_id_pattern),
        static_dir=os.environ.get("DHAKIRA_STATIC_DIR") or None,
    )
