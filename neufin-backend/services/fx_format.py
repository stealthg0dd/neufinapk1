"""
# SEA-TICKER-FIX: Indicative FX strings for PDF / Swarm (display-only, not trading marks).

Uses exchangerate.host (no API key) with a 1h in-process cache.
"""

from __future__ import annotations

import threading
import time

import requests
import structlog

from core.config import settings

logger = structlog.get_logger("neufin.fx_format")

_lock = threading.Lock()
# (base, quote) -> (rate, epoch_ts)
_rate_cache: dict[tuple[str, str], tuple[float, float]] = {}
_TTL = 3600.0


def get_cross_rate(base: str, quote: str) -> float | None:
    """Return *quote* per 1 *base* (e.g. SGD per VND)."""
    b, q = base.upper(), quote.upper()
    if b == q:
        return 1.0
    if not settings.FX_DISPLAY_ENABLE:
        return None
    now = time.time()
    key = (b, q)
    with _lock:
        hit = _rate_cache.get(key)
        if hit and now - hit[1] < _TTL:
            return hit[0]
    try:
        url = f"https://api.exchangerate.host/latest?base={b}&symbols={q}"
        r = requests.get(url, timeout=5.0)
        data = r.json()
        if data.get("success") is False:
            return None
        rates = data.get("rates") or {}
        rate = float(rates.get(q, 0) or 0)
        if rate > 0:
            with _lock:
                _rate_cache[key] = (rate, now)
            return rate
    except Exception as exc:
        logger.debug("fx.cross_rate_failed", base=b, quote=q, error=str(exc))
    return None


def indicative_sgd_suffix(amount_native: float, native_ccy: str) -> str | None:
    """Single-line hint e.g. ``(≈ S$1.48)`` — None when disabled or same CCY."""
    if not settings.FX_DISPLAY_ENABLE:
        return None
    ccy = native_ccy.upper()
    if ccy in ("USD", "SGD"):
        return None
    r = get_cross_rate(ccy, "SGD")
    if not r:
        return None
    sgd = amount_native * r
    return f"(≈ S${sgd:,.2f})"


def format_pdf_market_value_cell(pos: dict) -> str:
    """PDF table cell: native amount + optional indicative SGD line."""
    from services.market_resolver import resolve_security

    p = dict(pos)
    sym = str(p.get("symbol") or "").strip()
    if not p.get("native_currency") and sym:
        try:
            p["native_currency"] = resolve_security(sym).native_currency
        except Exception:
            p["native_currency"] = "USD"
    val = float(p.get("current_value") or p.get("value") or 0)
    ccy = (p.get("native_currency") or "USD").upper()
    if ccy == "USD":
        return f"${val:,.0f}"
    if ccy == "VND":
        line1 = f"{val:,.0f} VND"
    elif ccy == "GBP":
        line1 = f"£{val:,.0f}"
    else:
        line1 = f"{val:,.2f} {ccy}"
    suf = indicative_sgd_suffix(val, ccy)
    if suf:
        return line1 + "\n" + suf
    return line1


def format_swarm_fx_note(native_ccy: str, value_native: float) -> str | None:
    """Short string for IC JSON payload."""
    s = indicative_sgd_suffix(value_native, native_ccy)
    return s
