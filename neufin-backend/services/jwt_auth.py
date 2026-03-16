"""
services/jwt_auth.py — Supabase JWKS-based JWT verification (ES256 / HS256).

Key design:
  - Keys fetched from /.well-known/jwks.json with SUPABASE_ANON_KEY header.
  - In-process cache with 1-hour TTL; 60-second backoff on fetch failure.
  - On a kid-miss the cache is flushed and refreshed once (key rotation).
  - Fallback chain when JWKS is unreachable:
      1. SUPABASE_PUBLIC_KEY env var (raw PEM / JWK JSON string)
      2. SUPABASE_JWT_SECRET / JWT_SECRET  (HS256, only for HS256 tokens)
  - BYPASS_AUTH_IN_DEV=true  →  return a dummy JWTUser (local/staging only).
  - JWTUser is a plain dataclass with .id and .email.
"""

from __future__ import annotations

import json
import time
import sys
import datetime
from dataclasses import dataclass

import httpx
from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError, JWTClaimsError

import os
from config import SUPABASE_URL, SUPABASE_KEY

# ── JWKS endpoint ──────────────────────────────────────────────────────────────
# Standard OIDC path — more reliable than the short alias /auth/v1/jwks
_JWKS_URL         = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
_JWKS_TTL         = 3600.0   # seconds between cache refreshes (1 hour)
_JWKS_RETRY_AFTER = 60.0     # backoff after a failed fetch

# Prefer the anon key for JWKS — some Supabase instances reject service_role here
_SUPABASE_ANON_KEY = (
    os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or SUPABASE_KEY   # last resort: fall back to whatever key we have
)

_ALGORITHMS = ["ES256", "HS256"]   # accept both during key-type transition

# ── Fallback secrets / keys ────────────────────────────────────────────────────
# HS256 secret — only attempted for tokens that declare alg=HS256
_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET") or os.environ.get("JWT_SECRET")

# Raw public key fallback — set SUPABASE_PUBLIC_KEY to a PEM string or a single
# JWK JSON object.  Used when the JWKS endpoint is unreachable and we have no
# cached keys.
_SUPABASE_PUBLIC_KEY_RAW = os.environ.get("SUPABASE_PUBLIC_KEY", "").strip()

# Dev bypass — set BYPASS_AUTH_IN_DEV=true to skip verification entirely.
# NEVER set this in production.
_BYPASS_AUTH = os.environ.get("BYPASS_AUTH_IN_DEV", "").lower() == "true"

# In-process cache — shared across requests (single-process uvicorn worker)
_cache: dict = {"keys": None, "fetched_at": 0.0, "fail_until": 0.0}

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


# ── Static public-key fallback helper ─────────────────────────────────────────
def _static_key_list() -> list[dict]:
    """
    Build a synthetic JWK list from SUPABASE_PUBLIC_KEY env var.
    Accepts either a JSON object (single JWK), a JSON array (JWKS keys list),
    or a PEM string.  Returns [] if the env var is not set or unparseable.
    """
    raw = _SUPABASE_PUBLIC_KEY_RAW
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed          # already a keys array
        if isinstance(parsed, dict):
            return [parsed]        # single JWK object
    except json.JSONDecodeError:
        pass
    # Treat as PEM — wrap in a minimal dict that python-jose can handle
    if "BEGIN" in raw:
        return [{"kty": "EC", "pem": raw}]
    _log(f"SUPABASE_PUBLIC_KEY could not be parsed — ignored")
    return []


# ── JWKS fetch + cache ─────────────────────────────────────────────────────────
async def _fetch_jwks() -> list[dict]:
    """Return the list of JWK entries, refreshing when the TTL has expired."""
    now = time.monotonic()
    age = now - _cache["fetched_at"]

    if _cache["keys"] is not None and age < _JWKS_TTL:
        _log(f"JWKS cache HIT  — {len(_cache['keys'])} key(s), "
             f"age={age:.0f}s, ttl={_JWKS_TTL:.0f}s")
        return _cache["keys"]

    # Respect retry backoff — don't hammer a failing endpoint on every request
    if now < _cache["fail_until"]:
        if _cache["keys"]:
            return _cache["keys"]
        # Try static fallback before giving up
        static = _static_key_list()
        if static:
            _log(f"JWKS in backoff; using SUPABASE_PUBLIC_KEY static fallback "
                 f"({len(static)} key(s))")
            return static
        raise RuntimeError(f"JWKS endpoint in backoff until {_cache['fail_until']:.0f}")

    _log(f"JWKS cache MISS — fetching {_JWKS_URL}")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                _JWKS_URL,
                headers={"apikey": _SUPABASE_ANON_KEY},
            )
            if resp.status_code == 404:
                # Some Supabase instances also serve JWKS at the short alias —
                # try it as a one-shot secondary attempt before giving up.
                _log(f"/.well-known/jwks.json returned 404; retrying /auth/v1/jwks")
                resp2 = await client.get(
                    f"{SUPABASE_URL}/auth/v1/jwks",
                    headers={"apikey": _SUPABASE_ANON_KEY},
                )
                if resp2.status_code == 200:
                    resp = resp2
                else:
                    resp.raise_for_status()  # will raise the original 404
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        _cache["fail_until"] = now + _JWKS_RETRY_AFTER
        if _cache["keys"]:
            _log(f"JWKS refresh FAILED ({exc}); serving stale cache "
                 f"({len(_cache['keys'])} key(s))")
            return _cache["keys"]
        static = _static_key_list()
        if static:
            _log(f"JWKS unavailable ({exc}); using SUPABASE_PUBLIC_KEY static "
                 f"fallback ({len(static)} key(s))")
            return static
        raise RuntimeError(f"JWKS unavailable and no cached keys: {exc}") from exc

    _cache["keys"] = data.get("keys", [])
    _cache["fetched_at"] = now
    _cache["fail_until"] = 0.0  # clear backoff on success

    cached_kids = [k.get("kid", "<no-kid>") for k in _cache["keys"]]
    _log(f"JWKS refreshed  — {len(_cache['keys'])} key(s) | kids={cached_kids}")
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
    # ── 0. Dev bypass ─────────────────────────────────────────────────────────
    if _BYPASS_AUTH:
        _log("BYPASS_AUTH_IN_DEV=true — skipping verification, returning dummy user")
        return JWTUser(id="dev-bypass-user", email="dev@local")

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
        _log(f"REJECT — unsupported algorithm {alg!r} (accepted: {_ALGORITHMS})")
        raise ValueError(f"Unsupported algorithm: {alg!r}")

    # ── 3. Resolve signing key ────────────────────────────────────────────────
    current_kids = [k.get("kid", "<no-kid>") for k in (_cache["keys"] or [])]

    try:
        key = await _get_signing_key(kid, current_kids)
    except (RuntimeError, ValueError) as jwks_exc:
        # HS256 fallback — only attempted when the token itself declares HS256,
        # so we never try a symmetric secret against an ES256 token.
        if alg == "HS256" and _JWT_SECRET:
            _log(f"JWKS unavailable ({jwks_exc}); token is HS256 — "
                 f"attempting JWT_SECRET fallback")
            try:
                payload = jwt.decode(
                    token,
                    _JWT_SECRET,
                    algorithms=["HS256"],
                    audience="authenticated",
                    options={"verify_aud": True, "verify_exp": True},
                )
                user_id = payload.get("sub")
                if not user_id:
                    raise ValueError("Token missing 'sub' claim")
                _log(f"ACCEPT (HS256 fallback) — sub={user_id[:8]}…")
                return JWTUser(id=user_id, email=payload.get("email"))
            except Exception as hs_exc:
                _log(f"HS256 fallback also failed: {hs_exc}")
        elif alg != "HS256":
            _log(f"JWKS unavailable ({jwks_exc}) and token is {alg!r} — "
                 f"HS256 fallback skipped (algorithm mismatch)")
        raise ValueError(str(jwks_exc)) from jwks_exc

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
