import structlog

from core.config import settings
from supabase import Client, create_client

logger = structlog.get_logger("neufin.database")

SUPABASE_URL = settings.SUPABASE_URL
SUPABASE_KEY = settings.SUPABASE_KEY
SUPABASE_SERVICE_ROLE_KEY = settings.SUPABASE_SERVICE_ROLE_KEY

# Use service role key if available — bypasses RLS for all backend operations.
_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY

# Log presence only — never log key values
logger.info(
    "db.init",
    supabase_url="SET" if SUPABASE_URL else "MISSING",
    supabase_key="SET" if SUPABASE_KEY else "MISSING",
    service_role_key=(
        "SET (RLS bypassed)"
        if SUPABASE_SERVICE_ROLE_KEY
        else "MISSING — using anon key (RLS applies)"
    ),
)

# Synchronous Supabase client — compatible with all routers and sync SDK calls.
supabase: Client = create_client(SUPABASE_URL, _key)


def get_supabase_client() -> Client:
    """Return the shared Supabase client instance."""
    return supabase


# ══════════════════════════════════════════════════════════════════════════════
# Fernet field-level encryption
# ══════════════════════════════════════════════════════════════════════════════
try:
    from cryptography.fernet import Fernet

    _FERNET_AVAILABLE = True
except ImportError:
    _FERNET_AVAILABLE = False
    logger.warning(
        "db.fernet.unavailable",
        detail="cryptography package not installed — field encryption disabled. Run: pip install cryptography",
    )

_FERNET_KEY_RAW = settings.FERNET_MASTER_KEY

_fernet: "Fernet | None" = None
if _FERNET_AVAILABLE and _FERNET_KEY_RAW:
    try:
        _fernet = Fernet(_FERNET_KEY_RAW.encode())
        logger.info("db.fernet.ready", cipher="AES-128-CBC+HMAC-SHA256")
    except Exception as exc:
        logger.error("db.fernet.invalid_key", error=str(exc))
elif _FERNET_AVAILABLE:
    logger.warning(
        "db.fernet.no_key",
        detail='FERNET_MASTER_KEY not set — field encryption disabled. Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"',
    )
else:
    logger.warning("db.fernet.disabled")


def encrypt_value(val: "float | int | str | None") -> str:
    if val is None or str(val) == "":
        return ""
    if _fernet is None:
        return f"PLAIN:{val}"
    return _fernet.encrypt(str(val).encode()).decode()


def decrypt_value(token: "str | float | int | None") -> float:
    if token is None or token == "":
        return 0.0
    if isinstance(token, int | float):
        return float(token)
    if isinstance(token, str) and token.startswith("PLAIN:"):
        try:
            return float(token[6:])
        except ValueError:
            return 0.0
    if _fernet is None:
        try:
            return float(token)
        except (ValueError, TypeError):
            return 0.0
    try:
        return float(_fernet.decrypt(token.encode()).decode())
    except Exception:
        try:
            return float(token)
        except (ValueError, TypeError):
            return 0.0


# ── Guest session claim helper ─────────────────────────────────────────────────


def claim_guest_data(session_id: str, user_id: str) -> dict[str, int]:
    """
    Bulk-assign all unclaimed rows that share *session_id* to *user_id*.
    Returns a summary: {"portfolios": n, "dna_scores": n, "swarm_reports": n}.
    """
    sid = (session_id or "").strip()
    if not sid:
        return {"portfolios": 0, "dna_scores": 0, "swarm_reports": 0}

    claimed: dict[str, int] = {"portfolios": 0, "dna_scores": 0, "swarm_reports": 0}

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
            supabase.table("portfolios").update({"user_id": user_id, "session_id": None}).in_(
                "id", port_ids
            ).execute()
            claimed["portfolios"] = len(port_ids)
    except Exception as exc:
        logger.warning("claim_guest_data.portfolios.error", error=str(exc))

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
            supabase.table("dna_scores").update({"user_id": user_id, "session_id": None}).in_(
                "id", dna_ids
            ).execute()
            claimed["dna_scores"] = len(dna_ids)
    except Exception as exc:
        logger.warning("claim_guest_data.dna_scores.error", error=str(exc))

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
            supabase.table("swarm_reports").update({"user_id": user_id, "session_id": None}).in_(
                "id", swarm_ids
            ).execute()
            claimed["swarm_reports"] = len(swarm_ids)
    except Exception as exc:
        logger.warning("claim_guest_data.swarm_reports.error", error=str(exc))

    return claimed
