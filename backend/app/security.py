"""Password hashing, bearer tokens and login rate limiting. Standard library only."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict, deque

# scrypt parameters (RFC 7914). n=2^15 with r=8 uses 32 MiB, a common interactive-login setting.
_N, _R, _P, _DKLEN = 2**15, 8, 1, 32
_MAXMEM = 64 * 1024 * 1024


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN, maxmem=_MAXMEM)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, digest_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=int(n), r=int(r), p=int(p), dklen=len(digest_hex) // 2, maxmem=_MAXMEM)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


# Used when the email is unknown, so the response takes as long as a real check.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def burn_time(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def new_token() -> tuple[str, str]:
    """Returns (token for the client, hash for the database)."""
    token = secrets.token_urlsafe(32)
    return token, token_hash(token)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class LoginLimiter:
    """
    Counts failed sign-ins per client and email inside a sliding window.
    In-memory, so per instance: a multi-instance deployment needs a shared store
    or a gateway rate limit in front.
    """

    def __init__(self, attempts: int, window_seconds: int) -> None:
        self.attempts = attempts
        self.window = window_seconds
        self._fails: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _trim(self, key: str, now: float) -> deque[float]:
        q = self._fails[key]
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._trim(key, time.monotonic())) >= self.attempts

    def fail(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._trim(key, now).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._fails.pop(key, None)
