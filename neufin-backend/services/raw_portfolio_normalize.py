"""
Deterministic raw-text portfolio parser for POST /api/portfolio/normalize.
No LLM; returns confidence scores so low-quality rows can be reviewed.
"""

from __future__ import annotations

import math
import re
from typing import Any

# ── Common English tokens that are not tickers when standalone ────────────────
_TICKER_BLOCKLIST = frozenset(
    {
        "AND",
        "ARE",
        "ALL",
        "BUT",
        "BUY",
        "CAN",
        "CASH",
        "DAY",
        "END",
        "ETF",
        "FOR",
        "FUN",
        "GOT",
        "HAD",
        "HAS",
        "HER",
        "HIM",
        "HIS",
        "HOW",
        "ITS",
        "LET",
        "LOT",
        "LOW",
        "MAY",
        "NEW",
        "NOT",
        "NOW",
        "OFF",
        "OLD",
        "ONE",
        "OUR",
        "OUT",
        "OWN",
        "PAY",
        "PUT",
        "RUN",
        "SAY",
        "SEE",
        "SET",
        "SHE",
        "SHARE",
        "SHARES",
        "THE",
        "TOO",
        "TOP",
        "TRY",
        "TWO",
        "USA",
        "USE",
        "USD",
        "VIA",
        "WAS",
        "WAY",
        "WHO",
        "WHY",
        "YES",
        "YET",
        "YOU",
    }
)

# Optional friendly names for validation UX (not security-critical)
_KNOWN_NAMES: dict[str, str] = {
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corporation",
    "GOOGL": "Alphabet Inc.",
    "NVDA": "NVIDIA Corporation",
    "JPM": "JPMorgan Chase & Co.",
    "VCI.VN": "Viet Capital Securities",
    "HPG.VN": "Hoa Phat Group",
    "MBB.VN": "Military Commercial Joint Stock Bank",
}


def _parse_numeric_token(raw: str) -> float | None:
    s = raw.strip().replace(",", "").replace(" ", "")
    if not s:
        return None
    mult = 1.0
    lower = s.lower()
    if lower.endswith("k"):
        mult = 1_000.0
        s = s[:-1]
    elif lower.endswith("m"):
        mult = 1_000_000.0
        s = s[:-1]
    try:
        v = float(s)
        if not math.isfinite(v):
            return None
        return v * mult
    except ValueError:
        return None


def _us_ticker_re() -> re.Pattern[str]:
    return re.compile(r"\b([A-Z]{1,5})\b")


def _sea_vn_ticker_re() -> re.Pattern[str]:
    return re.compile(r"\b([A-Z0-9][A-Z0-9.]{0,14}\.VN)\b", re.IGNORECASE)


def _guess_exchange(ticker: str, market_code: str) -> str:
    up = ticker.upper()
    if up.endswith(".VN"):
        return "HOSE"
    if market_code.upper() in {"VN", "SEA", "SG"}:
        if up.endswith(".VN"):
            return "HOSE"
    if market_code.upper() == "US":
        return "NASDAQ"
    return "UNKNOWN"


def _guess_currency(ticker: str, market_code: str) -> str:
    up = ticker.upper()
    if up.endswith(".VN"):
        return "VND"
    if market_code.upper() in {"SG", "SEA"} and up in {"SGD", "CASH"}:
        return "SGD"
    return "USD"


def _security_name(ticker: str) -> str:
    return _KNOWN_NAMES.get(ticker.upper(), ticker.upper())


def _confidence_from_score(score: float) -> str:
    if score >= 0.85:
        return "HIGH"
    if score >= 0.55:
        return "MEDIUM"
    return "LOW"


def _coerce_positions(
    rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Merge duplicate tickers; sum quantities; keep worst confidence."""
    warnings: list[str] = []
    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        key = (row["ticker"].upper(), row.get("asset_class", "equity"))
        if key in by_key:
            prev = by_key[key]
            prev["quantity"] = float(prev["quantity"]) + float(row["quantity"])
            prev["confidence_score"] = min(
                float(prev["confidence_score"]),
                float(row["confidence_score"]),
            )
            prev["warnings"] = list(
                dict.fromkeys(
                    list(prev.get("warnings") or []) + list(row.get("warnings") or [])
                )
            )
            prev["source_text"] = f'{prev["source_text"]} | {row["source_text"]}'
            warnings.append(f"Merged duplicate row for {row['ticker']}.")
        else:
            by_key[key] = {**row}
    return list(by_key.values()), warnings


def _parse_line(
    line: str,
    market_code: str,
) -> list[dict[str, Any]]:
    """Return zero or more position dicts from a single line."""
    raw_stripped = line.strip()
    if not raw_stripped or raw_stripped.startswith("#"):
        return []

    out: list[dict[str, Any]] = []

    # ── Cash patterns ───────────────────────────────────────────────────────
    cash_pat1 = re.compile(r"(?i)^cash\s+(USD|SGD|EUR|GBP)\s*([\d,]+(?:\.\d+)?)\s*$")
    m = cash_pat1.match(raw_stripped)
    if m:
        ccy = m.group(1).upper()
        amt = _parse_numeric_token(m.group(2))
        if amt is not None:
            pos = {
                "ticker": ccy,
                "security_name": f"Cash ({ccy})",
                "quantity": amt,
                "market_value_usd": None,
                "currency": ccy,
                "exchange": "CASH",
                "asset_class": "cash",
                "confidence_score": 0.95,
                "source_text": raw_stripped,
                "warnings": [],
            }
            if ccy != "USD":
                pos["warnings"].append("Non-USD cash; DNA pipeline may Fx-normalize.")
            out.append(pos)
            return out

    cash_pat2 = re.compile(r"(?i)^(?:S\$|SGD)\s*([\d,.]+)\s*(?:k)?\s*cash\s*$")
    m = cash_pat2.match(raw_stripped)
    if m:
        amt = _parse_numeric_token(
            m.group(1) + ("k" if "k" in raw_stripped.lower() else "")
        )
        if amt is not None:
            out.append(
                {
                    "ticker": "SGD",
                    "security_name": "Cash (SGD)",
                    "quantity": amt,
                    "market_value_usd": None,
                    "currency": "SGD",
                    "exchange": "CASH",
                    "asset_class": "cash",
                    "confidence_score": 0.9,
                    "source_text": raw_stripped,
                    "warnings": ["Sea cash — confirm amount."],
                }
            )
            return out

    cash_pat3 = re.compile(r"(?i)^\$?\s*([\d,.]+)\s*k?\s+cash\s+(USD)?\s*$")
    m = cash_pat3.match(raw_stripped)
    if m:
        amt = _parse_numeric_token(
            m.group(1) + ("k" if "k" in raw_stripped.lower() else "")
        )
        if amt is not None:
            out.append(
                {
                    "ticker": "USD",
                    "security_name": "Cash (USD)",
                    "quantity": amt,
                    "market_value_usd": None,
                    "currency": "USD",
                    "exchange": "CASH",
                    "asset_class": "cash",
                    "confidence_score": 0.9,
                    "source_text": raw_stripped,
                    "warnings": [],
                }
            )
            return out

    # ── Delimited rows (tab, pipe, comma) ────────────────────────────────────
    if "\t" in raw_stripped or "|" in raw_stripped:
        parts = re.split(r"\t|\|", raw_stripped)
        parts = [p.strip() for p in parts if p.strip()]
        if len(parts) >= 2:
            sym = parts[0].upper().strip("\"'")
            vn_m = _sea_vn_ticker_re().search(sym)
            if vn_m:
                sym = vn_m.group(1).upper()
            qty_val = _parse_numeric_token(parts[1])
            mkt: float | None = None
            if len(parts) >= 3:
                mkt = _parse_numeric_token(parts[2])
            if qty_val is not None and (
                sym.endswith(".VN") or sym not in _TICKER_BLOCKLIST
            ):
                if len(sym) <= 20:
                    conf = 0.9 if sym.endswith(".VN") else 0.82
                    w: list[str] = []
                    mv: float | None = None
                    if mkt is not None:
                        if sym.endswith(".VN"):
                            w.append(
                                "Third column looks like local value — not mapped to USD."
                            )
                        else:
                            mv = mkt
                    else:
                        w.append("No market value column detected.")
                    pos = {
                        "ticker": sym,
                        "security_name": _security_name(sym),
                        "quantity": qty_val,
                        "market_value_usd": mv,
                        "currency": _guess_currency(sym, market_code),
                        "exchange": _guess_exchange(sym, market_code),
                        "asset_class": "equity",
                        "confidence_score": conf,
                        "source_text": raw_stripped,
                        "warnings": w,
                    }
                    out.append(pos)
                    return out

    # ── CSV style SYMBOL, qty, value ─────────────────────────────────────────
    if "," in raw_stripped and "\t" not in raw_stripped and "|" not in raw_stripped:
        parts = [p.strip() for p in raw_stripped.split(",") if p.strip()]
        if len(parts) >= 2 and len(parts) <= 4:
            sym = parts[0].upper().strip('"').strip("'")
            vn = _sea_vn_ticker_re().search(sym)
            if vn:
                sym = vn.group(1).upper()
            qty_val = _parse_numeric_token(parts[1])
            mkt = _parse_numeric_token(parts[2]) if len(parts) > 2 else None
            if qty_val is not None and sym and sym not in _TICKER_BLOCKLIST:
                if len(sym) <= 20 and (sym.endswith(".VN") or 1 <= len(sym) <= 5):
                    conf = 0.88 if sym.endswith(".VN") else 0.8
                    w2: list[str] = []
                    out.append(
                        {
                            "ticker": sym,
                            "security_name": _security_name(sym),
                            "quantity": qty_val,
                            "market_value_usd": mkt,
                            "currency": _guess_currency(sym, market_code),
                            "exchange": _guess_exchange(sym, market_code),
                            "asset_class": "equity",
                            "confidence_score": conf,
                            "source_text": raw_stripped,
                            "warnings": w2,
                        }
                    )
                    return out

    # ── "N shares of TICKER" / "TICKER N shares" ─────────────────────────────
    m = re.search(
        r"(?i)^(\d+(?:\.\d+)?)\s+shares?\s+of\s+([A-Z0-9][A-Z0-9.]{0,14}(?:\.VN)?)\b",
        raw_stripped,
    )
    if m:
        qty_val = float(m.group(1))
        sym = m.group(2).upper()
        out.append(_equity_position(sym, qty_val, raw_stripped, 0.92, market_code))
        return out

    m = re.search(
        r"(?i)^([A-Z0-9][A-Z0-9.]{0,14}(?:\.VN)?)\s+(\d+(?:\.\d+)?)\s+shares?\b",
        raw_stripped,
    )
    if m:
        sym = m.group(1).upper()
        qty_val = float(m.group(2))
        out.append(_equity_position(sym, qty_val, raw_stripped, 0.92, market_code))
        return out

    # ── SEA ticker with trailing quantity ────────────────────────────────────
    vn = _sea_vn_ticker_re().search(raw_stripped)
    if vn:
        sym = vn.group(1).upper()
        rest = raw_stripped[vn.end() :].strip()
        nums = re.findall(r"[\d,.]+", rest)
        qty_val = _parse_numeric_token(nums[0]) if nums else None
        if qty_val is not None:
            out.append(_equity_position(sym, qty_val, raw_stripped, 0.88, market_code))
            return out
        # Symbol only — low confidence
        stub = _equity_position(sym, 0.0, raw_stripped, 0.35, market_code)
        stub["warnings"] = ["Quantity not found — please edit."]
        out.append(stub)
        return out

    # ── Generic US ticker + number ───────────────────────────────────────────
    us = _us_ticker_re().findall(raw_stripped.upper())
    nums = [_parse_numeric_token(x) for x in re.findall(r"[\d,.]+", raw_stripped)]
    nums = [n for n in nums if n is not None]
    if us and nums:
        sym = us[0]
        if sym in _TICKER_BLOCKLIST and len(us) > 1:
            sym = us[1]
        if sym not in _TICKER_BLOCKLIST:
            qty_val = nums[0]
            conf = 0.65 if len(us) > 3 else 0.72
            w3 = []
            if len(us) > 1:
                w3.append("Multiple ticker-like tokens — using first match.")
            w3.append("Verify ticker and quantity.")
            merged = _equity_position(sym, qty_val, raw_stripped, conf, market_code)
            merged["warnings"] = w3
            out.append(merged)
            return out

    # Unparsed — return low-confidence stub for user review
    tok = raw_stripped.split()[0].upper() if raw_stripped.split() else ""
    if tok and re.match(r"^[A-Z]{1,5}$", tok) and tok not in _TICKER_BLOCKLIST:
        stub2 = _equity_position(tok, 0.0, raw_stripped, 0.25, market_code)
        stub2["warnings"] = ["Could not parse quantity — please edit."]
        out.append(stub2)
        return out

    return []


def _equity_position(
    ticker: str,
    quantity: float,
    source_text: str,
    confidence: float,
    market_code: str,
) -> dict[str, Any]:
    return {
        "ticker": ticker.upper(),
        "security_name": _security_name(ticker),
        "quantity": quantity,
        "market_value_usd": None,
        "currency": _guess_currency(ticker, market_code),
        "exchange": _guess_exchange(ticker, market_code),
        "asset_class": "equity",
        "confidence_score": confidence,
        "source_text": source_text,
        "warnings": [],
    }


def normalize_raw_portfolio(raw_text: str, market_code: str = "US") -> dict[str, Any]:
    """
    Parse pasted portfolio text into normalized positions.

    Returns keys: positions, warnings, confidence (HIGH|MEDIUM|LOW).
    """
    global_warnings: list[str] = []
    raw_text = (raw_text or "").strip()
    if not raw_text:
        return {
            "positions": [],
            "warnings": ["Empty input."],
            "confidence": "LOW",
        }

    lines = re.split(r"\r?\n", raw_text)
    acc: list[dict[str, Any]] = []
    for line in lines:
        parsed = _parse_line(line, market_code)
        acc.extend(parsed)

    if not acc:
        return {
            "positions": [],
            "warnings": [
                *global_warnings,
                "No recognizable positions. Try CSV, tab-separated rows, or 'AAPL 25 shares'.",
            ],
            "confidence": "LOW",
        }

    merged, merge_warns = _coerce_positions(acc)
    global_warnings.extend(merge_warns)

    scores = [float(p["confidence_score"]) for p in merged]
    top = _confidence_from_score(min(scores) if scores else 0.0)

    return {
        "positions": merged,
        "warnings": global_warnings,
        "confidence": top,
    }
