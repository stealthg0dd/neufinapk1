"""
Canonical portfolio headline metrics for reports (single source of truth).

All PDF sections should use values returned here instead of mixing
portfolio_data, DNA row, thesis, and ad-hoc fallbacks independently.
"""

from __future__ import annotations

from typing import Any


def canonical_portfolio_headlines(
    portfolio_data: dict[str, Any],
    dna_data: dict[str, Any],
    thesis: dict[str, Any],
    positions: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Reconcile AUM from positions when possible; beta / Sharpe prefer fresh
    ``portfolio_data['metrics']`` (calculator output), then DNA / thesis.

    Returns:
        total_value, weighted_beta, sharpe_ratio (optional), hhi, sources_note
    """
    m = portfolio_data.get("metrics") if isinstance(portfolio_data, dict) else {}
    if not isinstance(m, dict):
        m = {}

    sum_positions = 0.0
    for p in positions or []:
        v = float(p.get("value") or p.get("current_value") or 0)
        if v <= 0:
            sh = float(p.get("shares") or 0)
            px = float(
                p.get("price") or p.get("current_price") or p.get("last_price") or 0
            )
            v = sh * px
        sum_positions += max(0.0, v)

    tv_stored = float(portfolio_data.get("total_value") or m.get("total_value") or 0)
    if sum_positions > 1.0:
        total_value = sum_positions
        if (
            tv_stored > 1.0
            and abs(sum_positions - tv_stored) / max(tv_stored, 1.0) > 0.02
        ):
            sources_note = "AUM reconciled from position marks vs. stored total."
        else:
            sources_note = "AUM from position marks."
    else:
        total_value = tv_stored
        sources_note = "AUM from portfolio record."

    def _pick_beta() -> float:
        for src in (
            m.get("weighted_beta"),
            dna_data.get("weighted_beta") if isinstance(dna_data, dict) else None,
            thesis.get("weighted_beta"),
        ):
            if src is None:
                continue
            try:
                b = float(src)
            except (TypeError, ValueError):
                continue
            if 0 < b < 6:
                return min(b, 3.0)
        return 1.0

    weighted_beta = _pick_beta()

    sharpe_ratio: float | None = None
    for src in (
        m.get("sharpe_ratio"),
        (dna_data.get("sharpe_ratio") if isinstance(dna_data, dict) else None),
        thesis.get("sharpe_ratio"),
    ):
        if src is None:
            continue
        try:
            s = float(src)
        except (TypeError, ValueError):
            continue
        if abs(s) < 8.0:
            sharpe_ratio = s
            break

    hhi_raw = m.get("hhi")
    if hhi_raw is None and isinstance(dna_data, dict):
        hhi_raw = (dna_data.get("score_breakdown") or {}).get("hhi_concentration")
    hhi = 0.0
    if hhi_raw is not None:
        try:
            h = float(hhi_raw)
            hhi = h / 100.0 if h > 1.0 else h
        except (TypeError, ValueError):
            hhi = 0.0

    return {
        "total_value": float(total_value),
        "weighted_beta": float(weighted_beta),
        "sharpe_ratio": sharpe_ratio,
        "hhi": float(hhi),
        "sources_note": sources_note,
    }
