import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()  # No-op when Railway injects env vars; loads .env in local dev

SUPABASE_URL              = os.environ.get("SUPABASE_URL")
SUPABASE_KEY              = os.environ.get("SUPABASE_KEY")              # anon key
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # service role (bypasses RLS)

# Use service role key if available — bypasses RLS for all backend operations.
# Without this, RLS policies would block the backend from reading/writing
# records that don't belong to the authenticated session.
_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY

# Log presence only — never log key values
print(f"[DB] SUPABASE_URL          = {'SET ✓' if SUPABASE_URL else 'MISSING ✗'}", file=sys.stderr)
print(f"[DB] SUPABASE_KEY          = {'SET ✓' if SUPABASE_KEY else 'MISSING ✗'}", file=sys.stderr)
print(f"[DB] SERVICE_ROLE_KEY      = {'SET ✓ (RLS bypassed)' if SUPABASE_SERVICE_ROLE_KEY else 'MISSING — using anon key (RLS applies)'}", file=sys.stderr)

# Synchronous Supabase client — compatible with all routers and sync SDK calls.
# All routers (dna.py, portfolio.py, reports.py, etc.) use sync .execute() calls.
supabase: Client = create_client(SUPABASE_URL, _key)


def get_supabase_client() -> Client:
    """Return the shared Supabase client instance."""
    return supabase


# ══════════════════════════════════════════════════════════════════════════════
# Fernet field-level encryption
# ══════════════════════════════════════════════════════════════════════════════
# Protects cost_basis and total_value (PII-adjacent financial data) at rest.
#
# FERNET_MASTER_KEY must be set in Railway env as a URL-safe base64 string.
# Generate with:  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
#
# Fernet = AES-128-CBC + HMAC-SHA256. Tokens are timestamped and self-authenticating.
#
# Usage in routers:
#   from database import encrypt_value, decrypt_value
#   encrypted = encrypt_value(152.30)       # returns str token
#   raw       = decrypt_value(encrypted)    # returns float
# ──────────────────────────────────────────────────────────────────────────────

try:
    from cryptography.fernet import Fernet, InvalidToken
    _FERNET_AVAILABLE = True
except ImportError:
    _FERNET_AVAILABLE = False
    print(
        "[DB/Fernet] cryptography package not installed — field encryption disabled. "
        "Run: pip install cryptography",
        file=sys.stderr,
    )

_FERNET_KEY_RAW = os.environ.get("FERNET_MASTER_KEY", "") or os.getenv("FERNET_MASTER_KEY", "")

_fernet: "Fernet | None" = None
if _FERNET_AVAILABLE and _FERNET_KEY_RAW:
    try:
        _fernet = Fernet(_FERNET_KEY_RAW.encode())
        print("[DB/Fernet] Field encryption = Fernet (AES-128-CBC + HMAC-SHA256) ✓", file=sys.stderr)
    except Exception as e:
        print(f"[DB/Fernet] Invalid FERNET_MASTER_KEY ({e}) — encryption disabled ✗", file=sys.stderr)
elif _FERNET_AVAILABLE:
    print(
        "[DB/Fernet] FERNET_MASTER_KEY not set — field encryption disabled. "
        "Generate: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"",
        file=sys.stderr,
    )
else:
    print("[DB/Fernet] Field encryption = DISABLED ✗", file=sys.stderr)


def encrypt_value(val: "float | int | str | None") -> str:
    """
    Encrypt *val* with Fernet (AES-128-CBC + HMAC-SHA256).

    Returns a Fernet token string.
    Returns "" for None/empty values.
    Falls back to "PLAIN:{val}" sentinel when cryptography is not installed
    or FERNET_MASTER_KEY is not configured, so the application can still run
    in degraded mode.
    """
    if val is None or str(val) == "":
        return ""
    if _fernet is None:
        return f"PLAIN:{val}"
    return _fernet.encrypt(str(val).encode()).decode()


def decrypt_value(token: "str | float | int | None") -> float:
    """
    Decrypt a Fernet token produced by encrypt_value.

    Returns the plaintext as a float.
    Returns 0.0 for None/empty input.
    Handles:
      - Raw numeric values (legacy unencrypted rows stored as float/int)
      - "PLAIN:" sentinel from degraded-mode fallback
      - Actual Fernet tokens
    Caller can cast further: e.g. Decimal(decrypt_value(row["cost_basis"]))
    """
    if token is None or token == "":
        return 0.0
    # Legacy rows — cost_basis stored as a raw numeric type
    if isinstance(token, (int, float)):
        return float(token)
    # Degraded-mode sentinel
    if isinstance(token, str) and token.startswith("PLAIN:"):
        try:
            return float(token[6:])
        except ValueError:
            return 0.0
    # No Fernet available — try to parse as plain float
    if _fernet is None:
        try:
            return float(token)
        except (ValueError, TypeError):
            return 0.0
    # Fernet token
    try:
        return float(_fernet.decrypt(token.encode()).decode())
    except Exception:
        # Last-resort: maybe stored as plain float string before encryption was enabled
        try:
            return float(token)
        except (ValueError, TypeError):
            return 0.0


# ── Guest session claim helper ─────────────────────────────────────────────────

def claim_guest_data(session_id: str, user_id: str) -> dict[str, int]:
    """
    Bulk-assign all unclaimed rows that share *session_id* to *user_id*.

    Covers portfolios → portfolio_positions (via portfolio FK) → dna_scores →
    swarm_reports.  After reassignment the session_id column is cleared on each
    row so the same session cannot be claimed twice.

    Fernet-encrypted cost_basis values are left intact — the FERNET_MASTER_KEY
    is global (not per-user), so ownership transfer requires no re-encryption.

    Returns a summary dict: {"portfolios": n, "dna_scores": n, "swarm_reports": n}.
    """
    sid = (session_id or "").strip()
    if not sid:
        return {"portfolios": 0, "dna_scores": 0, "swarm_reports": 0}

    claimed: dict[str, int] = {"portfolios": 0, "dna_scores": 0, "swarm_reports": 0}

    # 1. Portfolios ─────────────────────────────────────────────────────────────
    try:
        port_res = (
            supabase.table("portfolios")
            .select("id")
            .eq("session_id", sid)
            .is_("user_id", "null")
            .execute()
        )
        port_ids = [r["id"] for r in (port_res.data or [])]
        if port_ids:
            supabase.table("portfolios").update(
                {"user_id": user_id, "session_id": None}
            ).in_("id", port_ids).execute()
            claimed["portfolios"] = len(port_ids)
    except Exception as e:
        print(f"[claim_guest_data] portfolios error: {e}", file=sys.stderr)

    # 2. dna_scores ─────────────────────────────────────────────────────────────
    try:
        dna_res = (
            supabase.table("dna_scores")
            .select("id")
            .eq("session_id", sid)
            .is_("user_id", "null")
            .execute()
        )
        dna_ids = [r["id"] for r in (dna_res.data or [])]
        if dna_ids:
            supabase.table("dna_scores").update(
                {"user_id": user_id, "session_id": None}
            ).in_("id", dna_ids).execute()
            claimed["dna_scores"] = len(dna_ids)
    except Exception as e:
        print(f"[claim_guest_data] dna_scores error: {e}", file=sys.stderr)

    # 3. swarm_reports ──────────────────────────────────────────────────────────
    try:
        swarm_res = (
            supabase.table("swarm_reports")
            .select("id")
            .eq("session_id", sid)
            .is_("user_id", "null")
            .execute()
        )
        swarm_ids = [r["id"] for r in (swarm_res.data or [])]
        if swarm_ids:
            supabase.table("swarm_reports").update(
                {"user_id": user_id, "session_id": None}
            ).in_("id", swarm_ids).execute()
            claimed["swarm_reports"] = len(swarm_ids)
    except Exception as e:
        print(f"[claim_guest_data] swarm_reports error: {e}", file=sys.stderr)

    return claimed
