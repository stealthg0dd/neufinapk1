"""
services/jwt_auth.py — Supabase JWKS-based JWT verification (ES256).

Replaces the legacy supabase.auth.get_user() network call with local
public-key verification using keys fetched from the Supabase JWKS endpoint.

Key design:
  - Keys are cached in-process for JWKS_TTL seconds (default 1 h).
  - On a kid-miss (key rotation), the cache is flushed and refreshed once.
  - Both ES256 (ECC, Supabase 2026 default) and HS256 (legacy) are accepted
    so the transition period doesn't cause a hard cut-off.
  - JWTUser is a plain dataclass with .id and .email so it is a drop-in
    replacement for the Supabase User object used in vault.py and advisors.py.
"""

from __future__ import annotations

import time
import sys
import datetime
from dataclasses import dataclass

import httpx
from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError, JWTClaimsError

from config import SUPABASE_URL

# ── JWKS endpoint ──────────────────────────────────────────────────────────────
_JWKS_URL   = f"{SUPABASE_URL}/auth/v1/jwks"
_JWKS_TTL   = 3600.0      # seconds between cache refreshes (1 hour)
_ALGORITHMS = ["ES256", "HS256"]   # accept both during key-type transition

# In-process cache — shared across requests (single-process uvicorn worker)
_cache: dict = {"keys": None, "fetched_at": 0.0}

_TAG = "[JWT]"


def _log(msg: str) -> None:
    """Write a timestamped JWT log line to stderr (visible in Railway Live Logs)."""
    ts = datetime.datetime.utcnow().strftime("%H:%M:%S.%f")[:-3]
    print(f"{_TAG} {ts}  {msg}", file=sys.stderr, flush=True)


# ── User object ────────────────────────────────────────────────────────────────
@dataclass
class JWTUser:
    """Minimal user representation extracted from a verified Supabase JWT.

    Attribute names match the Supabase Python SDK's User object so existing
    code (vault.py `user.id`, `user.email`) continues to work without changes.
    """
    id:    str
    email: str | None = None


# ── JWKS fetch + cache ─────────────────────────────────────────────────────────
async def _fetch_jwks() -> list[dict]:
    """Return the list of JWK entries, refreshing when the TTL has expired."""
    now = time.monotonic()
    age  = now - _cache["fetched_at"]

    if _cache["keys"] is not None and age < _JWKS_TTL:
        _log(f"JWKS cache HIT  — {len(_cache['keys'])} key(s), "
             f"age={age:.0f}s, ttl={_JWKS_TTL:.0f}s")
        return _cache["keys"]

    _log(f"JWKS cache MISS — fetching {_JWKS_URL}")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(_JWKS_URL)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        if _cache["keys"]:
            _log(f"JWKS refresh FAILED ({exc}); serving stale cache "
                 f"({len(_cache['keys'])} key(s))")
            return _cache["keys"]
        raise RuntimeError(f"JWKS unavailable and no cached keys: {exc}") from exc

    _cache["keys"] = data.get("keys", [])
    _cache["fetched_at"] = now

    cached_kids = [k.get("kid", "<no-kid>") for k in _cache["keys"]]
    _log(f"JWKS refreshed  — {len(_cache['keys'])} key(s) | "
         f"kids={cached_kids}")
    return _cache["keys"]


async def _get_signing_key(kid: str | None, cached_kids: list[str]) -> dict:
    """Return the JWK dict that matches *kid*, refreshing the cache on a miss."""

    def _find(keys: list[dict]) -> dict | None:
        if kid:
            return next((k for k in keys if k.get("kid") == kid), None)
        return keys[0] if keys else None   # no kid header → use first key

    key = _find(await _fetch_jwks())
    if key is None:
        _log(f"kid={kid!r} NOT FOUND in cache (kids={cached_kids}); "
             f"flushing and retrying — possible key rotation")
        _cache["keys"] = None
        keys = await _fetch_jwks()
        new_kids = [k.get("kid", "<no-kid>") for k in keys]
        key = _find(keys)
        if key is None:
            _log(f"kid={kid!r} still NOT FOUND after refresh "
                 f"(available kids={new_kids}) — token cannot be verified")
            raise ValueError(
                f"No public key found for kid={kid!r}. "
                f"Available kids after refresh: {new_kids}"
            )
        _log(f"kid={kid!r} found after cache refresh ✓")

    return key


# ── Public API ─────────────────────────────────────────────────────────────────
async def verify_jwt(token: str) -> JWTUser:
    """Verify *token* against Supabase JWKS and return a JWTUser.

    Raises ValueError with a human-readable message on any failure.
    Callers should catch ValueError and return a 401 response.
    The raw token string is never logged.
    """
    # ── 1. Parse unverified header ────────────────────────────────────────────
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        _log(f"REJECT — malformed header: {exc}")
        raise ValueError(f"Malformed token header: {exc}") from exc

    kid = header.get("kid")
    alg = header.get("alg", "<missing>")
    _log(f"Incoming token  — alg={alg!r}  kid={kid!r}")

    # ── 2. Algorithm pre-check ────────────────────────────────────────────────
    if alg not in _ALGORITHMS:
        _log(f"REJECT — unsupported algorithm {alg!r} "
             f"(accepted: {_ALGORITHMS})")
        raise ValueError(f"Unsupported algorithm: {alg!r}")

    # ── 3. Resolve signing key ────────────────────────────────────────────────
    current_kids = (
        [k.get("kid", "<no-kid>") for k in (_cache["keys"] or [])]
    )
    key = await _get_signing_key(kid, current_kids)
    _log(f"Signing key resolved — kid={key.get('kid')!r}  "
         f"kty={key.get('kty')!r}  crv={key.get('crv', 'N/A')!r}")

    # ── 4. Verify signature + claims ──────────────────────────────────────────
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=_ALGORITHMS,
            audience="authenticated",
            options={"verify_aud": True, "verify_exp": True},
        )

    except ExpiredSignatureError as exc:
        # Extract exp from unverified claims for a useful log message
        try:
            raw = jwt.get_unverified_claims(token)
            exp_ts  = raw.get("exp", 0)
            exp_utc = datetime.datetime.utcfromtimestamp(exp_ts).strftime(
                "%Y-%m-%d %H:%M:%S UTC"
            )
            now_utc = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            _log(f"REJECT — token EXPIRED  exp={exp_utc}  now={now_utc}")
        except Exception:
            _log(f"REJECT — token EXPIRED  (could not parse exp claim): {exc}")
        raise ValueError(f"Token expired: {exc}") from exc

    except JWTClaimsError as exc:
        try:
            raw = jwt.get_unverified_claims(token)
            actual_aud = raw.get("aud", "<missing>")
            _log(f"REJECT — claims error: expected aud='authenticated', "
                 f"got aud={actual_aud!r} | detail={exc}")
        except Exception:
            _log(f"REJECT — claims error: {exc}")
        raise ValueError(f"Token claims invalid: {exc}") from exc

    except JWTError as exc:
        _log(f"REJECT — signature/decode error: {exc}")
        raise ValueError(f"Token verification failed: {exc}") from exc

    # ── 5. Extract identity claims ────────────────────────────────────────────
    user_id = payload.get("sub")
    if not user_id:
        _log("REJECT — token missing 'sub' claim")
        raise ValueError("Token missing 'sub' claim")

    role    = payload.get("role", "<none>")
    exp_ts  = payload.get("exp", 0)
    exp_utc = datetime.datetime.utcfromtimestamp(exp_ts).strftime(
        "%Y-%m-%d %H:%M:%S UTC"
    ) if exp_ts else "<no exp>"

    _log(f"ACCEPT — sub={user_id[:8]}…  role={role!r}  exp={exp_utc}")
    return JWTUser(id=user_id, email=payload.get("email"))
