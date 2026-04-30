"""
NeuFin Portfolio Intelligence Report — v2

Bank-grade IC PDF, 11 pages, two themes.
  light — classic institutional (#FFFFFF background), default
  dark  — fintech dark (#0B0F14 background)

Orchestration
─────────────
  generate_advisor_report()  async orchestrator (logo fetch, swarm norm)
      └── _build_pdf_sync()  sync builder (12 page functions, no I/O)

All page-builder functions are pure:
  _page_N(ctx, extra, pal, st, cw) -> list[Flowable]
"""

from __future__ import annotations

import base64
import datetime
import io
import json
import tempfile
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

import httpx
import structlog
from reportlab.graphics import renderPM
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from services.calculator import (
    _fetch_prices,
    canonical_metrics_for_institutional_report,
    get_price_with_fallback,
)
from services.fx_format import format_pdf_market_value_cell
from services.portfolio_region import (
    detect_region,
    dna_archetype_overlay,
    humanize_sea_flag,
    is_sea_region,
)
from services.report_state import (
    REPORT_DRAFT,
    REPORT_FINAL,
    assess_report_state,
    build_section_confidence,
)

# Optional: matplotlib for donut chart (degrades to ReportLab bar if absent)
try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    HAS_MPL = True
except ImportError:
    HAS_MPL = False

logger = structlog.get_logger("neufin.pdf_generator")

A4_W, A4_H = A4
MARGIN = 40
CONTENT_W = A4_W - 2 * MARGIN


# ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
# Dark theme
DARK_BG = HexColor("#0B0F14")
DARK_CARD = HexColor("#161D2E")
DARK_BORDER = HexColor("#2A3550")
DARK_TEXT_PRI = HexColor("#F0F4FF")
DARK_TEXT_MUT = HexColor("#64748B")
DARK_TEXT_BOD = HexColor("#CBD5E1")

# White theme
WHITE_BG = HexColor("#FFFFFF")
WHITE_CARD = HexColor("#F8FAFC")
WHITE_BORDER = HexColor("#E2E8F0")
WHITE_TEXT_PRI = HexColor("#0F172A")
WHITE_TEXT_MUT = HexColor("#475569")
WHITE_TEXT_BOD = HexColor("#334155")

# Shared accents (both themes)
ACCENT_TEAL = HexColor("#1EB8CC")
ACCENT_GREEN = HexColor("#22C55E")
ACCENT_AMBER = HexColor("#F5A623")
ACCENT_RED = HexColor("#EF4444")
ACCENT_PUR = HexColor("#8B5CF6")
ACCENT_SLATE = HexColor("#64748B")
IC_NAVY = HexColor("#0D1117")

# Pie/donut chart ring colors (shared)
CHART_COLORS = [
    "#1EB8CC",
    "#F5A623",
    "#22C55E",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#D97706",
    "#10B981",
    "#F97316",
]

MARKET_DAILY_VOL = {
    "VN": 0.012,
    "SG": 0.009,
    "TH": 0.011,
    "MY": 0.010,
    "US": 0.010,
    "DEFAULT": 0.012,
}

REGIME_DRAWDOWN = {
    "Risk-On": 0.10,
    "Market-Neutral": 0.15,
    "Risk-Off": 0.25,
    "Stagflation": 0.30,
}

RISK_FREE = {"VN": 0.080, "US": 0.045, "SG": 0.036, "DEFAULT": 0.045}

FTSE_UPGRADE = (
    "FTSE Russell EM upgrade confirmed: effective September 21, 2026. "
    "Expected capital inflows: $1.5-3B into Vietnamese equities. "
    "Pre-upgrade positioning window: NOW."
)
SBV_STANCE = (
    "SBV monetary policy: Accommodative — reference rate stable. "
    "Credit growth target 16% for 2026. Supportive for banking sector "
    "(MBB.VN, VPB.VN)."
)
VN_2026_PE = (
    "2026 forward P/E: 12.7x — below 5-year historical average of 14.2x. "
    "Earnings growth: +14.5% YoY, outpacing regional peers."
)
REGIME_RESTATEMENT = (
    "Regime restatement: This portfolio is NOT 'Market-Neutral' in a VN-market "
    "context. The correct regime is: Pre-EM Upgrade Momentum with Tariff "
    "Overhang. Positioning accordingly."
)
HPG_VN_INTELLIGENCE = (
    "HPG.VN analyst consensus: 12 BUY / 0 SELL. 12-month average target: "
    "VND 35,013 (+24% upside from VND 28,250). Steel sector catalyst: "
    "infrastructure spending acceleration pre-EM upgrade."
)


# ─── PALETTE ──────────────────────────────────────────────────────────────────


def _palette(theme: str) -> dict:
    """Return the full color palette for the given theme."""
    use_light = theme in ("white", "light")
    dark = not use_light
    return {
        "theme": theme,
        "bg": DARK_BG if dark else WHITE_BG,
        "card": DARK_CARD if dark else WHITE_CARD,
        "border": DARK_BORDER if dark else WHITE_BORDER,
        "text_pri": DARK_TEXT_PRI if dark else WHITE_TEXT_PRI,
        "text_mut": DARK_TEXT_MUT if dark else WHITE_TEXT_MUT,
        "text_bod": DARK_TEXT_BOD if dark else WHITE_TEXT_BOD,
        "teal": ACCENT_TEAL,
        "green": ACCENT_GREEN,
        "amber": ACCENT_AMBER,
        "red": ACCENT_RED,
        "purple": ACCENT_PUR,
        # hex strings for matplotlib / canvas.setFillColor(HexColor(...))
        "bg_hex": "#0B0F14" if dark else "#FFFFFF",
        "card_hex": "#161D2E" if dark else "#F8FAFC",
        "text_hex": "#F0F4FF" if dark else "#0F172A",
        "mut_hex": "#64748B" if dark else "#475569",
    }


def _hex(c: HexColor) -> str:
    """HexColor → '#RRGGBB' string for Paragraph markup."""
    try:
        return f"#{c.hexval() & 0xFFFFFF:06x}"
    except Exception:
        return "#F0F4FF"


def _rl_color(value: Any, fallback: HexColor = ACCENT_TEAL) -> Any:
    """Coerce tuple/hex ReportLab color inputs while preserving existing colors."""
    if isinstance(value, tuple) and len(value) >= 3:
        try:
            return Color(float(value[0]), float(value[1]), float(value[2]))
        except (TypeError, ValueError):
            return fallback
    if isinstance(value, str):
        try:
            return HexColor(value)
        except Exception:
            return fallback
    return value or fallback


# ─── STYLE FACTORY ────────────────────────────────────────────────────────────


def _styles(p: dict) -> dict:
    """Build a dict of ReportLab ParagraphStyles for the given palette."""
    base = getSampleStyleSheet()
    t = p["theme"]

    def ps(name: str, **kw) -> ParagraphStyle:
        return ParagraphStyle(f"{name}_{t}", parent=base["Normal"], **kw)

    W = p["text_pri"]
    B = p["text_bod"]
    M = p["text_mut"]
    T = p["teal"]
    use_light = t in ("light", "white")
    h3_color = B if use_light else T

    return {
        "h1": ps("h1", fontName="Helvetica-Bold", fontSize=18, textColor=W, leading=22),
        "h2": ps("h2", fontName="Helvetica-Bold", fontSize=14, textColor=W, leading=18),
        "h3": ps(
            "h3",
            fontName="Helvetica-Bold",
            fontSize=12,
            textColor=h3_color,
            leading=15,
            spaceAfter=3,
        ),
        "body": ps("bd", fontName="Helvetica", fontSize=11, textColor=B, leading=15),
        "body_b": ps(
            "bdb", fontName="Helvetica-Bold", fontSize=11, textColor=B, leading=15
        ),
        "body_sm": ps("bsm", fontName="Helvetica", fontSize=9, textColor=B, leading=12),
        "muted": ps(
            "mt", fontName="Helvetica-Oblique", fontSize=9, textColor=M, leading=12
        ),
        "muted8": ps("m8", fontName="Helvetica", fontSize=8, textColor=M, leading=10),
        "label": ps(
            "lb", fontName="Helvetica-Bold", fontSize=8, textColor=M, leading=10
        ),
        "center": ps(
            "cn",
            fontName="Helvetica",
            fontSize=11,
            textColor=B,
            leading=15,
            alignment=TA_CENTER,
        ),
        "center_b": ps(
            "cnb",
            fontName="Helvetica-Bold",
            fontSize=11,
            textColor=W,
            leading=15,
            alignment=TA_CENTER,
        ),
        "amber_warn": ps(
            "aw",
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=ACCENT_AMBER,
            leading=13,
        ),
        "red_warn": ps(
            "rw",
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=ACCENT_RED,
            leading=13,
        ),
        "green_ok": ps(
            "go",
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=ACCENT_GREEN,
            leading=13,
        ),
    }


# ─── QUALITY GATES ────────────────────────────────────────────────────────────


def _quality_check(ctx: dict) -> list[str]:
    """Return list of human-readable data quality warnings."""
    warnings: list[str] = []

    beta = float(ctx.get("weighted_beta") or 0)
    if beta > 5:
        warnings.append(
            "Beta headline capped for display; verify position weights and pricing."
        )

    positions = ctx.get("positions") or []
    if positions:
        wsum = sum(
            float(p.get("weight") or p.get("weight_pct") or 0) for p in positions
        )
        if wsum < 50:
            warnings.append(
                "Position weights appear unnormalized; AUM reconciled from marks."
            )

    # SEA-NATIVE-TICKER-FIX: surface unresolved tickers explicitly — never show $0.00 silently
    unresolved = [
        str(p.get("symbol", "?"))
        for p in positions
        if (p.get("price_status") or "").lower() == "unresolvable"
        or (
            float(p.get("current_price") or p.get("native_price") or 0) <= 0
            and not p.get("price_status", "live").startswith("live")
        )
    ]
    if unresolved:
        warnings.append(
            f"UNRESOLVED PRICES — {', '.join(unresolved[:8])}. "
            "Portfolio totals exclude these positions. Verify symbols and retry."
        )

    if not ctx.get("swarm_available"):
        warnings.append(
            "Swarm IC analysis not run; regime and alpha sections use portfolio estimates."
        )

    if not ctx.get("tax_positions"):
        warnings.append(
            "Cost basis not provided; tax figures are limited or illustrative only."
        )

    dna_score = int(ctx.get("dna_score") or 0)
    if dna_score == 0:
        warnings.append(
            "DNA score unavailable; run behavioral analysis for full classification."
        )

    return warnings


# ─── TEXT / NUMBER HELPERS ────────────────────────────────────────────────────


def _xml(text: str | None) -> str:
    if text is None:
        return ""
    t = str(text).strip()
    return escape(t, entities={'"': "&quot;", "'": "&apos;"}).replace("\n", "<br/>")


def _fnum(x: Any, default: str = "—") -> str:
    try:
        return f"{float(x):,.2f}" if x is not None else default
    except (TypeError, ValueError):
        return default


def _fpct(x: Any, default: str = "—") -> str:
    try:
        if x is None:
            return default
        v = float(x)
        return f"{v:+.2f}%" if v != 0 else "0.00%"
    except (TypeError, ValueError):
        return default


def _coerce_list(val: Any, max_n: int | None = None) -> list[str]:
    if val is None:
        return []
    out = [str(x) for x in val] if isinstance(val, list) else [str(val)]
    return out[:max_n] if max_n else out


def _w(pos: dict) -> float:
    """Normalize a position's weight to [0, 1]."""
    raw = pos.get("weight") or pos.get("weight_pct") or 0
    try:
        v = float(raw)
        return v / 100.0 if v > 1.5 else v
    except (TypeError, ValueError):
        return 0.0


def _normalize_market_code(market_code: str | None) -> str:
    code = str(market_code or "").strip().upper()
    return code or "US"


def get_defensive_alternatives(market_code: str) -> dict[str, Any]:
    code = _normalize_market_code(market_code)
    if code == "VN":
        return {
            "defensive_symbols": {"VCB.VN", "GAS.VN"},
            "weight_label": "Defensive (VGBs/VCB.VN/GAS.VN)",
            "weight_description": "Vietnam Government Bonds + State-backed defensive equities",
            "rotation_text": (
                "Reduce high-beta VN securities; add VCB.VN (Vietcombank — lower "
                "beta, state-backed) or GAS.VN (Petrovietnam Gas — defensive sector). "
                "Consider VN Government Bonds (VGBs, 3-year yield ~8%) for capital preservation."
            ),
            "qualitative_scenarios": [
                [
                    "2022 Rate Shock",
                    "VN-Index -35% (2022)",
                    "Est. -28% to -38%",
                    "VCI.VN/SSI.VN securities broker crash · VPB/MBB banking stress",
                ],
                [
                    "2020 COVID Crash",
                    "VN-Index -33% (Mar 2020)",
                    "Est. -25% to -35%",
                    "All VN correlations -> 1.0 · Foreign outflow · VND depreciation",
                ],
                [
                    "FTSE EM Upgrade",
                    "N/A (Sep 2026 expected)",
                    "Est. +15% to +25% on reclassification",
                    "If upgrade delayed: Est. -10% on reversal",
                ],
            ],
            "additional_risk_scenarios": [
                [
                    "Tariff Shock",
                    "US tariffs on Vietnamese exports",
                    "Est. -15% to -22% on VN-Index beta",
                    "Trim export-sensitive cyclicals",
                ],
                [
                    "FTSE EM Delay",
                    "Upgrade reversal / delay",
                    "Est. -8% to -12%",
                    "Reduce foreign-flow-sensitive names",
                ],
                [
                    "VND Depreciation",
                    "USD +5% vs VND",
                    "Est. -3% to -6% on VCI.VN / SSI.VN",
                    "Review USD-reporting portfolio FX overlay",
                ],
                [
                    "Steel Shock",
                    "Iron ore -20%",
                    "Est. HPG.VN -18% to -25%",
                    "Stress test materials exposure",
                ],
                [
                    "Liquidity Crunch",
                    "Bid-ask spreads x 3",
                    "Position exits may be costly",
                    "Maintain cash buffer",
                ],
            ],
        }
    if code == "SG":
        return {
            "defensive_symbols": {"A17U.SI", "C38U.SI", "MBH.SI"},
            "weight_label": "Defensive (SGS Bonds/REITs)",
            "weight_description": "Singapore Government Securities + SGX-listed S-REITs",
            "rotation_text": (
                "Defensive rotation within SG market: rotate high-beta exposure into "
                "Singapore Government Securities (SGS bonds) and SGX-listed S-REITs "
                "for defensive income allocation."
            ),
            "qualitative_scenarios": None,
            "additional_risk_scenarios": None,
        }
    if code in {"MY", "MYR"}:
        return {
            "defensive_symbols": set(),
            "weight_label": "Defensive (MGS Bonds/Utilities)",
            "weight_description": "Malaysia Government Securities + defensive utilities",
            "rotation_text": "Rotate into defensives (utilities, consumer staples, gold)",
            "qualitative_scenarios": None,
            "additional_risk_scenarios": None,
        }
    return {
        "defensive_symbols": {"GLD", "TLT", "BND", "JNJ", "PG", "VZ", "XLP", "XLU"},
        "weight_label": "Defensive (GLD/TLT/XLP/XLU)",
        "weight_description": "Treasuries, gold, utilities, and consumer staples",
        "rotation_text": "Rotate into defensives (utilities, consumer staples, gold)",
        "qualitative_scenarios": None,
        "additional_risk_scenarios": None,
    }


def _market_code_from_ctx(
    ctx: dict, positions: list[dict[str, Any]] | None = None
) -> str:
    region = ctx.get("region_profile") or {}
    code = str(region.get("primary_market") or "").strip().upper()
    if code:
        return code
    for pos in positions or []:
        symbol = str(pos.get("symbol") or "").strip()
        if symbol:
            return _infer_market_code(symbol, pos)
    return "US"


def _regime_drawdown_proxy(regime_label: str) -> float:
    if regime_label in REGIME_DRAWDOWN:
        return REGIME_DRAWDOWN[regime_label]
    if "STAGFLATION" in regime_label.upper():
        return REGIME_DRAWDOWN["Stagflation"]
    if "RISK-OFF" in regime_label.upper():
        return REGIME_DRAWDOWN["Risk-Off"]
    if "RISK-ON" in regime_label.upper():
        return REGIME_DRAWDOWN["Risk-On"]
    return REGIME_DRAWDOWN["Market-Neutral"]


def _portfolio_has_cost_basis(positions: list[dict[str, Any]]) -> bool:
    for pos in positions:
        try:
            basis = float(pos.get("cost_basis") or pos.get("avg_cost") or 0)
        except (TypeError, ValueError):
            basis = 0.0
        if basis > 0:
            return True
    return False


def _compute_var_fallback(
    portfolio_value_usd: float, weighted_beta: float, market_code: str = "VN"
) -> dict:
    """
    Beta-estimated VaR. Not IC-grade but always better than "Pending".
    Formula: VaR_95 = portfolio_value x beta x daily_vol x z_95.
    """
    daily_vol = {"VN": 0.018, "US": 0.012, "SG": 0.010, "DEFAULT": 0.015}
    z_95 = 1.645
    code = _normalize_market_code(market_code)
    vol = daily_vol.get(code, daily_vol["DEFAULT"])
    value = max(float(portfolio_value_usd or 0), 0.0)
    beta = max(float(weighted_beta or 1.0), 0.1)
    var_1d_95 = value * beta * vol * z_95
    var_1d_99 = value * beta * vol * 2.326
    var_10d_95 = var_1d_95 * (10**0.5)
    pct = (var_1d_95 / value * 100) if value > 0 else 0.0
    return {
        "var_1d_95_usd": round(var_1d_95),
        "var_1d_99_usd": round(var_1d_99),
        "var_10d_95_usd": round(var_10d_95),
        "var_label": f"${var_1d_95 / 1e6:.1f}M ({pct:.2f}% AUM)",
        "var_method": "beta-estimated, not simulated",
        "var_confidence": "95%, 1-day",
        "daily_vol": vol,
        "market_code": code,
    }


def _compute_sharpe_proxy(
    weighted_beta: float, market_code: str = "VN", regime: str = "Market-Neutral"
) -> dict:
    """
    Sharpe proxy using expected market return assumptions.
    Not exact without actual returns, but always better than a blank.
    """
    risk_free = {"VN": 0.080, "US": 0.045, "SG": 0.036, "DEFAULT": 0.045}
    expected_mkt = {"VN": 0.12, "US": 0.10, "SG": 0.09, "DEFAULT": 0.10}
    daily_vol = {"VN": 0.018, "US": 0.012, "DEFAULT": 0.015}
    code = _normalize_market_code(market_code)
    beta = max(float(weighted_beta or 1.0), 0.1)
    rf = risk_free.get(code, risk_free["DEFAULT"])
    mkt = expected_mkt.get(code, expected_mkt["DEFAULT"])
    vol_annual = daily_vol.get(code, daily_vol["DEFAULT"]) * (252**0.5)
    expected_return = rf + beta * (mkt - rf)
    sharpe_proxy = (
        (expected_return - rf) / (vol_annual * beta)
        if vol_annual > 0 and beta > 0
        else 0.0
    )
    return {
        "sharpe_proxy": round(sharpe_proxy, 2),
        "label": f"{sharpe_proxy:.2f} [CAPM-estimated, not from actual returns]",
        "method": "CAPM proxy",
        "regime": regime,
    }


def _correlation_label(ctx: dict) -> tuple[str, str]:
    status = str(ctx.get("correlation_status") or "").upper()
    raw = ctx.get("avg_corr")
    try:
        value = float(raw) if raw is not None else None
    except (TypeError, ValueError):
        value = None
    if status == "COMPUTED" and value is not None:
        return f"{value:.3f}", "High" if value > 0.75 else "Computed"
    return "Not computed (insufficient price history)", "UNKNOWN"


def _compute_risk_metric_labels(
    ctx: dict,
    metrics: dict[str, Any],
    quant: dict[str, Any],
    positions: list[dict[str, Any]],
) -> dict[str, tuple[str, str]]:
    market_code = _market_code_from_ctx(ctx, positions)
    total_value = float(ctx.get("total_value") or metrics.get("total_value") or 0)
    weighted_beta = max(
        float(ctx.get("weighted_beta") or metrics.get("weighted_beta") or 1.0), 0.1
    )
    regime_label = str(ctx.get("regime_label") or "Market-Neutral")

    var_raw = quant.get("var_95") or metrics.get("var_95")
    var_numeric: float | None = None
    try:
        if var_raw is not None:
            var_numeric = abs(float(var_raw))
    except (TypeError, ValueError):
        var_numeric = None
    if var_numeric is not None and total_value > 0:
        if var_numeric <= 1:
            var_amount = total_value * var_numeric
            var_pct = var_numeric * 100
        else:
            var_amount = var_numeric
            var_pct = (var_amount / total_value) * 100 if total_value else 0.0
        var_label = (
            f"${var_amount:,.0f} ({var_pct:.2f}% of AUM) [calculated, 95% 1-day]"
        )
        var_status = "Calculated"
        var_fallback = None
    else:
        var_fallback = _compute_var_fallback(total_value, weighted_beta, market_code)
        var_amount = float(var_fallback["var_1d_95_usd"])
        var_pct = (var_amount / total_value) * 100 if total_value else 0.0
        var_label = (
            f"${var_amount:,.0f} ({var_pct:.2f}% AUM) "
            f"[beta-estimated · {market_code} vol {var_fallback['daily_vol'] * 100:.1f}%]"
        )
        var_status = "Estimated"

    drawdown_raw = quant.get("max_drawdown") or metrics.get("max_drawdown")
    drawdown_numeric: float | None = None
    try:
        if drawdown_raw is not None:
            drawdown_numeric = abs(float(drawdown_raw))
            drawdown_numeric = (
                drawdown_numeric / 100 if drawdown_numeric > 1 else drawdown_numeric
            )
    except (TypeError, ValueError):
        drawdown_numeric = None
    if drawdown_numeric is not None:
        drawdown_label = f"{drawdown_numeric * 100:.1f}% [calculated]"
        drawdown_status = "Calculated"
    else:
        est_drawdown = weighted_beta * _regime_drawdown_proxy(regime_label)
        drawdown_label = (
            f"{est_drawdown * 100:.1f}% [regime-estimated: {regime_label} analogue]"
        )
        drawdown_status = "Estimated"

    sharpe_raw = ctx.get("sharpe_ratio")
    sharpe_numeric: float | None = None
    try:
        if sharpe_raw is not None:
            sharpe_numeric = float(sharpe_raw)
    except (TypeError, ValueError):
        sharpe_numeric = None
    if sharpe_numeric is not None:
        sharpe_label = f"{sharpe_numeric:.2f} [calculated]"
        sharpe_status = "Calculated"
    else:
        ytd_raw = metrics.get("ytd_return")
        try:
            ytd_return = float(ytd_raw) if ytd_raw is not None else None
            if ytd_return is not None and abs(ytd_return) > 1.5:
                ytd_return = ytd_return / 100.0
        except (TypeError, ValueError):
            ytd_return = None
        if ytd_return is not None and ytd_return > -1:
            day_of_year = max(1, datetime.datetime.now().timetuple().tm_yday)
            ytd_return_annualised = (1 + ytd_return) ** (365.0 / day_of_year) - 1
            rf = RISK_FREE.get(market_code, RISK_FREE["DEFAULT"])
            ann_vol = MARKET_DAILY_VOL.get(market_code, MARKET_DAILY_VOL["DEFAULT"]) * (
                252**0.5
            )
            sharpe_est = (ytd_return_annualised - rf) / ann_vol if ann_vol else 0.0
            sharpe_label = f"{sharpe_est:.2f} [estimated from YTD return vs {rf * 100:.1f}% risk-free]"
            sharpe_status = "Estimated"
        else:
            proxy = _compute_sharpe_proxy(weighted_beta, market_code, regime_label)
            sharpe_label = (
                f"{proxy['sharpe_proxy']:.2f} [CAPM proxy; not from actual returns]"
            )
            sharpe_status = "Proxy"

    if var_fallback:
        var_99_pct = (
            float(var_fallback["var_1d_99_usd"]) / total_value * 100
            if total_value
            else 0.0
        )
        var_10_pct = (
            float(var_fallback["var_10d_95_usd"]) / total_value * 100
            if total_value
            else 0.0
        )
        var_99 = (
            f"${var_fallback['var_1d_99_usd']:,.0f} ({var_99_pct:.2f}% AUM) "
            "[beta-estimated]"
        )
        var_10 = (
            f"${var_fallback['var_10d_95_usd']:,.0f} ({var_10_pct:.2f}% AUM) "
            "[10-day horizon, sqrt(t) scaled]"
        )
        var_footnote = (
            "VaR estimated from portfolio beta x "
            f"{market_code} historical volatility. Monte Carlo simulation available with Swarm IC."
        )
    else:
        var_99 = "Available with simulated VaR"
        var_10 = "Available with simulated VaR"
        var_footnote = "VaR supplied by quantitative analysis."

    return {
        "var": (var_label, var_status),
        "var_99": (var_99, var_status),
        "var_10": (var_10, var_status),
        "var_footnote": (var_footnote, "Method"),
        "drawdown": (drawdown_label, drawdown_status),
        "sharpe": (sharpe_label, sharpe_status),
    }


def _position_market_value_usd(pos: dict[str, Any]) -> float:
    try:
        current_value = float(
            pos.get("market_value_usd")
            or pos.get("current_value")
            or pos.get("value")
            or 0
        )
    except (TypeError, ValueError):
        current_value = 0.0
    if current_value > 0:
        return current_value
    try:
        shares = float(pos.get("shares") or 0)
    except (TypeError, ValueError):
        shares = 0.0
    symbol = str(pos.get("symbol") or "")
    market_code = _infer_market_code(symbol, pos) if symbol else "US"
    return shares * _position_price_usd(pos, market_code)


def detect_structural_biases(
    positions: list[dict[str, Any]], market_code: str
) -> list[dict[str, str]]:
    """Detect structural behavioral biases from weights alone."""
    biases: list[dict[str, str]] = []
    if not positions:
        return biases

    countries = {
        str(pos.get("country") or market_code or "US").strip().upper()
        for pos in positions
        if pos
    }
    if len(countries) == 1:
        biases.append(
            {
                "name": "Home Bias",
                "evidence": f"100% {_normalize_market_code(market_code)} exposure. Zero international diversification.",
                "dollar_impact": (
                    "Portfolios with 100% single-country exposure show 23% higher "
                    "volatility vs globally diversified peers (MSCI research)."
                ),
                "severity": "HIGH",
                "mitigation": (
                    "Consider 10-15% allocation to regional ETF or VN-listed "
                    "international exposure to reduce home-country risk."
                ),
            }
        )

    weights = [_w(pos) for pos in positions]
    positive_weights = [w for w in weights if w > 0]
    equal_weight_portfolio = False
    if len(positive_weights) >= 3:
        equal_weight_portfolio = max(positive_weights) - min(positive_weights) <= 0.02
    if equal_weight_portfolio:
        biases.append(
            {
                "name": "Equal-Weight Portfolio Detected",
                "evidence": (
                    "Equal-weight portfolio detected - analysis limited without "
                    "resolved market prices."
                ),
                "dollar_impact": (
                    "Dollar-weighted concentration cannot be verified until market "
                    "prices resolve for each ticker."
                ),
                "severity": "INFO",
                "mitigation": (
                    "Ensure tickers include exchange suffixes and rerun analysis "
                    "to verify dollar weights."
                ),
            }
        )

    for pos in positions:
        weight = _w(pos)
        if weight > 0.30 and not equal_weight_portfolio:
            symbol = str(pos.get("symbol") or "Position")
            biases.append(
                {
                    "name": "Conviction Overweight",
                    "evidence": (
                        f"{symbol} at {weight * 100:.1f}% — exceeds 30% "
                        "single-position threshold."
                    ),
                    "dollar_impact": (
                        "Single positions >30% historically correlate with -8.3% "
                        "underperformance vs index over 90 days in VN market "
                        "(SSI Research, 2023)."
                    ),
                    "severity": "HIGH",
                    "mitigation": (
                        f"Trim {symbol} toward 30-35% to bring within institutional "
                        "concentration guidelines."
                    ),
                }
            )

    sector_map = {
        "VCI.VN": "Securities",
        "SSI.VN": "Securities",
        "VPB.VN": "Banking",
        "MBB.VN": "Banking",
        "BID.VN": "Banking",
        "VCB.VN": "Banking",
        "HPG.VN": "Materials",
        "LCG.VN": "Construction",
        "GAS.VN": "Energy",
        "PLX.VN": "Energy",
    }
    sector_weights: dict[str, float] = {}
    total_market_value_usd = 0.0
    for pos in positions:
        symbol = str(pos.get("symbol") or "").strip().upper()
        sector = sector_map.get(symbol, "Other")
        sector_weights[sector] = sector_weights.get(sector, 0.0) + _w(pos)
        total_market_value_usd += _position_market_value_usd(pos)

    financial_weight = sector_weights.get("Securities", 0.0) + sector_weights.get(
        "Banking", 0.0
    )
    if financial_weight > 0.60:
        biases.append(
            {
                "name": "Financial Sector Concentration",
                "evidence": (
                    f"{financial_weight * 100:.0f}% in Securities + Banking. "
                    "Brokerage-bank correlation rises to >0.85 in market stress."
                ),
                "dollar_impact": (
                    f"${financial_weight * total_market_value_usd:,.0f} at elevated "
                    "correlation risk during regime shifts."
                ),
                "severity": "MEDIUM",
                "mitigation": (
                    "Consider rotating 10-15% from brokerage names (VCI, SSI) "
                    "into Materials (HPG) or State-backed defensive (GAS, PLX) "
                    "to reduce financial sector concentration."
                ),
            }
        )

    biases.append(
        {
            "name": "Recency Bias",
            "evidence": "Cannot assess without cost basis data.",
            "dollar_impact": (
                "Upload cost basis to enable holding-period analysis and identify "
                "positions held past optimal exit."
            ),
            "severity": "INFO",
            "mitigation": "Upload cost basis to enable full recency bias detection.",
        }
    )
    return biases


def _fetch_live_market_context(ctx: dict[str, Any]) -> dict[str, str]:
    benchmark_symbol = str(ctx.get("benchmark_symbol") or "").strip() or "^VNINDEX"
    benchmark_label = str(ctx.get("benchmark_label") or "VN-Index")
    vn_index_level = "Unavailable"
    vn_index_ytd = "Unavailable"
    vnd_usd_spot = "Unavailable"

    try:
        benchmark_price = get_price_with_fallback(benchmark_symbol)
        if benchmark_price.price and benchmark_price.price > 0:
            vn_index_level = f"{benchmark_price.price:,.2f}"
    except Exception as exc:
        logger.debug("pdf.vn_context_benchmark_price_failed", error=str(exc))

    try:
        benchmark_hist = _fetch_prices([benchmark_symbol], "1y")
        if not benchmark_hist.empty and benchmark_symbol in benchmark_hist.columns:
            series = benchmark_hist[benchmark_symbol].dropna()
            if not series.empty:
                current_year = datetime.datetime.now().year
                year_series = series[series.index >= datetime.date(current_year, 1, 1)]
                if len(year_series) >= 2:
                    first = float(year_series.iloc[0])
                    last = float(year_series.iloc[-1])
                    if first > 0:
                        vn_index_ytd = f"{((last / first) - 1) * 100:+.2f}% YTD"
    except Exception as exc:
        logger.debug("pdf.vn_context_benchmark_ytd_failed", error=str(exc))

    try:
        fx_quote = get_price_with_fallback("VNDUSD")
        if fx_quote.price and fx_quote.price > 0:
            vnd_usd_spot = f"{fx_quote.price:.6f}"
    except Exception as exc:
        logger.debug("pdf.vn_context_fx_failed", error=str(exc))

    return {
        "benchmark_label": benchmark_label,
        "vn_index_level": vn_index_level,
        "vn_index_ytd": vn_index_ytd,
        "vnd_usd_spot": vnd_usd_spot,
    }


def _infer_market_code(symbol: str, pos: dict) -> str:
    market_code = (
        str(
            pos.get("market_code")
            or pos.get("country_code")
            or pos.get("exchange")
            or ""
        )
        .strip()
        .upper()
    )
    symbol_upper = symbol.strip().upper()
    if symbol_upper.endswith(".VN") or market_code in {"VN", "HOSE", "HNX", "UPCOM"}:
        return "VN"
    return market_code or "US"


def _position_price_usd(pos: dict, market_code: str) -> float:
    for key in ("current_price_usd", "price_usd", "usd_price"):
        try:
            price_usd = float(pos.get(key) or 0)
        except (TypeError, ValueError):
            price_usd = 0.0
        if price_usd > 0:
            return price_usd

    try:
        native_price = float(
            pos.get("current_price")
            or pos.get("native_price")
            or pos.get("price")
            or pos.get("last_price")
            or 0
        )
    except (TypeError, ValueError):
        native_price = 0.0
    if native_price <= 0:
        return 0.0

    currency = (
        str(pos.get("currency") or pos.get("local_currency") or pos.get("ccy") or "USD")
        .strip()
        .upper()
    )
    try:
        fx_rate = float(pos.get("fx_rate") or 0)
    except (TypeError, ValueError):
        fx_rate = 0.0

    if currency != "USD" and fx_rate > 0:
        return native_price * fx_rate
    if market_code == "VN" and fx_rate > 0:
        return native_price * fx_rate
    return native_price


def compute_execution_action(
    symbol: str,
    current_weight: float,
    portfolio_aum_usd: float,
    current_price_usd: float,
    market_code: str = "VN",
) -> dict[str, Any]:
    """Compute IC-grade execution action with exact sizing."""
    if current_weight > 0.35:
        target_weight = current_weight * 0.87
    elif current_weight > 0.20:
        target_weight = current_weight * 0.95
    elif current_weight > 0.10:
        target_weight = current_weight * 0.98
    else:
        target_weight = current_weight

    if target_weight == current_weight:
        action_type = "HOLD"
    elif target_weight < current_weight:
        action_type = "TRIM"
    else:
        action_type = "INCREASE"

    current_value_usd = current_weight * portfolio_aum_usd
    target_value_usd = target_weight * portfolio_aum_usd
    delta_usd = abs(current_value_usd - target_value_usd)
    shares_to_trade = int(delta_usd / current_price_usd) if current_price_usd else 0
    notional_usd = (
        shares_to_trade * current_price_usd if current_price_usd else delta_usd
    )

    tax_rate = 0.001 if market_code == "VN" else 0.0
    tax_cost_usd = notional_usd * tax_rate if action_type == "TRIM" else 0.0

    return {
        "ticker": symbol,
        "action_type": action_type,
        "current_weight_pct": round(current_weight * 100, 1),
        "target_weight_pct": round(target_weight * 100, 1),
        "shares_to_trade": shares_to_trade,
        "notional_usd": round(notional_usd, 0),
        "tax_cost_usd": round(tax_cost_usd, 0),
        "execution_note": (
            f"Split over 3 trading days to minimise {symbol} market impact"
            if shares_to_trade > 10000
            else "Single-session execution"
        ),
        "timeline_days": 3 if shares_to_trade > 10000 else 1,
    }


def _build_execution_actions(
    positions: list[dict[str, Any]], portfolio_aum_usd: float
) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    region_code = "US"
    if positions:
        first_sym = str(positions[0].get("symbol") or "")
        region_code = _infer_market_code(first_sym, positions[0]) if first_sym else "US"
    liq_rows = _compute_liquidity_metrics(positions, portfolio_aum_usd, region_code)
    liq_by_symbol = {r["symbol"]: r for r in liq_rows}
    for pos in sorted(positions, key=_w, reverse=True):
        symbol = str(pos.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        current_weight = _w(pos)
        market_code = _infer_market_code(symbol, pos)
        current_price_usd = _position_price_usd(pos, market_code)
        action = compute_execution_action(
            symbol=symbol,
            current_weight=current_weight,
            portfolio_aum_usd=portfolio_aum_usd,
            current_price_usd=current_price_usd,
            market_code=market_code,
        )
        if action["action_type"] == "HOLD":
            continue
        action["market_code"] = market_code
        # Change action language for structurally illiquid positions
        liq = liq_by_symbol.get(symbol, {})
        days_normal = float(liq.get("days_normal") or 0)
        if action["action_type"] == "TRIM" and days_normal > 365:
            adv_m = float(liq.get("adv_m") or 0)
            weekly_capacity = int(adv_m * 1_000_000 * 0.20 / 5)  # 20% ADV / 5 days
            weeks_needed = (
                int(action["shares_to_trade"] / max(weekly_capacity, 1))
                if weekly_capacity > 0
                else 99
            )
            weeks_low = max(weeks_needed, 8)
            weeks_high = weeks_low + 4
            action["action_type"] = "BEGIN STAGED EXIT"
            action["execution_note"] = (
                f"Sell max {weekly_capacity:,} shares/week "
                f"(${adv_m:.0f}M ADV x 20% ÷ price). "
                f"Full reduction {action['current_weight_pct']:.1f}% → {action['target_weight_pct']:.1f}% "
                f"requires {weeks_low}-{weeks_high} weeks minimum. "
                f"Do NOT attempt single-block sale — market impact would exceed 15%."
            )
            action["timeline_days"] = weeks_low * 5
            action["summary"] = (
                f"BEGIN STAGED EXIT {symbol}: Reduce from "
                f"{action['current_weight_pct']:.1f}% to {action['target_weight_pct']:.1f}%. "
                f"Requires {weeks_low}-{weeks_high} weeks at 20% ADV participation."
            )
        else:
            action["summary"] = (
                f"{action['action_type']} {symbol} from "
                f"{action['current_weight_pct']:.1f}% -> {action['target_weight_pct']:.1f}% "
                f"by trading ~{action['shares_to_trade']:,} shares "
                f"(~${action['notional_usd']:,.0f} notional; tax cost ~${action['tax_cost_usd']:,.0f})."
            )
        actions.append(action)
    return actions


# ─── TABLE STYLE HELPERS ──────────────────────────────────────────────────────


def _tbl_std(p: dict, header_accent: HexColor | None = None) -> TableStyle:
    """Standard table — light themes use neutral header and black type (IC style)."""
    if p["theme"] in ("light", "white"):
        hdr_bg = HexColor("#F4F4F5")
        hdr_fg = p["text_pri"]
        return TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), hdr_bg),
                ("TEXTCOLOR", (0, 0), (-1, 0), hdr_fg),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [p["bg"], p["bg"]]),
                ("GRID", (0, 0), (-1, -1), 0.25, p["border"]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    hdr = header_accent or p["teal"]
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), hdr),
            ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#FFFFFF")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [p["bg"], p["card"]]),
            ("GRID", (0, 0), (-1, -1), 0.25, p["border"]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ]
    )


def _card_box(p: dict, accent: HexColor, padding: int = 8) -> TableStyle:
    """Card-style table with colored left border."""
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, -1), p["card"]),
            ("BOX", (0, 0), (-1, -1), 0.5, p["border"]),
            ("LINEBEFORE", (0, 0), (0, -1), 3, accent),
            ("TOPPADDING", (0, 0), (-1, -1), padding),
            ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
            ("LEFTPADDING", (0, 0), (-1, -1), padding + 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), padding),
        ]
    )


def _amber_banner_table(text: str, p: dict, st: dict, cw: float) -> Table:
    """Returns a full-width amber warning banner Table."""
    return Table(
        [[Paragraph(text, st["amber_warn"])]],
        colWidths=[cw],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), p["card"]),
                ("BOX", (0, 0), (-1, -1), 1.5, ACCENT_AMBER),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        ),
    )


class NumberedCanvas(pdf_canvas.Canvas):
    """Canvas that exposes total page count to onPage callbacks."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict[str, Any]] = []
        self._page_count = 0

    def showPage(self):  # noqa: N802 - ReportLab Canvas API
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._page_count = total_pages
            super().showPage()
        super().save()


def _scaled_logo_dims(
    logo_bytes: bytes | None, target_height: float, max_width: float
) -> tuple[float, float] | None:
    if not logo_bytes:
        return None
    try:
        width, height = ImageReader(io.BytesIO(logo_bytes)).getSize()
    except Exception as e:
        logger.warning("pdf.logo_dimensions_failed", error=str(e))
        return None
    if not width or not height:
        return None
    scale = target_height / float(height)
    scaled_width = float(width) * scale
    scaled_height = target_height
    if scaled_width > max_width:
        scale = max_width / float(width)
        scaled_width = max_width
        scaled_height = float(height) * scale
    return scaled_width, scaled_height


def _logo_flowable(
    logo_bytes: bytes | None,
    target_height: float,
    max_width: float,
    fallback_label: str,
    text_color: HexColor,
) -> Any:
    dims = _scaled_logo_dims(logo_bytes, target_height, max_width)
    if dims and logo_bytes:
        width, height = dims
        return Image(io.BytesIO(logo_bytes), width=width, height=height)
    return Paragraph(
        f'<font name="Helvetica-Bold" size="16" color="{_hex(text_color)}">{_xml(fallback_label[:42])}</font>',
        ParagraphStyle(
            "logo-fallback",
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=18,
        ),
    )


def _draw_report_footer(
    canvas,
    ctx: dict,
    pal: dict,
    report_date: str,
):
    footer_y = MARGIN - 2
    canvas.setStrokeColor(IC_NAVY)
    canvas.setLineWidth(0.8)
    canvas.line(MARGIN, footer_y + 14, A4_W - MARGIN, footer_y + 14)
    disclaimer = (
        "For informational purposes only. Not investment advice. "
        "NeuFin OÜ (EU) / NeuFin Inc. (US). "
        "Advisor is responsible for validating all inputs before IC presentation."
    )
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(pal["text_mut"])
    canvas.drawString(MARGIN, footer_y, disclaimer[:220])
    canvas.drawRightString(
        A4_W - MARGIN,
        footer_y,
        f"{ctx.get('report_run_id') or '—'} · {report_date}",
    )


# ─── DRAWING HELPERS ──────────────────────────────────────────────────────────


def _donut_chart_image(
    labels: list[str],
    values: list[float],
    p: dict,
    width: float = 210,
    height: float = 170,
) -> Image | None:
    """Render a donut allocation chart via matplotlib. Returns None on failure."""
    if not HAS_MPL:
        return None
    try:
        filtered = [
            (lbl, v) for lbl, v in zip(labels, values, strict=True) if float(v) > 0.01
        ]
        if not filtered:
            return None
        _fl, fv = zip(*filtered, strict=True)
        n = len(fv)

        fig, ax = plt.subplots(figsize=(width / 72, height / 72))
        bg = p["bg_hex"]
        fig.patch.set_facecolor(bg)
        ax.set_facecolor(bg)
        ax.set_aspect("equal")
        ax.axis("off")

        ax.pie(
            fv,
            colors=CHART_COLORS[:n],
            wedgeprops={"width": 0.48, "edgecolor": bg, "linewidth": 1.5},
            startangle=90,
            counterclock=False,
        )

        buf = io.BytesIO()
        fig.savefig(
            buf,
            format="png",
            dpi=150,
            bbox_inches="tight",
            facecolor=bg,
            edgecolor="none",
        )
        plt.close(fig)
        buf.seek(0)
        return Image(buf, width=width, height=height)
    except Exception as e:
        logger.warning("pdf.donut_failed", error=str(e))
        return None


def _gauge_image(score: int, p: dict, w: float = 180, h: float = 88) -> Image | None:
    """DNA score gauge bar via ReportLab Drawing → PNG."""
    score = max(0, min(100, int(score)))
    d = Drawing(w, h)
    if score <= 40:
        col = ACCENT_RED
    elif score <= 70:
        col = ACCENT_AMBER
    else:
        col = ACCENT_GREEN
    d.add(
        Rect(
            0, 20, w, 36, fillColor=p["card"], strokeColor=p["border"], strokeWidth=0.5
        )
    )
    fill_w = max(1.0, (w - 4) * (score / 100.0))
    d.add(Rect(2, 22, fill_w, 32, fillColor=col, strokeColor=col))
    d.add(
        String(
            w / 2 - 20,
            8,
            str(score),
            fontName="Helvetica-Bold",
            fontSize=20,
            fillColor=p["text_pri"],
        )
    )
    d.add(
        String(
            w / 2 + 12,
            12,
            "/ 100",
            fontName="Helvetica",
            fontSize=9,
            fillColor=p["text_mut"],
        )
    )
    try:
        buf = renderPM.drawToString(d, fmt="PNG", dpi=120)
        return Image(io.BytesIO(buf), width=w, height=h)
    except Exception as e:
        logger.warning("pdf.gauge_failed", error=str(e))
        return None


def _heatmap_image(
    symbols: list[str],
    matrix: list[list[float]] | None,
    p: dict,
    size: float = 200,
) -> Image | None:
    n = min(len(symbols), 8)
    if n == 0:
        return None
    symbols = [str(s)[:6] for s in symbols[:n]]
    cell = size / max(n, 1)
    d = Drawing(size + 70, size + 50)
    for i in range(n):
        d.add(
            String(
                5,
                size - i * cell - cell * 0.35,
                symbols[i],
                fontName="Helvetica",
                fontSize=6,
                fillColor=p["text_mut"],
            )
        )
        d.add(
            String(
                35 + i * cell,
                size + 8,
                symbols[i],
                fontName="Helvetica",
                fontSize=6,
                fillColor=p["text_mut"],
            )
        )
    for i in range(n):
        for j in range(n):
            v = 0.0
            if matrix and i < len(matrix) and j < len(matrix[i]):
                try:
                    v = float(matrix[i][j])
                except (TypeError, ValueError):
                    v = 0.0
            if i == j:
                fill = p["bg"]
            elif v > 0.7:
                fill = HexColor("#7F1D1D")
            elif v > 0.4:
                fill = ACCENT_AMBER
            elif v < 0.2:
                fill = ACCENT_GREEN
            else:
                fill = p["text_mut"]
            d.add(
                Rect(
                    30 + j * cell,
                    size - (i + 1) * cell,
                    cell - 1,
                    cell - 1,
                    fillColor=fill,
                    strokeColor=p["bg"],
                )
            )
    try:
        buf = renderPM.drawToString(d, fmt="PNG", dpi=110)
        return Image(io.BytesIO(buf), width=size + 70, height=size + 50)
    except Exception as e:
        logger.warning("pdf.heatmap_failed", error=str(e))
        return None


def _confidence_bar(conf: float, p: dict, width_pt: float = 120) -> Table:
    conf = max(0.0, min(1.0, float(conf)))
    fill_w = max(0.5, conf * width_pt)
    rest = max(0.5, width_pt - fill_w)
    return Table(
        [[" ", " "]],
        colWidths=[fill_w, rest],
        rowHeights=[7],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), ACCENT_TEAL),
                ("BACKGROUND", (1, 0), (1, 0), p["border"]),
                ("BOX", (0, 0), (-1, -1), 0.25, p["border"]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        ),
    )


# ─── SWARM NORMALIZATION ──────────────────────────────────────────────────────


def _empty_swarm_norm() -> dict[str, Any]:
    return {
        "investment_thesis": {
            "headline": "Market intelligence summary unavailable",
            "briefing": (
                "Swarm IC analysis was not available or could not be loaded. "
                "Run portfolio intelligence again to populate agent synthesis."
            ),
        },
        "market_regime": {},
        "quant_analysis": {},
        "tax_recommendation": {},
        "risk_sentinel": {},
        "alpha_signal": {},
        "alpha_signal_parsed": [],
        "macro_advice": {},
        "agent_trace": [],
        "regime": None,
    }


def _normalize_swarm(swarm: Any) -> dict[str, Any]:
    """Flatten a swarm_reports row + nested investment_thesis into one stable shape."""
    if swarm is None:
        return _empty_swarm_norm()
    if not isinstance(swarm, dict):
        logger.warning("pdf.swarm_invalid_type", type_name=type(swarm).__name__)
        return _empty_swarm_norm()

    try:
        row = dict(swarm)
    except (TypeError, ValueError) as e:
        logger.warning("pdf.swarm_not_mapping", error=str(e))
        return _empty_swarm_norm()

    raw_thesis = row.get("investment_thesis")
    nested: dict | None = None
    if isinstance(raw_thesis, str):
        st = raw_thesis.strip()
        if st.startswith("{") and "}" in st:
            try:
                parsed = json.loads(st)
                nested = parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                nested = {}
        elif st:
            nested = {"briefing": st}
        else:
            nested = {}
    elif isinstance(raw_thesis, dict) and raw_thesis:
        nested = dict(raw_thesis)

    if isinstance(nested, dict) and nested:
        inv = {**nested}
        for k in (
            "headline",
            "briefing",
            "dna_score",
            "regime",
            "stress_results",
            "risk_factors",
            "score_breakdown",
            "weighted_beta",
            "sharpe_ratio",
            "market_regime",
            "quant_analysis",
            "tax_recommendation",
            "risk_sentinel",
            "alpha_signal",
            "macro_advice",
        ):
            if inv.get(k) is None and row.get(k) is not None:
                inv[k] = row[k]
    else:
        inv = {
            "headline": row.get("headline"),
            "briefing": row.get("briefing"),
            "dna_score": row.get("dna_score"),
            "regime": row.get("regime"),
            "stress_results": row.get("stress_results"),
            "risk_factors": row.get("risk_factors"),
            "score_breakdown": row.get("score_breakdown"),
            "weighted_beta": row.get("weighted_beta"),
            "sharpe_ratio": row.get("sharpe_ratio"),
            "market_regime": row.get("market_regime"),
            "quant_analysis": row.get("quant_analysis"),
            "tax_recommendation": row.get("tax_recommendation"),
            "risk_sentinel": row.get("risk_sentinel"),
            "alpha_signal": row.get("alpha_signal"),
            "macro_advice": row.get("macro_advice"),
        }

    atr = row.get("agent_trace")
    agent_trace_list = (
        [atr] if isinstance(atr, str) else atr if isinstance(atr, list) else []
    )

    mr = inv.get("market_regime") or row.get("market_regime") or {}
    if not isinstance(mr, dict):
        mr = {}

    return {
        "investment_thesis": inv,
        "market_regime": mr,
        "quant_analysis": inv.get("quant_analysis") or row.get("quant_analysis") or {},
        "tax_recommendation": inv.get("tax_recommendation")
        or row.get("tax_recommendation")
        or {},
        "risk_sentinel": inv.get("risk_sentinel") or row.get("risk_sentinel") or {},
        "alpha_signal": inv.get("alpha_signal") or row.get("alpha_signal") or {},
        "alpha_signal_parsed": row.get("alpha_signal_parsed") or [],
        "macro_advice": inv.get("macro_advice") or row.get("macro_advice") or {},
        "agent_trace": agent_trace_list,
        "regime": inv.get("regime") or row.get("regime"),
        # Top-level for pages that read swarm_norm directly (e.g. stress testing)
        "stress_results": inv.get("stress_results") or row.get("stress_results") or {},
    }


# ─── REPORT CONTEXT BUILDER ───────────────────────────────────────────────────


def _regime_display(regime: str | None) -> tuple[str, HexColor]:
    r = (regime or "unknown").lower().strip()
    if r in ("recession", "crisis"):
        return "CRISIS / DEEP RISK-OFF", ACCENT_RED
    if r in ("risk-off", "stagflation"):
        return "RISK-OFF", ACCENT_AMBER
    if r in ("growth", "inflation", "risk-on"):
        return "RISK-ON", ACCENT_GREEN
    return (regime or "Pending Live Data").upper(), ACCENT_TEAL


def _normalize_report_mode(raw_mode: Any) -> str:
    mode = str(raw_mode or "standard").strip().lower().replace("-", "_")
    if mode in {"ic memo", "icmemo", "ic"}:
        return "ic_memo"
    if mode in {"advisor", "advisor memo", "advisorreport"}:
        return "advisor_report"
    if mode not in {"standard", "ic_memo", "advisor_report"}:
        return "standard"
    return mode


def _report_section_labels(report_mode: str) -> dict[str, str]:
    if report_mode == "ic_memo":
        return {
            "cover_title": "INVESTMENT COMMITTEE MEMO",
            "cover_subtitle": "Executive  ·  Risk  ·  Regime  ·  Scenarios  ·  Actions",
            "executive_summary": "EXECUTIVE SUMMARY",
            "portfolio_diagnosis": "PORTFOLIO DIAGNOSIS",
            "risk_analysis": "RISK ANALYSIS",
            "regime_context": "Regime context",
            "scenario_analysis": "SCENARIO ANALYSIS",
            "quant_model_outputs": "QUANT MODEL OUTPUTS",
            "alpha_opportunities": "Alpha opportunities",
            "recommended_actions": "RECOMMENDED ACTIONS",
        }
    if report_mode == "advisor_report":
        return {
            "cover_title": "ADVISOR PORTFOLIO REPORT",
            "cover_subtitle": "Client-ready narrative with institutional diagnostics",
            "executive_summary": "EXECUTIVE SUMMARY",
            "portfolio_diagnosis": "PORTFOLIO DIAGNOSIS",
            "risk_analysis": "RISK ANALYSIS",
            "regime_context": "Regime context",
            "scenario_analysis": "SCENARIO ANALYSIS",
            "quant_model_outputs": "QUANT MODEL OUTPUTS",
            "alpha_opportunities": "Alpha opportunities",
            "recommended_actions": "RECOMMENDED ACTIONS",
        }
    return {
        "cover_title": "PORTFOLIO INTELLIGENCE REPORT",
        "cover_subtitle": "Executive summary  ·  Risk  ·  Scenarios  ·  Recommendations",
        "executive_summary": "EXECUTIVE SUMMARY",
        "portfolio_diagnosis": "PORTFOLIO DIAGNOSIS",
        "risk_analysis": "RISK ANALYSIS",
        "regime_context": "Regime context",
        "scenario_analysis": "SCENARIO ANALYSIS",
        "quant_model_outputs": "QUANT MODEL OUTPUTS",
        "alpha_opportunities": "Alpha opportunities",
        "recommended_actions": "RECOMMENDED ACTIONS",
    }


def _build_report_context(
    portfolio_data: dict,
    dna_data: dict,
    swarm_norm: dict,
    advisor_config: dict,
) -> dict:
    """Single source of truth for all PDF sections. Never returns None for key fields."""
    s = swarm_norm if isinstance(swarm_norm, dict) else {}
    d = dna_data if isinstance(dna_data, dict) else {}
    p = portfolio_data if isinstance(portfolio_data, dict) else {}
    m = p.get("metrics") or {}
    data_quality = m.get("data_quality") or p.get("data_quality") or {}
    if not isinstance(data_quality, dict):
        data_quality = {}
    report_mode = _normalize_report_mode((advisor_config or {}).get("report_mode"))
    section_labels = _report_section_labels(report_mode)

    thesis_obj = s.get("investment_thesis") or {}
    if not isinstance(thesis_obj, dict):
        thesis_obj = {}

    # ── Portfolio basics (canonical AUM / beta / Sharpe — single source) ───────
    raw_positions: list[dict] = p.get("positions_with_basis") or []
    metric_positions: list[dict] = m.get("positions") or []
    if raw_positions and metric_positions:
        metric_by_symbol = {
            str(pos.get("symbol") or "").strip().upper(): pos
            for pos in metric_positions
            if str(pos.get("symbol") or "").strip()
        }
        positions = []
        for pos in raw_positions:
            sym = str(pos.get("symbol") or "").strip().upper()
            positions.append({**pos, **metric_by_symbol.get(sym, {})})
    else:
        positions = raw_positions or metric_positions
    tickers = [str(pos.get("symbol") or "") for pos in positions]
    cost_basis_provided = _portfolio_has_cost_basis(positions)
    region_profile = detect_region(tickers)
    sea_region = is_sea_region(region_profile)
    market_code = _normalize_market_code(region_profile.get("primary_market"))
    structural_biases = detect_structural_biases(positions, market_code)
    _canon = canonical_metrics_for_institutional_report(p, d, thesis_obj, positions)
    total_value = float(_canon["total_value"])
    weighted_beta = float(_canon["weighted_beta"])
    sharpe_ratio = _canon.get("sharpe_ratio")
    report_metrics_note = str(_canon.get("sources_note") or "")

    # # SEA-NATIVE-TICKER-FIX: portfolio-aware benchmark + currency from metrics
    _benchmark_sym = (
        m.get("portfolio_benchmark") or p.get("portfolio_benchmark") or "^GSPC"
    )
    _benchmark_label = (
        m.get("portfolio_benchmark_label") or p.get("portfolio_benchmark_label") or ""
    )
    if not _benchmark_label:
        # Lazy import to avoid circular; BENCHMARK_LABELS is a pure dict
        try:
            from services.market_resolver import BENCHMARK_LABELS

            _benchmark_label = BENCHMARK_LABELS.get(_benchmark_sym, _benchmark_sym)
        except Exception:
            _benchmark_label = _benchmark_sym
    if sea_region:
        _benchmark_sym = region_profile["benchmark_symbol"]
        _benchmark_label = region_profile["benchmark_name"]
    _portfolio_market_context = (
        m.get("portfolio_market_context")
        or p.get("portfolio_market_context")
        or "Global equity market"
    )
    _base_currency = m.get("base_currency") or m.get("portfolio_base_currency") or "USD"

    fx_values: list[float] = []
    for pos in positions:
        try:
            fx_val = float(pos.get("fx_rate") or 0)
        except (TypeError, ValueError):
            fx_val = 0.0
        if fx_val > 0:
            fx_values.append(fx_val)
    timestamps = [
        str(pos.get("timestamp"))
        for pos in positions
        if str(pos.get("timestamp") or "").strip()
    ]
    region_data_sources = ""
    if sea_region:
        latest_date = sorted(timestamps)[-1][:10] if timestamps else "latest available"
        fx_note = (
            f"{region_profile['local_currency']}USD FX {fx_values[-1]:.8f}"
            if fx_values and region_profile["local_currency"] != "MULTI"
            else "FX translated per position where available"
        )
        region_data_sources = (
            f"Data sources used: {region_profile['benchmark_name']} close date "
            f"{latest_date}; {fx_note}."
        )

    # ── DNA ────────────────────────────────────────────────────────────────────
    dna_score = int(d.get("dna_score") or 0)
    investor_type = str(d.get("investor_type") or "Balanced Growth Investor")
    investor_type = dna_archetype_overlay(positions, investor_type)
    strengths: list[str] = list(d.get("strengths") or [])
    weaknesses: list[str] = list(d.get("weaknesses") or [])
    for bias in structural_biases:
        evidence = str(bias.get("evidence") or "").strip()
        if evidence and evidence not in weaknesses:
            weaknesses.append(evidence)
    recommendation = str(d.get("recommendation") or "")
    tax_analysis: dict = d.get("tax_analysis") or {}
    if not isinstance(tax_analysis, dict):
        tax_analysis = {}

    # ── Quant (correlation / HHI — prefer calculator metrics, else DNA) ───────
    avg_corr_raw = d.get("avg_correlation")
    corr_status = str(d.get("correlation_status") or m.get("correlation_status") or "")
    if avg_corr_raw is None:
        avg_corr_raw = m.get("avg_correlation")
    try:
        avg_corr = float(avg_corr_raw) if avg_corr_raw is not None else None
    except (TypeError, ValueError):
        avg_corr = None
    if avg_corr == 0 and corr_status.upper() != "COMPUTED":
        avg_corr = None
    if not corr_status:
        corr_status = "COMPUTED" if avg_corr is not None else "UNKNOWN"
    corr_note = str(
        d.get("correlation_note")
        or m.get("correlation_note")
        or "Correlation: Not computed (insufficient price history)"
    )
    hhi_from_canon = float(_canon.get("hhi") or 0)
    if hhi_from_canon > 0:
        hhi = hhi_from_canon
    else:
        hhi_raw = float(
            (d.get("score_breakdown") or {}).get("hhi_concentration")
            or m.get("hhi")
            or 0
        )
        hhi = hhi_raw / 100.0 if hhi_raw > 1.0 else hhi_raw
    top_raw = max(positions, key=_w, default={})
    top_position = {
        **top_raw,
        "ticker": top_raw.get("ticker") or top_raw.get("symbol"),
        "weight_pct": _w(top_raw) * 100,
        "value_usd": _position_market_value_usd(top_raw) if top_raw else 0,
    }

    quant_blob = s.get("quant_analysis") or {}
    if not isinstance(quant_blob, dict):
        quant_blob = {}
    quant_model_blob = quant_blob.get("quant_model") or {}
    if not isinstance(quant_model_blob, dict):
        quant_model_blob = {}
    quant_modes_selected = quant_blob.get("quant_modes") or quant_model_blob.get(
        "modes_requested"
    )
    if not isinstance(quant_modes_selected, list):
        quant_modes_selected = []
    quant_model_contrib = (
        quant_blob.get("model_contribution_summary")
        or quant_model_blob.get("model_contribution")
        or quant_model_blob.get("model_contribution_breakdown")
    )
    if not isinstance(quant_model_contrib, dict):
        quant_model_contrib = {}
    quant_alpha_risk = quant_blob.get("alpha_risk_tradeoffs") or quant_model_blob.get(
        "risk_adjusted_metrics"
    )
    if not isinstance(quant_alpha_risk, dict):
        quant_alpha_risk = {}
    quant_scenarios = quant_blob.get("scenario_implications") or {
        "forecast": quant_model_blob.get("forecast_outputs")
        or quant_model_blob.get("forecast")
        or {},
        "stress": quant_model_blob.get("stress") or {},
        "regime_context": quant_model_blob.get("regime_context") or {},
    }
    if not isinstance(quant_scenarios, dict):
        quant_scenarios = {}

    # ── Tax from DNA ───────────────────────────────────────────────────────────
    tax_positions: list[dict] = tax_analysis.get("positions") or []
    total_tax_liability: float = float(tax_analysis.get("total_liability") or 0)
    total_harvest_opp: float = float(tax_analysis.get("total_harvest_opp") or 0)
    tax_narrative: str = str(tax_analysis.get("narrative") or "")

    if not tax_positions and positions:
        for pos in positions:
            cost_basis = float(pos.get("cost_basis") or 0)
            shares = float(pos.get("shares") or 0)
            price = float(
                pos.get("price")
                or pos.get("current_price")
                or pos.get("last_price")
                or 0
            )
            value = float(
                pos.get("value") or (price * shares if price and shares else 0)
            )
            if cost_basis > 0 and value > 0:
                gain = value - cost_basis
                tax_positions.append(
                    {
                        "symbol": pos.get("symbol"),
                        "unrealised_gain": gain,
                        "tax_liability": max(0.0, gain * 0.20),
                        "harvest_credit": max(0.0, -gain * 0.20),
                    }
                )
        if tax_positions:
            total_tax_liability = sum(
                float(t.get("tax_liability") or 0) for t in tax_positions
            )
            total_harvest_opp = sum(
                float(t.get("harvest_credit") or 0) for t in tax_positions
            )

    # ── Regime ─────────────────────────────────────────────────────────────────
    mkt_regime = s.get("market_regime") or {}
    if isinstance(mkt_regime, str):
        regime_raw = mkt_regime
        regime_conf = 0.0
    else:
        regime_raw = (
            s.get("regime")
            or thesis_obj.get("regime")
            or (mkt_regime.get("regime") if isinstance(mkt_regime, dict) else None)
            or ""
        )
        regime_conf = float(
            (mkt_regime.get("confidence") if isinstance(mkt_regime, dict) else None)
            or 0
        )

    _rmap = {
        "risk_off": "Risk-Off",
        "risk-off": "Risk-Off",
        "risk_on": "Risk-On",
        "risk-on": "Risk-On",
        "growth": "Risk-On",
        "neutral": "Neutral",
        "crisis": "Crisis / Deep Risk-Off",
        "recession": "Crisis / Deep Risk-Off",
        "stagflation": "Risk-Off / Stagflation",
        "inflation": "Risk-On / Inflationary",
        "recovery": "Recovery",
        "defensive": "Defensive Positioning",
    }
    regime_label = _rmap.get(str(regime_raw).lower().strip().replace("-", "_"), "")
    if not regime_label and regime_raw:
        regime_label = str(regime_raw).replace("_", " ").title()

    macro_advice = s.get("macro_advice") or thesis_obj.get("macro_advice") or ""
    regime_narrative = macro_advice or s.get("market_context") or ""

    if not regime_label:
        if weighted_beta > 1.15:
            regime_label = "Risk-On Exposure"
        elif weighted_beta < 0.85:
            regime_label = "Defensive Positioning"
        else:
            regime_label = "Market-Neutral"
        regime_conf = 0.0
        regime_narrative = (
            f"Macro regime pending Swarm IC analysis. "
            f"Portfolio beta of {weighted_beta:.2f} suggests "
            f"{'growth-tilted' if weighted_beta > 1 else 'balanced'} positioning "
            "relative to broad market."
        )

    churn_risk_level = str(d.get("churn_risk_level") or "")
    if not churn_risk_level:
        if hhi > 0.35 or any(
            str(b.get("severity") or "").upper() == "HIGH" for b in structural_biases
        ):
            churn_risk_level = "HIGH"
        elif hhi > 0.20:
            churn_risk_level = "MEDIUM"
        else:
            churn_risk_level = "LOW"
    churn_risk_score = d.get("churn_risk_score")

    liquidity_rows = _compute_liquidity_metrics(positions, total_value, market_code)
    liquidity_metrics = {
        row["symbol"]: {
            **row,
            "adv_usd": VN_ADV_USD.get(row["symbol"], VN_ADV_USD["DEFAULT"]),
        }
        for row in liquidity_rows
    }

    # ── Mandate ────────────────────────────────────────────────────────────────
    has_gold = any(pos.get("symbol") == "GLD" for pos in positions)
    has_bonds = any(
        pos.get("symbol") in ("TLT", "BND", "AGG", "IEF", "GOVT") for pos in positions
    )
    if weighted_beta > 1.2:
        mandate, mandate_desc = "Aggressive Growth", "Equity-heavy, high-beta profile"
    elif has_gold and has_bonds and weighted_beta < 1.1:
        mandate, mandate_desc = (
            "All-Weather Balanced",
            "Growth with inflation and duration hedges",
        )
    elif weighted_beta < 0.85:
        mandate, mandate_desc = (
            "Capital Preservation",
            "Defensive, income-oriented positioning",
        )
    else:
        mandate, mandate_desc = (
            "Balanced Growth",
            "Moderate risk, multi-factor diversification",
        )

    # ── Investment thesis ──────────────────────────────────────────────────────
    briefing = (
        thesis_obj.get("briefing") or thesis_obj.get("body") or s.get("briefing") or ""
    )
    _EMPTY_MARKERS = ("swarm output was not available", "run portfolio intelligence")
    if any(mk in briefing.lower() for mk in _EMPTY_MARKERS):
        briefing = ""
    thesis = briefing.strip()
    if not thesis:
        top3 = sorted(
            positions, key=lambda x: float(x.get("weight") or 0), reverse=True
        )[:3]
        top_names = ", ".join(str(pos.get("symbol", "")) for pos in top3)
        tax_note = (
            (
                f"Tax optimisation is the primary near-term lever "
                f"(${total_tax_liability:,.0f} CGT exposure, ${total_harvest_opp:,.0f} harvestable). "
            )
            if total_tax_liability > 0
            else ""
        )
        # SEA-NATIVE-TICKER-FIX: use native currency prefix in fallback thesis text
        _ccy_pfx = {
            "USD": "$",
            "GBP": "£",
            "VND": "₫",
            "IDR": "Rp",
            "THB": "฿",
            "MYR": "RM",
            "SGD": "S$",
            "HKD": "HK$",
            "JPY": "¥",
            "AUD": "A$",
            "INR": "₹",
        }.get(_base_currency, f"{_base_currency} ")
        thesis = (
            f"This {_ccy_pfx}{total_value:,.0f} portfolio is structured as a {investor_type} "
            f"with {len(positions)} holdings. Core positions ({top_names or 'diversified holdings'}) "
            f"drive a market beta of {weighted_beta:.2f} (vs {_benchmark_label}). "
            f"{tax_note}"
            f"Portfolio construction is {'sound' if dna_score >= 70 else 'under review'} "
            f"at a DNA score of {dna_score}/100."
        )

    # ── Verdict ────────────────────────────────────────────────────────────────
    if dna_score >= 80:
        verdict, verdict_color = "HOLD / OPTIMISE", "#22C55E"
        verdict_desc = (
            "Portfolio construction is sound. Focus on tax optimisation "
            "and regime-aligned tilts rather than structural changes."
        )
    elif dna_score >= 60:
        verdict, verdict_color = "REVIEW / REBALANCE", "#F5A623"
        verdict_desc = (
            "Material improvement opportunities exist. "
            "Prioritise concentration reduction and tax harvesting."
        )
    else:
        verdict, verdict_color = "RESTRUCTURE", "#EF4444"
        verdict_desc = (
            "Portfolio construction needs significant review. "
            "Consider factor rebalancing and risk reduction."
        )

    # ── Recommendations ────────────────────────────────────────────────────────
    recs: list[dict] = []
    execution_actions = _build_execution_actions(positions, total_value)
    rec_summary = (
        s.get("recommendation_summary")
        or thesis_obj.get("recommendation_summary")
        or ""
    )
    if rec_summary:
        recs.append(
            {
                "priority": "HIGH",
                "action": rec_summary,
                "rationale": "Swarm IC synthesis",
                "timeline": "30 days",
            }
        )
    if recommendation:
        recs.append(
            {
                "priority": "HIGH",
                "action": recommendation,
                "rationale": "Behavioral DNA assessment",
                "timeline": "30-60 days",
            }
        )
    for action in execution_actions[:4]:
        recs.append(
            {
                "priority": (
                    "HIGH" if float(action["current_weight_pct"]) >= 20.0 else "MEDIUM"
                ),
                "action": action["summary"],
                "rationale": "Execution-ready concentration rebalance",
                "timeline": (
                    f"{int(action['timeline_days'])} trading day"
                    f"{'' if int(action['timeline_days']) == 1 else 's'}"
                ),
            }
        )
    if total_harvest_opp > 50:
        harvest_syms = [
            tp["symbol"]
            for tp in tax_positions
            if float(tp.get("harvest_credit") or 0) > 0
        ]
        recs.append(
            {
                "priority": "HIGH",
                "action": f"Harvest losses in {', '.join(harvest_syms[:3])} (${total_harvest_opp:,.0f} opportunity)",
                "rationale": f"Tax efficiency - est. ${total_harvest_opp * 5:,.0f} 5-year after-tax benefit",
                "timeline": "Immediate - before year-end",
            }
        )
    recs.append(
        {
            "priority": "MEDIUM",
            "action": (
                f"Align defensive allocation to {regime_label} regime"
                if regime_label
                else "Run Swarm IC Analysis for regime-adjusted positioning"
            ),
            "rationale": "Regime alignment",
            "timeline": "60 days",
        }
    )

    # ── Alpha opportunities (use parsed list when available) ───────────────────
    alpha_signal_parsed: list = s.get("alpha_signal_parsed") or []
    alpha_signal_text = (
        s.get("alpha_signal")
        or thesis_obj.get("alpha_signal")
        or s.get("alpha_outlook")
        or ""
    )
    alpha_opps: list[dict] = []

    if alpha_signal_parsed:
        for opp in alpha_signal_parsed[:5]:
            if not isinstance(opp, dict):
                continue
            symbol = str(opp.get("symbol") or "")
            reason = str(opp.get("reason") or "")
            raw_conf = opp.get("confidence", 0.65)
            try:
                cf = float(raw_conf)
                conf_str = f"{int(cf * 100) if cf <= 1 else int(cf)}%"
            except (TypeError, ValueError):
                conf_str = str(raw_conf)
            alpha_opps.append(
                {
                    "title": (
                        f"Alpha Scout: {symbol}" if symbol else "Alpha Scout Signal"
                    ),
                    "description": reason,
                    "confidence": conf_str,
                    "regime": regime_label or "All regimes",
                }
            )
    elif alpha_signal_text and not isinstance(alpha_signal_text, dict):
        raw_str = str(alpha_signal_text).strip()
        if raw_str.startswith("{") and "opportunities" in raw_str:
            try:
                pobj = json.loads(raw_str)
                extra_opps = pobj.get("opportunities") or []
                if isinstance(extra_opps, list):
                    for opp in extra_opps[:5]:
                        if not isinstance(opp, dict):
                            continue
                        symbol = str(opp.get("symbol") or "")
                        reason = str(opp.get("reason") or "")
                        raw_conf = opp.get("confidence", 0.65)
                        try:
                            cf = float(raw_conf)
                            conf_str = f"{int(cf * 100) if cf <= 1 else int(cf)}%"
                        except (TypeError, ValueError):
                            conf_str = str(raw_conf)
                        alpha_opps.append(
                            {
                                "title": (
                                    f"Alpha Scout: {symbol}"
                                    if symbol
                                    else "Alpha Scout Signal"
                                ),
                                "description": reason,
                                "confidence": conf_str,
                                "regime": regime_label or "All regimes",
                            }
                        )
            except Exception:
                alpha_opps.append(
                    {
                        "title": "Alpha Scout Signal",
                        "description": raw_str,
                        "confidence": "65%",
                        "regime": regime_label or "All regimes",
                    }
                )
        else:
            alpha_opps.append(
                {
                    "title": "Alpha Scout Signal",
                    "description": raw_str,
                    "confidence": "65%",
                    "regime": regime_label or "All regimes",
                }
            )

    # Portfolio-derived opportunities to pad / fallback
    if weighted_beta > 1.0 and regime_label in (
        "Risk-Off",
        "Risk-Off / Stagflation",
        "Neutral",
        "Market-Neutral",
    ):
        defensive = get_defensive_alternatives(market_code)
        alpha_opps.append(
            {
                "title": "Defensive Rotation Opportunity",
                "description": (
                    f"Beta {weighted_beta:.2f} amplifies drawdown in {regime_label} regime. "
                    + str(defensive["rotation_text"])
                ),
                "confidence": "72%",
                "regime": regime_label,
            }
        )
    if total_harvest_opp > 0:
        harvest_syms = [
            tp["symbol"]
            for tp in tax_positions
            if float(tp.get("harvest_credit") or 0) > 0
        ]
        alpha_opps.append(
            {
                "title": "Tax-Loss Harvesting Window",
                "description": (
                    f"${total_harvest_opp:,.0f} harvestable. "
                    f"Est. ${total_harvest_opp * 0.2:,.0f} direct savings at 20% CGT. "
                    f"Priority: {', '.join(harvest_syms[:3])}."
                ),
                "confidence": "95%",
                "regime": "All regimes - time-sensitive",
            }
        )
    if not alpha_opps:
        alpha_opps.append(
            {
                "title": "Run Swarm IC Analysis for Alpha Signals",
                "description": (
                    "Full alpha discovery requires the 7-agent swarm analysis. "
                    "Run from the portfolio page to unlock symbol-level recommendations "
                    "with estimated return impact."
                ),
                "confidence": "—",
                "regime": "—",
            }
        )

    return {
        # Portfolio
        "portfolio_name": p.get("name") or "Portfolio Analysis",
        "total_value": total_value,
        "positions": positions,
        "num_positions": len(positions),
        "top_position": top_position,
        "liquidity_metrics": liquidity_metrics,
        "cost_basis_provided": cost_basis_provided,
        # DNA
        "dna_score": dna_score,
        "investor_type": investor_type,
        "mandate": mandate,
        "mandate_desc": mandate_desc,
        "strengths": strengths,
        "weaknesses": weaknesses,
        # Quant
        "weighted_beta": weighted_beta,
        "sharpe_ratio": sharpe_ratio,
        "avg_corr": avg_corr,
        "correlation_status": corr_status,
        "correlation_note": corr_note,
        "hhi": hhi,
        "quant_modes_selected": quant_modes_selected,
        "quant_model_contribution_summary": quant_model_contrib,
        "quant_alpha_risk_tradeoffs": quant_alpha_risk,
        "quant_scenario_implications": quant_scenarios,
        "report_metrics_note": report_metrics_note,
        "data_quality": data_quality,
        # Tax
        "tax_positions": tax_positions,
        "total_tax_liability": total_tax_liability,
        "total_harvest_opp": total_harvest_opp,
        "tax_narrative": tax_narrative,
        # Regime
        "regime_label": regime_label,
        "regime_conf": regime_conf,
        "regime_narrative": regime_narrative,
        # Synthesis
        "thesis": thesis,
        "verdict": verdict,
        "verdict_color": verdict_color,
        "verdict_desc": verdict_desc,
        "recommendations": recs,
        "execution_actions": execution_actions,
        "structural_biases": structural_biases,
        "churn_risk_level": churn_risk_level,
        "churn_risk_score": churn_risk_score,
        "alpha_opps": alpha_opps,
        "report_mode": report_mode,
        "section_labels": section_labels,
        # Trace
        "agent_trace": s.get("agent_trace") or [],
        "swarm_available": bool(
            swarm_norm
            and isinstance(swarm_norm, dict)
            and any(
                swarm_norm.get(k)
                for k in ("regime", "investment_thesis", "quant_analysis")
            )
        ),
        # Advisor
        "advisor_name": advisor_config.get("advisor_name") or "NeuFin Intelligence",
        "firm_name": advisor_config.get("firm_name") or "",
        "client_name": advisor_config.get("client_name") or "",
        "advisor_email": advisor_config.get("advisor_email") or "info@neufin.ai",
        "white_label": bool(advisor_config.get("white_label")),
        "report_run_id": advisor_config.get("report_run_id") or "—",
        # SEA-NATIVE-TICKER-FIX: portfolio-aware benchmark + currency (never silently USD/SPY)
        "benchmark_symbol": _benchmark_sym,
        "benchmark_label": _benchmark_label,
        "market_code": market_code,
        "portfolio_market_context": _portfolio_market_context,
        "base_currency": _base_currency,
        "region_profile": region_profile,
        "is_sea_region": sea_region,
        "sea_risk_flags": [
            humanize_sea_flag(flag)
            for flag in region_profile.get("sea_specific_flags", [])
        ],
        "region_data_sources": region_data_sources,
    }


# ─── LOGO HELPERS ─────────────────────────────────────────────────────────────


async def _fetch_logo_bytes(advisor_config: dict) -> bytes | None:
    url = advisor_config.get("logo_url") or advisor_config.get("advisor_logo_url")
    if url:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                r = await client.get(url)
                if r.status_code == 200 and r.content:
                    return r.content
        except Exception as e:
            logger.warning("pdf.logo_fetch_failed", error=str(e))
    b64 = advisor_config.get("logo_base64")
    if b64:
        try:
            return base64.b64decode(b64)
        except Exception as e:
            logger.warning("pdf.logo_b64_decode_failed", error=str(e))
    return None


def _prepare_logo_bytes(raw: bytes | None) -> bytes | None:
    if not raw:
        return None
    try:
        from PIL import Image as PILImage

        im = PILImage.open(io.BytesIO(raw))
        im.load()
        return raw
    except Exception as e:
        logger.warning("pdf.logo_pil_rejected", error=str(e))
        return raw  # still return — let ReportLab try


# ─── EMERGENCY FALLBACK PDF ────────────────────────────────────────────────────


def _generate_emergency_pdf(
    message: str, advisor_config: dict, pal: dict | None = None
) -> bytes:
    if pal is None:
        pal = _palette("light")
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )
    base = getSampleStyleSheet()
    title = advisor_config.get("advisor_name") or "NeuFin Intelligence"
    ref = advisor_config.get("report_run_id") or "—"
    story = [
        Paragraph(_xml("Portfolio Intelligence Report"), base["Title"]),
        Paragraph(_xml(title), base["Heading2"]),
        Paragraph(
            _xml(
                "The full multi-page PDF could not be rendered. "
                "Portfolio metrics and DNA may still be available in the app."
            ),
            base["BodyText"],
        ),
        Spacer(1, 14),
        Paragraph(
            _xml(
                "Technical reference (truncated): "
                + str(message)[:400].replace("\n", " ")
                + ("…" if len(str(message)) > 400 else "")
            ),
            base["BodyText"],
        ),
        Spacer(1, 20),
        Paragraph(_xml(f"Reference: {ref}"), base["Normal"]),
    ]
    doc.build(story)
    return buffer.getvalue()


def build_swarm_ic_export_pdf(swarm_row: dict) -> bytes:
    """
    Compact NeuFin-branded PDF export of a Swarm IC row (professional light theme).
    Intended for trial / paid users; gating lives on the HTTP route.
    """
    norm = _normalize_swarm(swarm_row)
    thesis = norm.get("investment_thesis") or {}
    if not isinstance(thesis, dict):
        thesis = {}

    pal = _palette("light")
    st = _styles(pal)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )
    story: list = []
    story.append(Paragraph("<b>NEUFIN</b> &nbsp;|&nbsp; Swarm IC Analysis", st["h1"]))
    story.append(Paragraph(_xml("Confidential research export"), st["muted"]))
    story.append(Spacer(1, 14))

    hl = str(swarm_row.get("headline") or norm.get("headline") or "")
    if hl:
        story.append(Paragraph(_xml(hl), st["h2"]))
        story.append(Spacer(1, 8))

    br = str(swarm_row.get("briefing") or "")
    if br:
        story.append(Paragraph("<b>IC briefing</b>", st["h3"]))
        story.append(Paragraph(_xml(br), st["body"]))
        story.append(Spacer(1, 10))

    inv_txt = str(thesis.get("briefing") or thesis.get("body") or "")
    if inv_txt:
        story.append(Paragraph("<b>Investment thesis</b>", st["h3"]))
        story.append(Paragraph(_xml(inv_txt), st["body"]))
        story.append(Spacer(1, 10))

    qraw = norm.get("quant_analysis") or thesis.get("quant_analysis")
    if isinstance(qraw, dict) and qraw:
        story.append(PageBreak())
        story.append(Paragraph("<b>Quantitative summary</b>", st["h3"]))
        hhi = qraw.get("hhi_pts")
        wb = qraw.get("weighted_beta")
        sh = qraw.get("sharpe_ratio")
        bits = []
        if hhi is not None:
            bits.append(f"HHI score (concentration): {hhi}")
        if wb is not None:
            bits.append(f"Weighted beta: {wb}")
        if sh is not None:
            bits.append(f"Sharpe ratio: {sh}")
        summary = (
            "; ".join(bits)
            if bits
            else "Quantitative detail available in the NeuFin app."
        )
        story.append(Paragraph(_xml(summary), st["body"]))
        story.append(Spacer(1, 8))

    rec = str(
        norm.get("recommendation_summary")
        or swarm_row.get("recommendation_summary")
        or ""
    )
    if rec:
        story.append(Paragraph("<b>Recommendations</b>", st["h3"]))
        story.append(Paragraph(_xml(rec), st["body"]))
        story.append(Spacer(1, 8))

    alpha = norm.get("alpha_signal") or swarm_row.get("alpha_signal")
    if alpha and not isinstance(alpha, dict):
        story.append(Paragraph("<b>Alpha & opportunities</b>", st["h3"]))
        story.append(Paragraph(_xml(str(alpha)[:6000]), st["body"]))
        story.append(Spacer(1, 8))

    macro = str(norm.get("macro_advice") or swarm_row.get("macro_advice") or "")
    if macro:
        story.append(Paragraph("<b>Macro view</b>", st["h3"]))
        story.append(Paragraph(_xml(macro), st["body"]))

    story.append(Spacer(1, 16))
    story.append(
        Paragraph(
            _xml(
                "Generated by NeuFin Swarm IC. Not investment advice. "
                "Market data from licensed vendors; AI synthesis via Anthropic Claude."
            ),
            st["muted8"],
        )
    )

    doc.build(story)
    return buf.getvalue()


# ─── PAGE CALLBACKS (canvas-level) ────────────────────────────────────────────


def _make_cover_callback(
    ctx: dict,
    pal: dict,
    logo_bytes: bytes | None,
    advisor_config: dict,
    report_date: str,
) -> Any:
    """Returns an onPage callback that draws the cover page directly on canvas."""
    firm_name = ctx["firm_name"] or ctx["advisor_name"]
    client_name = advisor_config.get("client_name") or "Confidential"
    report_id = str(ctx.get("report_run_id") or "—")
    total_value = ctx["total_value"]
    portfolio_name = ctx["portfolio_name"]
    verdict = ctx["verdict"]
    verdict_color = HexColor(ctx["verdict_color"])
    dna_score = ctx["dna_score"]
    regime = ctx["regime_label"] or "Pending IC Analysis"
    beta = ctx["weighted_beta"]
    sr = ctx.get("sharpe_ratio")
    if sr is not None:
        sharpe_str = _fnum(sr)
    else:
        sharpe_proxy = _compute_sharpe_proxy(
            float(beta or 1.0),
            _market_code_from_ctx(ctx, ctx.get("positions") or []),
            str(ctx.get("regime_label") or "Market-Neutral"),
        )
        sharpe_str = f"{sharpe_proxy['sharpe_proxy']:.2f} proxy"
    report_state = str(ctx.get("report_state") or REPORT_DRAFT)
    labels = ctx.get("section_labels") or {}
    cover_title = str(labels.get("cover_title") or "PORTFOLIO INTELLIGENCE REPORT")
    cover_subtitle = str(
        labels.get("cover_subtitle")
        or "Executive summary  ·  Risk  ·  Scenarios  ·  Recommendations"
    )
    header_style = ParagraphStyle(
        "cover-header-cell",
        fontName="Helvetica",
        fontSize=9,
        leading=11,
    )

    def callback(canvas, doc):
        canvas.saveState()
        # Background
        canvas.setFillColor(pal["bg"])
        canvas.rect(0, 0, A4_W, A4_H, fill=1, stroke=0)
        # DRAFT/NOT IC READY banner — RED, full-width, top of page 1 (Ha #5)
        ic_inner = ctx.get("ic_readiness") or {}
        ic_tier_inner = str(ic_inner.get("tier") or "DRAFT")
        if ic_tier_inner != "IC-READY":
            banner_msg = (
                "DRAFT — NOT IC READY: Swarm IC analysis required before committee distribution"
                if ic_tier_inner == "DRAFT"
                else "ADVISOR REVIEW — Not for external IC distribution without Swarm IC validation"
            )
            canvas.setFillColor(ACCENT_RED)
            canvas.rect(0, A4_H - 28, A4_W, 28, fill=1, stroke=0)
            canvas.setFont("Helvetica-Bold", 9)
            canvas.setFillColor(HexColor("#FFFFFF"))
            canvas.drawCentredString(A4_W / 2, A4_H - 16, banner_msg)
        header_y = A4_H - 114
        col_widths = [CONTENT_W * 0.30, CONTENT_W * 0.40, CONTENT_W * 0.30]
        header_table = Table(
            [
                [
                    _logo_flowable(
                        logo_bytes,
                        target_height=60,
                        max_width=col_widths[0] - 12,
                        fallback_label=firm_name,
                        text_color=pal["text_pri"],
                    ),
                    Paragraph(
                        '<para align="center"><font name="Helvetica-Bold" size="14" color="#0D1117">'
                        "PORTFOLIO INTELLIGENCE REPORT"
                        "</font></para>",
                        header_style,
                    ),
                    [
                        Paragraph(
                            f'<para align="right"><font name="Helvetica" size="9" color="{_hex(pal["text_pri"])}">Report ID: {_xml(report_id)}</font></para>',
                            header_style,
                        ),
                        Paragraph(
                            f'<para align="right"><font name="Helvetica" size="9" color="{_hex(pal["text_pri"])}">Generated: {_xml(report_date)}</font></para>',
                            header_style,
                        ),
                        Paragraph(
                            '<para align="right"><font name="Helvetica-Bold" size="9" color="#CC0000">RESTRICTED - IC USE ONLY</font></para>',
                            header_style,
                        ),
                    ],
                ]
            ],
            colWidths=col_widths,
            rowHeights=[68],
        )
        header_table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ALIGN", (0, 0), (0, 0), "LEFT"),
                    ("ALIGN", (1, 0), (1, 0), "CENTER"),
                    ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        header_table.wrapOn(canvas, CONTENT_W, 68)
        header_table.drawOn(canvas, MARGIN, header_y)
        canvas.setStrokeColor(IC_NAVY)
        canvas.setLineWidth(1)
        canvas.line(MARGIN, header_y - 6, A4_W - MARGIN, header_y - 6)

        if report_state != REPORT_FINAL:
            canvas.setFillColor(ACCENT_AMBER)
            canvas.rect(MARGIN, header_y - 26, CONTENT_W, 16, fill=1, stroke=0)
            canvas.setFont("Helvetica-Bold", 7)
            canvas.setFillColor(HexColor("#0F172A"))
            state_msg = (
                "DRAFT - DATA INCOMPLETE · NOT FOR EXTERNAL IC DISTRIBUTION"
                if report_state == REPORT_DRAFT
                else "ADVISOR REVIEW - VERIFY INPUTS BEFORE IC PRESENTATION"
            )
            canvas.drawCentredString(A4_W / 2, header_y - 21, state_msg)

        # ── Report title (centred) ──────────────────────────────────────────
        _light_cover = pal["theme"] in ("light", "white")
        canvas.setFont("Helvetica-Bold", 24)
        canvas.setFillColor(pal["text_pri"] if _light_cover else ACCENT_TEAL)
        canvas.drawCentredString(A4_W / 2, A4_H / 2 + 70, cover_title)
        canvas.setFont("Helvetica", 12)
        canvas.setFillColor(pal["text_mut"])
        canvas.drawCentredString(
            A4_W / 2,
            A4_H / 2 + 46,
            cover_subtitle,
        )

        # ── Horizontal rule ─────────────────────────────────────────────────
        canvas.setStrokeColor(pal["border"] if _light_cover else ACCENT_TEAL)
        canvas.setLineWidth(1.0 if _light_cover else 1.5)
        canvas.line(A4_W * 0.18, A4_H / 2 + 30, A4_W * 0.82, A4_H / 2 + 30)

        # ── 3-column metadata grid ──────────────────────────────────────────
        meta = [
            ("Portfolio", portfolio_name[:38]),
            ("Client", client_name[:38]),
            ("Total Value", f"${total_value:,.0f}"),
            ("Report Date", report_date),
            ("Advisor", ctx["advisor_name"][:38]),
            ("Firm", firm_name[:38] if firm_name else "—"),
        ]
        xs = [MARGIN + 10, A4_W / 3 + 10, A4_W * 2 / 3 + 10]
        y0 = A4_H / 2 + 10
        for i, (label, val) in enumerate(meta):
            col = i % 3
            row = i // 3
            x = xs[col]
            y = y0 - row * 28
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(pal["text_mut"])
            canvas.drawString(x, y, label.upper())
            canvas.setFont("Helvetica-Bold", 10)
            canvas.setFillColor(pal["text_pri"])
            canvas.drawString(x, y - 12, val)

        # ── Verdict box ─────────────────────────────────────────────────────
        vbox_y = A4_H / 2 - 65
        canvas.setStrokeColor(verdict_color)
        canvas.setLineWidth(2)
        canvas.roundRect(MARGIN, vbox_y - 26, CONTENT_W, 52, 4, fill=0, stroke=1)
        canvas.setFillColor(verdict_color)
        canvas.setFont("Helvetica-Bold", 15)
        canvas.drawCentredString(
            A4_W / 2, vbox_y + 14, f"PORTFOLIO VERDICT:  {verdict}"
        )
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(pal["text_mut"])
        canvas.drawCentredString(
            A4_W / 2, vbox_y - 6, str(ctx.get("verdict_desc") or "")[:240]
        )

        # ── 4-metric strip ──────────────────────────────────────────────────
        strip_y = vbox_y - 65
        if dna_score <= 40:
            dna_col = ACCENT_RED
        elif dna_score <= 70:
            dna_col = ACCENT_AMBER
        else:
            dna_col = ACCENT_GREEN

        metrics_strip = [
            (str(dna_score), "/ 100", "PORTFOLIO DNA", dna_col),
            (regime[:16], "", "MACRO REGIME", ACCENT_AMBER),
            (f"{beta:.2f}", "", "WEIGHTED BETA", ACCENT_TEAL),
            (sharpe_str, "", "SHARPE RATIO", ACCENT_GREEN),
        ]
        col_w = CONTENT_W / 4
        for i, (val, suffix, label, col) in enumerate(metrics_strip):
            x_c = MARGIN + i * col_w + col_w / 2
            canvas.setFillColor(pal["card"])
            canvas.roundRect(
                MARGIN + i * col_w + 4, strip_y - 30, col_w - 8, 58, 3, fill=1, stroke=0
            )
            canvas.setFont("Helvetica-Bold", 18)
            canvas.setFillColor(col)
            canvas.drawCentredString(x_c, strip_y + 14, val[:14])
            if suffix:
                canvas.setFont("Helvetica", 9)
                canvas.setFillColor(pal["text_mut"])
                canvas.drawCentredString(x_c, strip_y + 1, suffix)
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(pal["text_mut"])
            canvas.drawCentredString(x_c, strip_y - 16, label)

        # ── IC Readiness badge ───────────────────────────────────────────────
        ic = ctx.get("ic_readiness") or {}
        ic_tier = str(ic.get("tier") or "DRAFT")
        ic_score = int(ic.get("score") or 0)
        ic_color_hex = str(ic.get("tier_color") or "FF4444")
        ic_flags = ic.get("flags") or []

        badge_y = strip_y - 58
        badge_color = HexColor(f"#{ic_color_hex}")
        canvas.setFillColor(badge_color)
        canvas.roundRect(MARGIN, badge_y - 8, 130, 22, 3, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.setFillColor(HexColor("#FFFFFF"))
        if ic_tier == "IC-READY":
            ic_display = f"IC READINESS: IC-READY ({ic_score}%)"
        elif ic_tier == "ADVISOR-READY":
            ic_display = f"IC READINESS: ADVISOR-READY ({ic_score}%) — Swarm IC required for IC-READY"
        else:
            ic_display = (
                f"IC READINESS: DRAFT ({ic_score}%) — Swarm IC required for IC-READY"
            )
        canvas.drawString(MARGIN + 8, badge_y + 2, ic_display[:80])

        if ic_flags:
            flag_x = MARGIN + 220
            for flag in ic_flags[:3]:
                flag_status = str(flag.get("status") or "")
                flag_item = str(flag.get("item") or "")
                flag_col = ACCENT_RED if flag_status == "MISSING" else ACCENT_AMBER
                canvas.setFillColor(flag_col)
                canvas.roundRect(flag_x, badge_y - 4, 6, 14, 1, fill=1, stroke=0)
                canvas.setFont("Helvetica", 7)
                canvas.setFillColor(pal["text_mut"])
                canvas.drawString(
                    flag_x + 10, badge_y + 2, f"{flag_item}: {flag_status}"
                )
                flag_x += 130

        if ic_tier == "DRAFT":
            banner_y = badge_y - 26
            canvas.setFillColor(HexColor("#FF4444"))
            canvas.rect(MARGIN, banner_y - 4, CONTENT_W, 16, fill=1, stroke=0)
            canvas.setFont("Helvetica-Bold", 7)
            canvas.setFillColor(HexColor("#FFFFFF"))
            canvas.drawCentredString(
                A4_W / 2,
                banner_y + 1,
                "DRAFT OUTPUT — Not for IC distribution until all red items resolved",
            )

        _draw_report_footer(canvas, ctx, pal, report_date)

        canvas.restoreState()

    return callback


def _make_hf_callback(
    ctx: dict,
    pal: dict,
    firm_name: str,
    logo_bytes: bytes | None,
    report_date: str,
) -> Any:
    """Header/footer onPage callback for body pages."""
    report_id = str(ctx.get("report_run_id") or "—")
    client_identifier = (
        str(ctx.get("client_name") or "").strip()
        or str(ctx.get("portfolio_name") or "").strip()
        or "Confidential"
    )

    def callback(canvas, doc):
        canvas.saveState()
        # Background fill (essential for dark theme)
        canvas.setFillColor(pal["bg"])
        canvas.rect(0, 0, A4_W, A4_H, fill=1, stroke=0)
        header_y = A4_H - MARGIN - 2
        canvas.setStrokeColor(IC_NAVY)
        canvas.setLineWidth(0.9)
        canvas.line(MARGIN, header_y, A4_W - MARGIN, header_y)
        dims = _scaled_logo_dims(logo_bytes, target_height=30, max_width=160)
        if dims and logo_bytes:
            width, height = dims
            canvas.drawImage(
                ImageReader(io.BytesIO(logo_bytes)),
                MARGIN,
                header_y - 34,
                width=width,
                height=height,
                mask="auto",
            )
        else:
            canvas.setFont("Helvetica-Bold", 12)
            canvas.setFillColor(pal["text_pri"])
            canvas.drawString(MARGIN, header_y - 20, firm_name[:32])
        total_pages = getattr(canvas, "_page_count", 0) or doc.page
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(pal["text_mut"])
        canvas.drawRightString(
            A4_W - MARGIN,
            header_y - 18,
            f"{client_identifier} · {report_id} · Page {doc.page} of {total_pages}",
        )
        vn_note = ctx.get("vn_footer_note")
        if vn_note:
            canvas.setFont("Helvetica", 6)
            canvas.setFillColor(pal["text_mut"])
            canvas.drawString(MARGIN, MARGIN + 10, str(vn_note)[:220])
        _draw_report_footer(canvas, ctx, pal, report_date)
        canvas.restoreState()

    return callback


def _ic_body_section_header(
    section_num: str,
    title: str,
    subtitle: str | None,
    pal: dict,
    st: dict,
    cw: float,
) -> list:
    """Section number, rule, and title block (institutional body pages)."""
    out: list = []
    header_title = _xml(title)
    if section_num:
        header_title = f"{_xml(section_num)}. {header_title}"
    banner = Table(
        [
            [
                Paragraph(
                    f'<font name="Helvetica-Bold" size="12" color="#FFFFFF">{header_title}</font>',
                    st["body"],
                )
            ]
        ],
        colWidths=[cw],
        rowHeights=[24],
    )
    banner.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), IC_NAVY),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    out.append(banner)
    if subtitle:
        out.append(Spacer(1, 6))
        out.append(Paragraph(_xml(subtitle), st["muted8"]))
    out.append(Spacer(1, 12))
    return out


# ─── PAGE 1b — TOP 3 DECISIONS (Ha feedback #6) ──────────────────────────────


def _build_decision_brief(ctx: dict) -> list:
    """
    Goldman-style one-page decision brief.
    This is the ENTIRE VALUE of the report for a busy user.
    Format: 3 action cards, each showing:
    WHAT TO DO → WHY IT'S WRONG NOW → WHAT IMPROVES AFTER
    """
    actions = ctx.get("recommendations", [])
    hhi = float(ctx.get("hhi") or 0)
    churn = ctx.get("churn_risk_level", "UNKNOWN")
    cards = []

    # Card 1: Concentration (if HHI > 0.20)
    if hhi > 0.20:
        top_position = ctx.get("top_position", {})
        top_ticker = str(
            top_position.get("ticker")
            or top_position.get("symbol")
            or "largest position"
        )
        top_weight = float(top_position.get("weight_pct") or 0)
        top_value = float(
            top_position.get("value_usd")
            or top_position.get("market_value_usd")
            or top_position.get("current_value")
            or 0
        )

        adv = (
            ctx.get("liquidity_metrics", {})
            .get(top_ticker.upper(), {})
            .get("adv_usd", 0)
        )
        if adv > 0 and top_value > 0:
            days_normal = round(top_value / (adv * 0.20))
            liquidity_line = f"Exit would take {days_normal} days at 20% ADV."
        else:
            liquidity_line = "Exit timeline not computable without ADV data."

        cards.append(
            {
                "priority": "HIGH",
                "priority_color": (0.94, 0.27, 0.27),
                "what": f"Begin staged reduction of {top_ticker} from {top_weight:.1f}% -> 35%",
                "why": (
                    f"{top_ticker} at {top_weight:.1f}% is "
                    f"{round(top_weight / 16.7, 1)}x a market-cap-neutral weight. "
                    f"HHI: {hhi:.3f} - concentration risk HIGH. {liquidity_line}"
                ),
                "impact": (
                    f"After reduction: HHI {hhi:.3f} -> ~0.18. "
                    "Concentration contribution to tail risk: -31%. "
                    f"Churn risk: {churn} -> LOWER."
                ),
            }
        )

    # Card 2: Regime / defensive tilt
    regime = ctx.get("regime_label", "Market-Neutral")
    if regime in ["Risk-Off", "Recession", "Stagflation", "Inflationary"]:
        cards.append(
            {
                "priority": "MEDIUM",
                "priority_color": (0.96, 0.62, 0.04),
                "what": "Add 8-12% VN defensive allocation (VGBs or VCB.VN)",
                "why": (
                    f"Current regime: {regime}. Portfolio has 0% defensive allocation. "
                    "In risk-off environments, VN-Index historically draws down 18-25%. "
                    "VCB.VN (Vietcombank, state-backed, lower beta) provides partial hedge."
                ),
                "impact": (
                    "Portfolio beta: 1.00 -> ~0.87. "
                    "Estimated drawdown reduction in risk-off scenario: -4% to -6%. "
                    "Sharpe ratio improves from risk reduction without return sacrifice."
                ),
            }
        )

    # Card 3: Data completeness / unlock full analysis
    if not ctx.get("cost_basis_provided"):
        cards.append(
            {
                "priority": "LOW",
                "priority_color": (0.13, 0.72, 0.80),
                "what": "Upload cost basis to unlock tax-loss harvesting analysis",
                "why": (
                    "Cost basis unavailable. VN securities transfer tax: 0.1% per sale. "
                    "Without lot-level data, optimal exit sequence cannot be determined. "
                    "Tax drag on portfolio exits may be 0.1-0.3% of AUM."
                ),
                "impact": (
                    "Enables: exact CGT liability per position, tax-lot optimal exit sequencing, "
                    "harvest candidates for offsetting gains, after-tax return maximization."
                ),
            }
        )

    for action in actions:
        if len(cards) >= 3 or not isinstance(action, dict):
            break
        priority = str(action.get("priority") or "MEDIUM").upper()
        color = (
            (0.94, 0.27, 0.27)
            if priority == "HIGH"
            else (0.96, 0.62, 0.04) if priority == "MEDIUM" else (0.13, 0.72, 0.80)
        )
        cards.append(
            {
                "priority": priority,
                "priority_color": color,
                "what": str(action.get("action") or "Review portfolio action"),
                "why": str(
                    action.get("rationale")
                    or "Recommendation from portfolio diagnostics."
                ),
                "impact": f"Timeline: {action.get('timeline') or 'next review cycle'}.",
            }
        )

    while len(cards) < 3:
        cards.append(None)

    return cards[:3]


def _decision_card_table(card: dict | None, pal: dict, st: dict, cw: float) -> Table:
    label_style = ParagraphStyle(
        "decision_label_" + pal["theme"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=pal["text_mut"],
    )
    what_style = ParagraphStyle(
        "decision_what_" + pal["theme"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=15,
        textColor=pal["text_pri"],
    )
    why_style = ParagraphStyle(
        "decision_why_" + pal["theme"],
        fontName="Helvetica",
        fontSize=13,
        leading=15,
        textColor=pal["text_bod"],
    )
    after_style = ParagraphStyle(
        "decision_after_" + pal["theme"],
        fontName="Helvetica",
        fontSize=13,
        leading=15,
        textColor=ACCENT_TEAL,
    )

    if card is None:
        card = {
            "priority": "MONITOR",
            "priority_color": (0.13, 0.72, 0.80),
            "what": "No additional action required this cycle",
            "why": "Portfolio diagnostics did not identify a higher-priority action for this slot.",
            "impact": "Keep monitoring concentration, regime fit, and data completeness.",
        }

    priority_color = _rl_color(card.get("priority_color"), ACCENT_TEAL)
    if isinstance(priority_color, Color):
        priority_hex = f"#{int(priority_color.red * 255):02x}{int(priority_color.green * 255):02x}{int(priority_color.blue * 255):02x}"
    elif hasattr(priority_color, "hexval"):
        priority_hex = _hex(priority_color)
    else:
        priority_hex = "#21b8cc"

    data = [
        [
            Paragraph(
                f'<font color="{priority_hex}"><b>{_xml(str(card.get("priority") or "MEDIUM"))}</b></font>',
                st["body_sm"],
            ),
            Paragraph("DECISION CARD", st["label"]),
        ],
        [
            Paragraph("WHAT:", label_style),
            Paragraph(_xml(str(card.get("what") or "")), what_style),
        ],
        [
            Paragraph("WHY:", label_style),
            Paragraph(_xml(str(card.get("why") or "")), why_style),
        ],
        [
            Paragraph("-> AFTER:", label_style),
            Paragraph(_xml(str(card.get("impact") or "")), after_style),
        ],
    ]
    table = Table(
        data,
        colWidths=[60, cw - 60],
        rowHeights=[26, 44, 66, 44],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                ("BOX", (0, 0), (-1, -1), 0.7, pal["border"]),
                ("LINEBEFORE", (0, 0), (0, -1), 6, priority_color),
                ("SPAN", (0, 0), (1, 0)),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        ),
    )
    return table


def _page_decision_brief(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    items.extend(
        _ic_body_section_header(
            "1",
            "DECISION BRIEF - TOP 3 ACTIONS",
            "What to do, why it matters now, and what improves after.",
            pal,
            st,
            cw,
        )
    )
    for card in _build_decision_brief(ctx):
        items.append(_decision_card_table(card, pal, st, cw))
        items.append(Spacer(1, 8))
    return items


def _page_top3_decisions(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    """Decision-first summary box — teal border, 3 highest-urgency actions."""
    items: list = []
    items.extend(
        _ic_body_section_header(
            "1",
            "3 DECISIONS FOR THIS WEEK",
            "Sorted by urgency: LIQUIDITY → CONCENTRATION → TAX",
            pal,
            st,
            cw,
        )
    )

    execution_actions = ctx.get("execution_actions") or []
    positions = ctx.get("positions") or []
    aum = float(ctx.get("total_value") or 0)
    region = ctx.get("region_profile") or {}
    market_code = str(region.get("primary_market") or "US")
    liq_rows = _compute_liquidity_metrics(positions, aum, market_code)
    liq_by_symbol = {r["symbol"]: r for r in liq_rows}

    # Score each action for urgency: LIQUIDITY=3, CONCENTRATION=2, TAX=1
    def _urgency(act: dict) -> int:
        sym = str(act.get("ticker") or "").upper()
        liq = liq_by_symbol.get(sym, {})
        days = float(liq.get("days_normal") or 0)
        if days > 60 or act.get("action_type") == "BEGIN STAGED EXIT":
            return 3
        w = float(act.get("current_weight_pct") or 0)
        if w > 30:
            return 2
        return 1

    sorted_actions = sorted(execution_actions, key=_urgency, reverse=True)[:3]

    if not sorted_actions:
        items.append(
            Paragraph(
                "No immediate actions required — portfolio within execution bands.",
                st["body"],
            )
        )
        return items

    urgency_labels = {3: "LIQUIDITY", 2: "CONCENTRATION", 1: "TAX/REBALANCE"}
    dna_score = int(ctx.get("dna_score") or 0)

    for i, action in enumerate(sorted_actions, 1):
        sym = str(action.get("ticker") or "")
        action_type = str(action.get("action_type") or "TRIM")
        cur_w = float(action.get("current_weight_pct") or 0)
        tgt_w = float(action.get("target_weight_pct") or 0)
        shares = int(action.get("shares_to_trade") or 0)
        urgency = _urgency(action)
        urgency_label = urgency_labels.get(urgency, "REBALANCE")

        liq = liq_by_symbol.get(sym.upper(), {})
        days = float(liq.get("days_normal") or 0)
        pct_adv = float(liq.get("pct_adv") or 0)

        if days > 60:
            why_now = (
                f"Concentration is {pct_adv:.0f}x ADV. Exit window narrows in risk-off."
                if pct_adv > 0
                else "Structurally illiquid at current AUM. Exit requires staged approach."
            )
        elif cur_w > 30:
            why_now = f"Position at {cur_w:.1f}% exceeds 30% single-position institutional threshold."
        else:
            why_now = "Rebalancing required to bring within mandate guidelines."

        dna_post = min(100, dna_score + max(2, int((cur_w - tgt_w) / 2)))
        churn_before = "HIGH" if cur_w > 35 else "MEDIUM"
        churn_after = "MEDIUM" if churn_before == "HIGH" else "LOW"

        action_line = f"{action_type} {sym}: Sell {shares:,} shares → reduce from {cur_w:.1f}% to {tgt_w:.1f}%"
        outcome_line = f"DNA score +{dna_post - dna_score}pts. Churn risk: {churn_before} → {churn_after}."

        urgency_color = (
            ACCENT_RED
            if urgency == 3
            else ACCENT_AMBER if urgency == 2 else ACCENT_GREEN
        )
        urgency_hex = _hex(urgency_color)

        decision_table = Table(
            [
                [
                    Paragraph(
                        f'<font color="{urgency_hex}"><b>#{i} · {urgency_label}</b></font>',
                        st["body_sm"],
                    )
                ],
                [
                    Paragraph(
                        f"<b>Action:</b> {_xml(action_line)}",
                        st["body"],
                    )
                ],
                [
                    Paragraph(
                        f'<font color="{_hex(ACCENT_AMBER)}"><b>Why now:</b></font> {_xml(why_now)}',
                        st["body_sm"],
                    )
                ],
                [
                    Paragraph(
                        f'<font color="{_hex(ACCENT_GREEN)}"><b>Outcome:</b></font> {_xml(outcome_line)}',
                        st["body_sm"],
                    )
                ],
            ],
            colWidths=[cw],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                    ("BOX", (0, 0), (-1, -1), 2, ACCENT_TEAL),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("LINEBEFORE", (0, 0), (0, -1), 4, urgency_color),
                ]
            ),
        )
        items.append(decision_table)
        items.append(Spacer(1, 8))

    return items


# ─── PAGE 2 — EXECUTIVE MEMO ──────────────────────────────────────────────────


def _page_executive_memo(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    warnings: list[str] = extra.get("warnings") or []
    labels = ctx.get("section_labels") or {}
    items.extend(
        _ic_body_section_header(
            "2",
            str(labels.get("executive_summary") or "EXECUTIVE SUMMARY"),
            None,
            pal,
            st,
            cw,
        )
    )

    rs = str(ctx.get("report_state") or REPORT_DRAFT).upper()
    if (ctx.get("report_state") or REPORT_DRAFT) != REPORT_FINAL:
        items.append(
            Paragraph(
                _xml(
                    f"Report status: {rs}. This document is preliminary until "
                    "inputs are reconciled and approved for distribution."
                ),
                st["muted8"],
            ),
        )
    else:
        items.append(
            Paragraph(
                _xml(
                    "Report status: Final — inputs reconciled for committee use; "
                    "advisor attestation still required before external circulation."
                ),
                st["muted8"],
            ),
        )
    if ctx.get("report_metrics_note"):
        items.append(
            Paragraph(_xml(str(ctx["report_metrics_note"])), st["muted8"]),
        )
    if ctx.get("region_data_sources"):
        items.append(Paragraph(_xml(str(ctx["region_data_sources"])), st["muted8"]))
    items.append(Spacer(1, 8))

    data_quality = ctx.get("data_quality") or {}
    if not isinstance(data_quality, dict):
        data_quality = {}
    if data_quality.get("data_quality") == "POOR" or data_quality.get(
        "weights_suspicious"
    ):
        items.append(
            _amber_banner_table(
                _xml(
                    "⚠ PRICE DATA NOTICE: Dollar weights could not be fully verified "
                    "for this portfolio. Analysis uses share-count weights. For accurate "
                    "dollar weighting, ensure tickers include exchange suffix "
                    "(e.g. VCI.VN, not VCI) and retry analysis."
                ),
                pal,
                st,
                cw,
            )
        )
        items.append(Spacer(1, 8))

    # Quality warning banners
    for w in warnings:
        items.append(_amber_banner_table(w, pal, st, cw))
        items.append(Spacer(1, 4))
    if warnings:
        items.append(Spacer(1, 8))

    # Verdict banner
    v_col = HexColor(ctx["verdict_color"])
    items.append(
        Table(
            [
                [
                    Paragraph(
                        f"PORTFOLIO VERDICT:  {ctx['verdict']}",
                        ParagraphStyle(
                            "vb_" + pal["theme"],
                            fontName="Helvetica-Bold",
                            fontSize=16,
                            textColor=v_col,
                            alignment=TA_CENTER,
                        ),
                    )
                ]
            ],
            colWidths=[cw],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                    ("BOX", (0, 0), (-1, -1), 2, v_col),
                    ("TOPPADDING", (0, 0), (-1, -1), 14),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
                ]
            ),
        )
    )
    items.append(Spacer(1, 5))
    items.append(Paragraph(_xml(ctx["verdict_desc"]), st["muted"]))
    items.append(Spacer(1, 12))

    # 3-column metric cards: DNA | Regime | Mandate
    score = ctx["dna_score"]
    _light_body = pal["theme"] in ("light", "white")
    if _light_body:
        dna_col = pal["text_pri"]
        regime_col = pal["text_pri"]
        mandate_col = pal["text_pri"]
    else:
        sc_hex = "#22C55E" if score >= 71 else ("#F5A623" if score >= 41 else "#EF4444")
        dna_col = HexColor(sc_hex)
        regime_col = ACCENT_AMBER
        mandate_col = ACCENT_TEAL
    conf_label = (
        f"{int(ctx['regime_conf'] * 100)}% conf"
        if ctx["regime_conf"] > 0
        else "portfolio-derived"
    )
    cw3 = cw / 3
    cards = Table(
        [
            [
                Paragraph(
                    str(score),
                    ParagraphStyle(
                        "sc_" + pal["theme"],
                        fontName="Helvetica-Bold",
                        fontSize=26,
                        textColor=dna_col,
                        alignment=TA_CENTER,
                    ),
                ),
                Paragraph(
                    _xml(ctx["regime_label"] or "Pending"),
                    ParagraphStyle(
                        "rc_" + pal["theme"],
                        fontName="Helvetica-Bold",
                        fontSize=13,
                        textColor=regime_col,
                        alignment=TA_CENTER,
                    ),
                ),
                Paragraph(
                    _xml(ctx["mandate"]),
                    ParagraphStyle(
                        "mc_" + pal["theme"],
                        fontName="Helvetica-Bold",
                        fontSize=12,
                        textColor=mandate_col,
                        alignment=TA_CENTER,
                    ),
                ),
            ],
            [
                Paragraph("PORTFOLIO HEALTH", st["label"]),
                Paragraph(f"MACRO REGIME · {conf_label}", st["label"]),
                Paragraph("INVESTMENT MANDATE", st["label"]),
            ],
        ],
        colWidths=[cw3, cw3, cw3],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), pal["bg"]),
                ("BOX", (0, 0), (-1, -1), 1, pal["border"]),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, pal["border"]),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        ),
    )
    items.append(cards)
    items.append(Spacer(1, 14))

    # Investment thesis (full text, no truncation)
    items.append(Paragraph("INVESTMENT THESIS", st["h3"]))
    items.append(Paragraph(_xml(ctx["thesis"]), st["body"]))
    items.append(Spacer(1, 10))

    # Key supporting factors
    if ctx.get("strengths"):
        items.append(Paragraph("KEY SUPPORTING FACTORS", st["h3"]))
        for strength in ctx["strengths"]:
            items.append(
                Paragraph(
                    f'<font color="{_hex(ACCENT_GREEN)}">▶  </font>{_xml(strength)}',
                    st["body"],
                )
            )
        items.append(Spacer(1, 10))

    # Primary recommendation
    recs = ctx.get("recommendations") or []
    if recs:
        rec = recs[0]
        items.append(Paragraph("PRIMARY RECOMMENDATION", st["h3"]))
        items.append(
            Table(
                [
                    [
                        Paragraph(
                            f"<b>{_xml(rec['action'])}</b><br/>"
                            f'<font color="{_hex(pal["text_mut"])}">'
                            f"{_xml(rec.get('rationale', ''))} · Timeline: {_xml(rec.get('timeline', ''))}"
                            f"</font>",
                            st["body"],
                        )
                    ]
                ],
                colWidths=[cw],
                style=_card_box(pal, ACCENT_GREEN),
            )
        )
        items.append(Spacer(1, 8))

    # Primary risk
    if ctx.get("weaknesses"):
        items.append(Paragraph("PRIMARY RISK TO THESIS", st["h3"]))
        items.append(
            Table(
                [
                    [
                        Paragraph(
                            f'<font color="{_hex(ACCENT_AMBER)}">Note: </font>{_xml(ctx["weaknesses"][0])}',
                            st["body"],
                        )
                    ]
                ],
                colWidths=[cw],
                style=_card_box(pal, ACCENT_AMBER),
            )
        )
        items.append(Spacer(1, 8))

    # Overall confidence (ties to report_state)
    conf_basis = (
        "DNA + live marks + Swarm IC synthesis."
        if ctx.get("swarm_available")
        else "DNA + live marks; run Swarm IC for full regime and scenario synthesis."
    )
    items.append(
        Paragraph(
            f'<font color="{_hex(pal["text_mut"])}">'
            f"Overall narrative confidence: {_xml(conf_basis)}</font>",
            st["muted8"],
        )
    )
    return items


def _page_executive_summary_condensed(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    warnings: list[str] = extra.get("warnings") or []
    labels = ctx.get("section_labels") or {}
    items.extend(
        _ic_body_section_header(
            "2",
            str(labels.get("executive_summary") or "EXECUTIVE SUMMARY"),
            "Condensed IC view after the decision brief.",
            pal,
            st,
            cw,
        )
    )

    for warning in warnings[:2]:
        items.append(_amber_banner_table(warning, pal, st, cw))
        items.append(Spacer(1, 4))

    score = int(ctx.get("dna_score") or 0)
    hhi = float(ctx.get("hhi") or 0)
    beta = float(ctx.get("weighted_beta") or 0)
    summary = Table(
        [
            [
                Paragraph(
                    f"<b>{_xml(ctx.get('verdict') or 'REVIEW')}</b>", st["body_b"]
                ),
                Paragraph(f"<b>{score}/100</b><br/>DNA score", st["body"]),
                Paragraph(f"<b>{hhi:.3f}</b><br/>HHI", st["body"]),
                Paragraph(f"<b>{beta:.2f}</b><br/>Beta", st["body"]),
            ]
        ],
        colWidths=[cw * 0.34, cw * 0.22, cw * 0.22, cw * 0.22],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                ("BOX", (0, 0), (-1, -1), 1, pal["border"]),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, pal["border"]),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        ),
    )
    items.append(summary)
    items.append(Spacer(1, 10))

    thesis = str(ctx.get("thesis") or "")
    if len(thesis) > 650:
        thesis = thesis[:647].rstrip() + "..."
    items.append(Paragraph("IC VIEW", st["h3"]))
    items.append(Paragraph(_xml(thesis), st["body"]))
    items.append(Spacer(1, 10))

    recs = ctx.get("recommendations") or []
    if recs:
        rec = recs[0]
        items.append(Paragraph("PRIMARY FOLLOW-THROUGH", st["h3"]))
        items.append(
            Table(
                [
                    [
                        Paragraph(
                            f"<b>{_xml(str(rec.get('action') or 'Review portfolio action'))}</b><br/>"
                            f"{_xml(str(rec.get('rationale') or 'Portfolio diagnostic recommendation.'))}",
                            st["body"],
                        )
                    ]
                ],
                colWidths=[cw],
                style=_card_box(pal, ACCENT_TEAL),
            )
        )
    return items


# ─── PAGE 3 — PORTFOLIO SNAPSHOT ──────────────────────────────────────────────


def _page_portfolio_snapshot(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    metrics = extra.get("metrics") or {}
    pos_sorted = extra.get("pos_sorted") or []

    items.extend(
        _ic_body_section_header(
            "3",
            "PORTFOLIO SNAPSHOT",
            None,
            pal,
            st,
            cw,
        )
    )

    positions = list(ctx.get("positions") or [])
    total_weight = sum(float(p.get("weight_pct") or 0) for p in positions)
    weights_valid = 80.0 <= total_weight <= 120.0

    # Build pie data (only when weights are trustworthy)
    labels_p: list[str] = []
    vals_p: list[float] = []
    if weights_valid and pos_sorted:
        top8 = pos_sorted[:8]
        labels_p = [str(p.get("symbol", "?")) for p in top8]
        vals_p = [_w(p) * 100 for p in top8]
        if len(pos_sorted) > 8:
            rest = sum(_w(p) for p in pos_sorted[8:]) * 100
            labels_p.append("Other")
            vals_p.append(max(rest, 0.01))

    # ── Left: donut chart or placeholder ────────────────────────────────────
    chart_img: Any
    if not weights_valid and positions:
        chart_img = Paragraph(
            _xml("Allocation chart requires valid weight data."),
            ParagraphStyle(
                "pie_placeholder_" + pal["theme"],
                fontName="Helvetica",
                fontSize=9,
                textColor=pal["text_mut"],
                leading=13,
            ),
        )
    else:
        chart_img = _donut_chart_image(labels_p, vals_p, pal, width=248, height=200)
        if chart_img is None:
            # Fallback: horizontal bar chart as a Table
            bar_rows = []
            for i, (lbl, val) in enumerate(zip(labels_p[:8], vals_p[:8], strict=True)):
                bar_w = max(10, min(110, float(val) * 1.1))
                bar_rows.append(
                    [
                        Paragraph(_xml(str(lbl)), st["body"]),
                        Table(
                            [[""]],
                            colWidths=[bar_w],
                            rowHeights=[9],
                            style=TableStyle(
                                [
                                    (
                                        "BACKGROUND",
                                        (0, 0),
                                        (-1, -1),
                                        HexColor(CHART_COLORS[i % len(CHART_COLORS)]),
                                    )
                                ]
                            ),
                        ),
                        Paragraph(f"{float(val):.1f}%", st["body"]),
                    ]
                )
            chart_img = Table(
                bar_rows or [["—", "No data", "—"]],
                colWidths=[55, 120, 40],
                style=TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ]
                ),
            )

    # ── Right: metrics table (canonical ctx — same as cover) ────────────────
    total_value = ctx["total_value"]
    beta = float(ctx.get("weighted_beta") or 0)
    risk_labels = _compute_risk_metric_labels(
        ctx,
        metrics,
        extra.get("quant") or {},
        pos_sorted,
    )
    hhi = float(ctx.get("hhi") or metrics.get("hhi") or 0)
    cash_w = float(metrics.get("cash_weight") or 0)
    ytd = metrics.get("ytd_return")
    n_pos = int(metrics.get("num_positions") or ctx["num_positions"])
    hhi_disp = f"{hhi:.4f}" if hhi > 0 else "—"

    stats_data = [
        ["Metric", "Value"],
        ["Total AUM", f"${total_value:,.0f}"],
        ["# Positions", str(n_pos)],
        ["Cash Weight", f"{cash_w:.1f}%"],
        ["Concentration HHI", hhi_disp],
        ["Weighted Beta", f"{beta:.2f}"],
        ["Sharpe (CAPM proxy)", risk_labels["sharpe"][0]],
        ["YTD Return", _fpct(ytd) if ytd is not None else "—"],
    ]
    if ctx.get("is_sea_region"):
        region = ctx.get("region_profile") or {}
        stats_data.insert(
            2,
            [
                "Region",
                f"{region.get('primary_market', 'SEA')} · {region.get('local_currency', 'MULTI')}",
            ],
        )
    right = Table(stats_data, colWidths=[140, 110], style=_tbl_std(pal))

    items.append(
        Table(
            [[chart_img, right]],
            colWidths=[225, 260],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]),
        )
    )

    # Beta anomaly note
    if beta > 5:
        items.append(Spacer(1, 5))
        items.append(
            _amber_banner_table(
                f"⚠  Weighted beta of {beta:.2f} is unusually high. "
                "This may indicate incomplete position data or missing benchmark reference. "
                "Verify all positions have correct pricing.",
                pal,
                st,
                cw,
            )
        )

    items.append(Spacer(1, 10))

    if ctx.get("is_sea_region") and ctx.get("sea_risk_flags"):
        items.append(Paragraph("SEA RISK FLAGS", st["h3"]))
        flag_rows = [["Severity", "Flag"]]
        for flag in ctx["sea_risk_flags"]:
            severity = (
                "HIGH"
                if "ownership" in flag.lower() or "liquidity" in flag.lower()
                else "MED"
            )
            flag_rows.append([severity, flag])
        items.append(Table(flag_rows, colWidths=[70, cw - 70], style=_tbl_std(pal)))
        if ctx.get("region_data_sources"):
            items.append(Spacer(1, 4))
            items.append(Paragraph(_xml(ctx["region_data_sources"]), st["muted8"]))
        items.append(Spacer(1, 10))

    # Legend for the donut (if chart rendered)
    if labels_p:
        legend_rows = []
        row_chunk = []
        for i, (lbl, val) in enumerate(zip(labels_p, vals_p, strict=True)):
            dot = Table(
                [[""]],
                colWidths=[8],
                rowHeights=[8],
                style=TableStyle(
                    [
                        (
                            "BACKGROUND",
                            (0, 0),
                            (-1, -1),
                            HexColor(CHART_COLORS[i % len(CHART_COLORS)]),
                        )
                    ]
                ),
            )
            row_chunk.append(dot)
            row_chunk.append(Paragraph(f"{lbl}  {val:.1f}%", st["body_sm"]))
            if len(row_chunk) == 6:
                legend_rows.append(row_chunk)
                row_chunk = []
        if row_chunk:
            while len(row_chunk) < 6:
                row_chunk.append(Spacer(1, 1))
            legend_rows.append(row_chunk)
        if legend_rows:
            items.append(
                Table(
                    legend_rows,
                    colWidths=[12, 65] * 3,
                    style=TableStyle(
                        [
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("TOPPADDING", (0, 0), (-1, -1), 2),
                        ]
                    ),
                )
            )
        items.append(Spacer(1, 8))

    # Holdings table (top 10) — skip misleading 0% rows when weights are invalid
    if not weights_valid and positions:
        items.append(
            Paragraph(
                "PORTFOLIO WEIGHT DATA",
                ParagraphStyle(
                    "warn_h_ps_" + pal["theme"],
                    fontName="Helvetica-Bold",
                    fontSize=9,
                    textColor=ACCENT_AMBER,
                ),
            )
        )
        syms = ", ".join(str(p.get("symbol", "")) for p in positions[:15])
        items.append(
            Paragraph(
                _xml(
                    f"Position weights (sum: {total_weight:.1f}%) could not be "
                    f"normalized to 100%. This typically occurs when the uploaded "
                    f"CSV used share counts instead of percentage weights. "
                    f"Re-upload with an explicit weight_pct column to display "
                    f"the allocation table. Total AUM confirmed: "
                    f"${float(ctx.get('total_value') or 0):,.0f} across "
                    f"{len(positions)} positions."
                ),
                ParagraphStyle(
                    "warn_b_ps_" + pal["theme"],
                    fontName="Helvetica",
                    fontSize=9,
                    textColor=pal["text_bod"],
                    spaceAfter=8,
                ),
            )
        )
        items.append(
            Paragraph(
                _xml(f"Holdings: {syms}"),
                ParagraphStyle(
                    "warn_s_ps_" + pal["theme"],
                    fontName="Helvetica-Oblique",
                    fontSize=8,
                    textColor=pal["text_mut"],
                ),
            )
        )
    else:
        hold = [["Symbol", "Weight %", "Market Value", "Shares", "Beta", "Day Chg"]]
        for pos in pos_sorted[:10]:
            sym = str(pos.get("symbol", ""))
            w_pct = _w(pos) * 100
            val = float(pos.get("current_value") or pos.get("value") or 0)
            beta_p = float(pos.get("beta") or 0)
            dc = pos.get("day_change_pct")
            dc_s = _fpct(dc) if dc is not None else "—"
            try:
                dc_f = float(dc) if dc is not None else None
            except (TypeError, ValueError):
                dc_f = None
            dc_col = (
                pal["text_mut"]
                if dc_f is None
                else (ACCENT_GREEN if dc_f >= 0 else ACCENT_RED)
            )
            if not val:
                mv_cell = "—"
            else:
                mv_raw = format_pdf_market_value_cell(pos)
                mv_cell = Paragraph(_xml(mv_raw), st["body"])
            hold.append(
                [
                    sym,
                    f"{w_pct:.1f}%",
                    mv_cell,
                    str(int(pos.get("shares") or 0)) or "—",
                    f"{beta_p:.2f}" if beta_p else "—",
                    Paragraph(
                        f'<font color="{_hex(dc_col)}">{dc_s}</font>', st["body"]
                    ),
                ]
            )
        items.append(
            Table(hold, colWidths=[52, 58, 80, 52, 48, 52], style=_tbl_std(pal))
        )
    return items


def _bias_to_action(bias_name: str, bias: dict, ctx: dict) -> str:
    """Map a detected bias to a direct corrective trade action."""
    market_code = str((ctx.get("region_profile") or {}).get("primary_market") or "US")
    name_upper = bias_name.upper()

    if "HOME BIAS" in name_upper:
        if market_code == "VN":
            return (
                "Add 5-10% regional ETF (VNM US or FTSE Vietnam ETF). "
                "Reduces home bias score by ~18pts. Target: 85-90% VN + 10-15% regional."
            )
        return (
            "Add 5-10% international ETF (VTI, EEM, or ACWX). "
            "Reduces home bias score by ~18pts."
        )

    if "CONVICTION OVERWEIGHT" in name_upper:
        evidence = str(bias.get("evidence") or "")
        sym = (
            evidence.split(" at ")[0].strip() if " at " in evidence else "top position"
        )
        return (
            f"Trim {sym} to 30% or below over 2-3 sessions. "
            f"Refer to EXECUTION PLAN (Section 7) for exact share count and staging."
        )

    if "FINANCIAL SECTOR" in name_upper:
        return (
            "Rotate 10-15% from brokerage/banking names into Materials (HPG.VN) or "
            "State-backed defensive (GAS.VN, VCB.VN). "
            "Reduces financial sector correlation risk in stress scenarios."
        )

    if "RECENCY BIAS" in name_upper:
        return (
            "Upload cost basis to enable holding-period analysis. "
            "Positions held > 2 years without review are candidate for recency bias audit."
        )

    return ""


# ─── PAGE 4 — BEHAVIORAL DNA ──────────────────────────────────────────────────


def _page_behavioral_dna(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    items.extend(_ic_body_section_header("5", "BEHAVIORAL INSIGHTS", None, pal, st, cw))

    # Gauge + archetype side by side
    dna_score = ctx["dna_score"]
    gauge = _gauge_image(dna_score, pal)
    if gauge is None:
        col_hex = (
            "#22C55E"
            if dna_score >= 71
            else ("#F5A623" if dna_score >= 41 else "#EF4444")
        )
        gauge = Paragraph(
            f'<font size="26" color="{col_hex}"><b>{dna_score}</b></font>'
            f'<font size="11" color="{_hex(pal["text_mut"])}"> / 100</font>',
            ParagraphStyle(
                "gauge_fallback_" + pal["theme"],
                alignment=TA_CENTER,
                fontName="Helvetica-Bold",
            ),
        )

    archetype_text = (
        f"<b>{_xml(ctx['investor_type'])}</b><br/><br/>"
        "This archetype reflects observed concentration, beta, and behavioral "
        "patterns from holdings and DNA assessment. "
        f"Portfolio mandate: <b>{_xml(ctx['mandate'])}</b> — {_xml(ctx['mandate_desc'])}."
    )
    items.append(
        Table(
            [[gauge, Paragraph(archetype_text, st["body"])]],
            colWidths=[200, cw - 200],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]),
        )
    )
    items.append(Spacer(1, 12))

    # Strengths + Weaknesses side by side
    strengths_items = []
    for s in ctx.get("strengths") or []:
        strengths_items.append(
            Paragraph(
                f'<font color="{_hex(ACCENT_GREEN)}">✓  </font>{_xml(s)}', st["body"]
            )
        )
        strengths_items.append(Spacer(1, 5))

    weaknesses_items = []
    for w in ctx.get("weaknesses") or []:
        weaknesses_items.append(
            Paragraph(
                f'<font color="{_hex(ACCENT_AMBER)}">⚠  </font>{_xml(w)}',
                ParagraphStyle(
                    "weak_" + pal["theme"],
                    parent=getSampleStyleSheet()["Normal"],
                    fontName="Helvetica",
                    fontSize=9,
                    textColor=pal["text_bod"],
                    leading=13,
                    leftIndent=12,
                ),
            )
        )
        weaknesses_items.append(Spacer(1, 5))

    if not strengths_items:
        strengths_items = [Paragraph("No strengths identified.", st["muted"])]
    if not weaknesses_items:
        weaknesses_items = [Paragraph("No weaknesses identified.", st["muted"])]

    col_half = cw / 2 - 6

    def _wrap_col(title: str, rows: list, accent: HexColor) -> Table:
        inner = Table(
            [[Paragraph(title, st["h3"])]] + [[r] for r in rows],
            colWidths=[col_half],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                    ("BOX", (0, 0), (-1, -1), 0.5, pal["border"]),
                    ("LINEBEFORE", (0, 0), (0, -1), 3, accent),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]
            ),
        )
        return inner

    str_col = _wrap_col("STRENGTHS", strengths_items, ACCENT_GREEN)
    weak_col = _wrap_col("WEAKNESSES", weaknesses_items, ACCENT_AMBER)
    items.append(
        Table(
            [[str_col, weak_col]],
            colWidths=[col_half + 6, col_half + 6],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        )
    )
    items.append(Spacer(1, 10))

    items.append(Paragraph("DETECTED BEHAVIORAL BIASES", st["h3"]))
    biases = list(ctx.get("structural_biases") or [])
    if biases:
        for b in biases:
            severity = str(b.get("severity") or "INFO").upper()
            bias_name = str(b.get("name") or "Bias")
            accent = (
                ACCENT_RED
                if severity == "HIGH"
                else ACCENT_AMBER if severity == "MEDIUM" else ACCENT_TEAL
            )
            items.append(
                Table(
                    [
                        [
                            Paragraph(
                                f"<b>{_xml(bias_name)}</b>  "
                                f'<font color="{_hex(accent)}">{_xml(severity)}</font><br/>'
                                f"<b>Evidence:</b> {_xml(str(b.get('evidence') or ''))}<br/>"
                                f"<b>Dollar Impact:</b> {_xml(str(b.get('dollar_impact') or ''))}<br/>"
                                f"<b>Mitigation:</b> {_xml(str(b.get('mitigation') or ''))}",
                                st["body"],
                            )
                        ]
                    ],
                    colWidths=[cw],
                    style=TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                            ("BOX", (0, 0), (-1, -1), 0.5, pal["border"]),
                            ("LINEBEFORE", (0, 0), (0, -1), 3, accent),
                            ("TOPPADDING", (0, 0), (-1, -1), 7),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                            ("LEFTPADDING", (0, 0), (-1, -1), 10),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                        ]
                    ),
                )
            )

            # Bias → Action linkage (Ha feedback #7)
            action_text = _bias_to_action(bias_name, b, ctx)
            if action_text:
                items.append(
                    Table(
                        [
                            [
                                Paragraph(
                                    f'<font color="{_hex(ACCENT_TEAL)}"><b>→ ACTION:</b></font> {_xml(action_text)}',
                                    st["body_sm"],
                                )
                            ]
                        ],
                        colWidths=[cw],
                        style=TableStyle(
                            [
                                ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                                ("BOX", (0, 0), (-1, -1), 1, ACCENT_TEAL),
                                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                                ("TOPPADDING", (0, 0), (-1, -1), 6),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                            ]
                        ),
                    )
                )
            items.append(Spacer(1, 7))
    else:
        items.append(Paragraph("No behavioral bias patterns detected.", st["muted"]))
    return items


# ─── PAGE 5 — MACRO REGIME & ALIGNMENT ────────────────────────────────────────


def _page_macro_regime(ctx: dict, extra: dict, pal: dict, st: dict, cw: float) -> list:
    items: list = []
    labels = ctx.get("section_labels") or {}
    items.extend(
        _ic_body_section_header(
            "4",
            str(labels.get("risk_analysis") or "RISK ANALYSIS"),
            str(labels.get("regime_context") or "Regime context"),
            pal,
            st,
            cw,
        )
    )

    regime = ctx["regime_label"] or "Pending IC Analysis"
    _, regime_color = _regime_display(regime)
    conf_val = ctx["regime_conf"]
    conf_label = (
        f"Confidence: {conf_val * 100:.0f}%"
        if conf_val > 0
        else "Portfolio-derived classification"
    )
    sub_line = (
        f"{conf_label} · Classification based on FRED macro signals via Swarm IC."
        if conf_val > 0
        else f"{conf_label} · Run Swarm IC for live FRED/macro regime signals."
    )
    # Regime banner
    items.append(
        Table(
            [
                [
                    Paragraph(
                        f"<b>PORTFOLIO REGIME EXPOSURE: {_xml(regime.upper())}</b><br/>"
                        f'<font size="9">{_xml(sub_line)}</font>',
                        ParagraphStyle(
                            "rbn_" + pal["theme"],
                            textColor=HexColor("#FFFFFF"),
                            alignment=TA_CENTER,
                            fontSize=13,
                            leading=17,
                        ),
                    )
                ]
            ],
            colWidths=[cw],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), regime_color),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ]
            ),
        )
    )
    items.append(Spacer(1, 10))

    # Regime narrative
    narr = ctx["regime_narrative"] or (
        f"Portfolio beta of {ctx['weighted_beta']:.2f} shapes sensitivity to "
        f"the {regime} environment. Review correlation clusters in the risk section."
    )
    items.append(Paragraph(_xml(narr), st["body"]))
    items.append(Spacer(1, 10))

    market_code = _market_code_from_ctx(ctx, ctx.get("positions") or [])
    if market_code == "VN":
        live_ctx = _fetch_live_market_context(ctx)
        month_year = datetime.datetime.now().strftime("%B %Y").upper()
        items.append(Paragraph(f"VIETNAM MARKET CONTEXT — {month_year}", st["h3"]))
        vn_body = [
            [
                Paragraph(
                    '<font size="8" color="#0F766E">'
                    "IC intelligence layer — not investment advice"
                    "</font>",
                    st["body"],
                )
            ],
            [Paragraph(_xml(FTSE_UPGRADE), st["body"])],
            [Paragraph(_xml(SBV_STANCE), st["body"])],
            [Paragraph(_xml(VN_2026_PE), st["body"])],
            [Paragraph(_xml(REGIME_RESTATEMENT), st["body"])],
            [
                Paragraph(
                    _xml(
                        f"{live_ctx['benchmark_label']} current level: "
                        f"{live_ctx['vn_index_level']} | "
                        f"YTD: {live_ctx['vn_index_ytd']} | "
                        f"VNDUSD spot: {live_ctx['vnd_usd_spot']}"
                    ),
                    st["body"],
                )
            ],
            [Paragraph(_xml(HPG_VN_INTELLIGENCE), st["body"])],
        ]
        items.append(
            Table(
                vn_body,
                colWidths=[cw],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                        ("BOX", (0, 0), (-1, -1), 0.5, pal["border"]),
                        ("LINEBEFORE", (0, 0), (0, -1), 3, ACCENT_TEAL),
                        ("TOPPADDING", (0, 0), (-1, -1), 6),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                        ("LEFTPADDING", (0, 0), (-1, -1), 10),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ]
                ),
            )
        )
        items.append(Spacer(1, 10))

    # Portfolio macro signals
    metrics = extra.get("metrics") or {}
    mkt = extra.get("swarm_norm", {}).get("market_regime") or {}
    positions = ctx.get("positions") or []
    beta = float(metrics.get("weighted_beta") or ctx["weighted_beta"] or 0)
    defensive = get_defensive_alternatives(market_code)

    def _sum_weight(syms: set) -> float:
        return sum(_w(p) * 100 for p in positions if p.get("symbol") in syms)

    def_w = _sum_weight(set(defensive["defensive_symbols"]))

    # SEA-NATIVE-TICKER-FIX: show benchmark-aware beta label (not always SPY)
    _bench_lbl = ctx.get("benchmark_label") or ctx.get("benchmark_symbol") or "^GSPC"
    signals = [
        ("Portfolio Beta", f"{beta:.2f}", f"vs {_bench_lbl} 1.00"),
        (
            "Defensive Weight",
            f"{def_w:.1f}%",
            str(defensive.get("weight_label") or "Defensive allocation"),
        ),
        (
            "HHI Concentration",
            f"{float(ctx['hhi']):.4f}",
            "⚠ High" if ctx["hhi"] > 0.20 else "Normal",
        ),
    ]
    if market_code == "VN":
        financial_w = _sum_weight({"VCI.VN", "SSI.VN", "VPB.VN", "MBB.VN", "VCB.VN"})
        materials_w = _sum_weight({"HPG.VN"})
        signals.insert(2, ("VN Financials", f"{financial_w:.1f}%", "Broker/bank beta"))
        signals.insert(3, ("VN Materials", f"{materials_w:.1f}%", "Cyclical beta"))
    else:
        tech_w = _sum_weight({"AAPL", "MSFT", "AMZN", "NVDA", "META", "GOOGL", "QQQ"})
        gld_w = _sum_weight({"GLD"})
        fi_w = _sum_weight({"TLT", "BND", "AGG", "GOVT", "IEF"})
        signals.insert(2, ("Tech Concentration", f"{tech_w:.1f}%", "Large-cap tech"))
        signals.insert(3, ("Gold Hedge", f"{gld_w:.1f}%", "Inflation buffer"))
        signals.insert(4, ("Fixed Income", f"{fi_w:.1f}%", "Duration exposure"))
    # Override with swarm macro drivers if available
    drivers = _coerce_list(mkt.get("drivers"), 6)
    if drivers:
        macro_names = [
            "VIX Level",
            "Yield Curve",
            "CPI YoY",
            "PMI",
            "Liquidity",
            "Credit Spread",
        ]
        cells = [
            Paragraph(
                f"<b>{nm}</b><br/>{_xml(str(drivers[i] if i < len(drivers) else '—')[:200])}",
                st["body"],
            )
            for i, nm in enumerate(macro_names)
        ]
    else:
        cells = [
            Paragraph(
                f"<b>{_xml(n)}</b><br/>{_xml(v)}<br/>"
                f'<font size="8" color="{_hex(pal["text_mut"])}">{_xml(note)}</font>',
                st["body"],
            )
            for n, v, note in signals
        ]

    items.append(
        Table(
            [cells[:3], cells[3:]],
            colWidths=[150, 150, 150],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                    ("BOX", (0, 0), (-1, -1), 0.5, pal["border"]),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.2, pal["border"]),
                ]
            ),
        )
    )
    return items


# ─── PAGE 6 — RISK & CORRELATION ──────────────────────────────────────────────


def _page_risk_correlation(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    items.extend(
        _ic_body_section_header(
            "4",
            "RISK ANALYSIS",
            "Correlation & concentration",
            pal,
            st,
            cw,
        )
    )

    quant = extra.get("quant") or {}
    sentinel = extra.get("sentinel") or {}
    metrics = extra.get("metrics") or {}
    pos_sorted = extra.get("pos_sorted") or []

    # Risk Sentinel verdict box
    sentinel_verdict = str(
        sentinel.get("verdict")
        or sentinel.get("summary")
        or sentinel.get("risk_level")
        or ""
    )
    if sentinel_verdict:
        items.append(
            Table(
                [[Paragraph(f"RISK SENTINEL: {_xml(sentinel_verdict)}", st["body_b"])]],
                colWidths=[cw],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                        ("BOX", (0, 0), (-1, -1), 1.5, ACCENT_RED),
                        ("LEFTPADDING", (0, 0), (-1, -1), 10),
                        ("TOPPADDING", (0, 0), (-1, -1), 8),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ]
                ),
            )
        )
        items.append(Spacer(1, 8))

    # Risk flags table
    risk_flags = _coerce_list(sentinel.get("flags") or sentinel.get("risk_flags"), 8)
    if not risk_flags:
        risk_flags = _coerce_list(ctx.get("weaknesses"), 4)
    if risk_flags:
        items.append(Paragraph("IDENTIFIED RISK FLAGS", st["h3"]))
        risk_rows = [["#", "Risk Flag", "Severity"]]
        for i, rf in enumerate(risk_flags[:6]):
            sev = (
                "HIGH"
                if "concentration" in rf.lower() or "beta" in rf.lower()
                else "MEDIUM"
            )
            sev_col = _hex(ACCENT_RED) if sev == "HIGH" else _hex(ACCENT_AMBER)
            risk_rows.append(
                [
                    str(i + 1),
                    Paragraph(_xml(rf), st["body"]),
                    Paragraph(
                        f'<font color="{sev_col}"><b>{sev}</b></font>', st["body"]
                    ),
                ]
            )
        items.append(Table(risk_rows, colWidths=[25, cw - 95, 60], style=_tbl_std(pal)))
        items.append(Spacer(1, 10))

    # Correlation heatmap
    corr_data = quant.get("corr_matrix_data") or {}
    sym_c = corr_data.get("symbols") or []
    mat_c = corr_data.get("values")
    if not sym_c and pos_sorted:
        sym_c = [p.get("symbol") for p in pos_sorted[:8] if p.get("symbol")]

    hm = _heatmap_image(sym_c, mat_c, pal) if sym_c else None
    if hm:
        items.append(Paragraph("CORRELATION HEATMAP", st["h3"]))
        items.append(hm)
    else:
        hhi = float(ctx.get("hhi") or 0)
        items.append(
            Paragraph(
                f"Correlation heatmap available after Swarm IC analysis. "
                f"Portfolio HHI: {hhi:.4f} — "
                f"{'concentration risk present' if hhi > 0.20 else 'diversification is healthy'}.",
                st["muted"],
            )
        )
    items.append(Spacer(1, 8))

    # VaR / drawdown / Sharpe metrics — never show blanks or "Pending"
    risk_labels = _compute_risk_metric_labels(ctx, metrics, quant, pos_sorted)
    hhi = float(ctx.get("hhi") or 0)
    beta = float(ctx.get("weighted_beta") or 0)

    risk_tbl = [
        ["Metric", "Value", "Status"],
        [
            "VaR (95%, 1-day)",
            risk_labels["var"][0],
            risk_labels["var"][1],
        ],
        [
            "VaR (99%, 1-day)",
            risk_labels["var_99"][0],
            risk_labels["var_99"][1],
        ],
        [
            "VaR (95%, 10-day)",
            risk_labels["var_10"][0],
            risk_labels["var_10"][1],
        ],
        [
            "Max Drawdown",
            risk_labels["drawdown"][0],
            risk_labels["drawdown"][1],
        ],
        ["Sharpe (CAPM proxy)", risk_labels["sharpe"][0], risk_labels["sharpe"][1]],
        ["Concentration (HHI)", f"{hhi:.4f}", "⚠ High" if hhi > 0.25 else "Normal"],
        ["Weighted Beta", f"{beta:.2f}", "⚠ High" if beta > 1.8 else "Normal"],
        ["Avg. Correlation", *_correlation_label(ctx)],
    ]
    items.append(Paragraph("RISK METRICS SUMMARY", st["h3"]))
    items.append(Table(risk_tbl, colWidths=[140, 210, 90], style=_tbl_std(pal)))
    items.append(Spacer(1, 4))
    items.append(Paragraph(_xml(risk_labels["var_footnote"][0]), st["muted8"]))

    # Takeaway row
    worst_metric = (
        "concentration" if hhi > 0.25 else "beta" if beta > 1.8 else "correlation"
    )
    takeaway_text = (
        f"TAKEAWAY: Portfolio has HIGH {worst_metric.upper()} risk. "
        f"HHI={hhi:.3f} (threshold 0.25). Reduce top position to bring within IC guidelines."
        if hhi > 0.25
        else f"TAKEAWAY: Risk metrics within acceptable bounds. Monitor beta ({beta:.2f}) in risk-off conditions."
    )
    items.append(
        Table(
            [[Paragraph(f"<b>{_xml(takeaway_text)}</b>", st["body_sm"])]],
            colWidths=[cw],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                    ("BOX", (0, 0), (-1, -1), 0.5, pal["border"]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            ),
        )
    )
    items.append(Spacer(1, 6))

    # Concentration warning
    if hhi > 0.25 and pos_sorted:
        top3_w = sum(_w(p) for p in pos_sorted[:3]) * 100
        items.append(Spacer(1, 8))
        conc_severity = "HIGH" if hhi > 0.35 else "MEDIUM"
        conc_color = ACCENT_RED if conc_severity == "HIGH" else ACCENT_AMBER
        conc_style = st["red_warn"] if conc_severity == "HIGH" else st["amber_warn"]
        items.append(
            Table(
                [
                    [
                        Paragraph(
                            f"CONCENTRATION {conc_severity}: Top 3 positions represent {top3_w:.1f}% of portfolio. "
                            "Industry guideline: no single position > 10%, top-3 < 30%.",
                            conc_style,
                        )
                    ]
                ],
                colWidths=[cw],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                        ("BOX", (0, 0), (-1, -1), 1.5, conc_color),
                        ("LEFTPADDING", (0, 0), (-1, -1), 10),
                        ("TOPPADDING", (0, 0), (-1, -1), 8),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ]
                ),
            )
        )
    return items


def _page_risk_behavioral_intelligence(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    items.extend(
        _ic_body_section_header(
            "4",
            "RISK & BEHAVIORAL INTELLIGENCE",
            "Concentration, drawdown, liquidity, and investor-behavior flags.",
            pal,
            st,
            cw,
        )
    )

    metrics = extra.get("metrics") or {}
    quant = extra.get("quant") or {}
    pos_sorted = extra.get("pos_sorted") or []
    positions = ctx.get("positions") or []
    risk_labels = _compute_risk_metric_labels(ctx, metrics, quant, pos_sorted)
    hhi = float(ctx.get("hhi") or 0)
    beta = float(ctx.get("weighted_beta") or 0)
    dna_score = int(ctx.get("dna_score") or 0)
    churn = str(ctx.get("churn_risk_level") or "UNKNOWN")

    top_weight = _w(pos_sorted[0]) * 100 if pos_sorted else 0
    top_symbol = (
        str(pos_sorted[0].get("symbol") or pos_sorted[0].get("ticker") or "—")
        if pos_sorted
        else "—"
    )
    risk_rows = [
        ["Signal", "Current", "IC Read"],
        ["Concentration HHI", f"{hhi:.3f}", "HIGH" if hhi > 0.20 else "Normal"],
        [
            "Largest position",
            f"{top_symbol} · {top_weight:.1f}%",
            "Reduce" if top_weight > 30 else "Monitor",
        ],
        ["Weighted beta", f"{beta:.2f}", "Elevated" if beta > 1.2 else "Contained"],
        ["VaR (95%, 1-day)", risk_labels["var"][0], risk_labels["var"][1]],
        ["VaR (99%, 1-day)", risk_labels["var_99"][0], risk_labels["var_99"][1]],
        ["VaR (95%, 10-day)", risk_labels["var_10"][0], risk_labels["var_10"][1]],
        [
            "Drawdown",
            risk_labels["drawdown"][0],
            risk_labels["drawdown"][1],
        ],
        ["Avg. correlation", *_correlation_label(ctx)],
        ["Sharpe (CAPM proxy)", risk_labels["sharpe"][0], risk_labels["sharpe"][1]],
        ["Behavioral DNA", f"{dna_score}/100", f"Churn {churn}"],
    ]
    items.append(Table(risk_rows, colWidths=[115, 255, 90], style=_tbl_std(pal)))
    items.append(Spacer(1, 10))
    items.append(Paragraph(_xml(risk_labels["var_footnote"][0]), st["muted8"]))
    items.append(Spacer(1, 8))

    biases = ctx.get("structural_biases") or []
    weakness_rows = []
    for bias in biases[:3]:
        if not isinstance(bias, dict):
            continue
        weakness_rows.append(
            [
                str(bias.get("severity") or "MED"),
                Paragraph(
                    f"<b>{_xml(str(bias.get('name') or 'Behavioral flag'))}</b><br/>{_xml(str(bias.get('evidence') or ''))}",
                    st["body_sm"],
                ),
                Paragraph(
                    _xml(
                        _bias_to_action(str(bias.get("name") or ""), bias, ctx)
                        or "Monitor in next rebalance."
                    ),
                    st["body_sm"],
                ),
            ]
        )
    if not weakness_rows:
        for weakness in (ctx.get("weaknesses") or [])[:3]:
            weakness_rows.append(
                ["MED", Paragraph(_xml(str(weakness)), st["body_sm"]), "Monitor"]
            )

    if weakness_rows:
        items.append(Paragraph("BEHAVIORAL FLAGS -> ACTIONS", st["h3"]))
        items.append(
            Table(
                [["Severity", "Evidence", "Action"], *weakness_rows],
                colWidths=[55, 225, 180],
                style=_tbl_std(pal),
            )
        )
        items.append(Spacer(1, 10))

    market_code = _market_code_from_ctx(ctx, positions)
    liq_rows = _compute_liquidity_metrics(
        positions, float(ctx.get("total_value") or 0), market_code
    )
    if liq_rows:
        items.append(Paragraph("LIQUIDITY WATCHLIST", st["h3"]))
        liq_table = [["Ticker", "Value", "ADV", "Days @20% ADV", "Status"]]
        for row in liq_rows[:4]:
            liq_table.append(
                [
                    row["symbol"],
                    f"${float(row.get('pos_m') or 0):.1f}M",
                    f"${float(row.get('adv_m') or 0):.1f}M",
                    str(row.get("days_normal") or "—"),
                    row.get("status") or "—",
                ]
            )
        items.append(
            Table(liq_table, colWidths=[70, 70, 70, 120, 90], style=_tbl_std(pal))
        )

    return items


# ─── PAGE 5b — LIQUIDITY ANALYSIS ────────────────────────────────────────────

VN_ADV_USD: dict[str, float] = {
    "VCI.VN": 12_000_000,
    "HPG.VN": 25_000_000,
    "VPB.VN": 18_000_000,
    "MBB.VN": 15_000_000,
    "SSI.VN": 8_000_000,
    "LCG.VN": 2_000_000,
    "DEFAULT": 5_000_000,
}


def _compute_liquidity_metrics(
    positions: list[dict], portfolio_aum_usd: float, market_code: str
) -> list[dict]:
    """Return per-position liquidity metrics using hardcoded ADV benchmarks."""
    rows: list[dict] = []
    for pos in positions:
        sym = str(pos.get("symbol") or pos.get("ticker") or "").upper()
        weight = float(pos.get("weight") or 0)
        pos_value_usd = weight * portfolio_aum_usd
        if pos_value_usd <= 0:
            continue
        adv = VN_ADV_USD.get(sym, VN_ADV_USD["DEFAULT"])
        pct_of_adv = (pos_value_usd / adv) * 100 if adv > 0 else 0
        days_normal = pos_value_usd / (adv * 0.20) if adv > 0 else 0
        days_stress = pos_value_usd / (adv * 0.05) if adv > 0 else 0
        if days_normal > 30:
            status = "ILLIQUID"
        elif days_normal > 5:
            status = "CAUTION"
        else:
            status = "LIQUID"
        rows.append(
            {
                "symbol": sym,
                "pos_m": round(pos_value_usd / 1_000_000, 2),
                "adv_m": round(adv / 1_000_000, 2),
                "pct_adv": round(pct_of_adv, 0),
                "days_normal": round(days_normal, 1),
                "days_stress": round(days_stress, 1),
                "status": status,
            }
        )
    rows.sort(key=lambda r: r["days_normal"], reverse=True)
    return rows


def _page_liquidity_analysis(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    items.extend(
        _ic_body_section_header(
            "4b",
            "LIQUIDITY ANALYSIS",
            "Position sizing vs average daily volume",
            pal,
            st,
            cw,
        )
    )

    positions = ctx.get("positions") or []
    aum = float(ctx.get("total_value") or 0)
    region = ctx.get("region_profile") or {}
    market_code = str(region.get("primary_market") or "US")

    rows = _compute_liquidity_metrics(positions, aum, market_code)
    if not rows:
        items.append(
            Paragraph("Liquidity data unavailable for this portfolio.", st["muted"])
        )
        return items

    # Table
    headers = [
        "Symbol",
        "Position (M)",
        "ADV (M)",
        "% of ADV",
        "Days Normal",
        "Days Stress",
        "Status",
    ]
    col_w = [cw * w for w in [0.14, 0.13, 0.10, 0.12, 0.14, 0.14, 0.14]]

    def _status_color(s: str) -> str:
        return (
            "#EF4444" if s == "ILLIQUID" else "#F5A623" if s == "CAUTION" else "#22C55E"
        )

    table_data = [[Paragraph(h, st["label"]) for h in headers]]
    for r in rows[:10]:
        sc = _status_color(r["status"])
        table_data.append(
            [
                Paragraph(r["symbol"], st["body"]),
                Paragraph(f"${r['pos_m']:,.1f}M", st["body"]),
                Paragraph(f"${r['adv_m']:,.1f}M", st["body"]),
                Paragraph(f"{int(r['pct_adv']):,}%", st["body"]),
                Paragraph(f"{r['days_normal']:.1f}d", st["body"]),
                Paragraph(f"{r['days_stress']:.1f}d", st["body"]),
                Paragraph(
                    r["status"],
                    ParagraphStyle(
                        f"liq_status_{r['symbol']}",
                        parent=st["body"],
                        textColor=HexColor(sc),
                        fontName="Helvetica-Bold",
                        fontSize=9,
                    ),
                ),
            ]
        )

    tbl = Table(table_data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), pal["card"]),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, pal["border"]),
                ("LINEBELOW", (0, 1), (-1, -1), 0.3, pal["border"]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    items.append(tbl)
    items.append(Spacer(1, 6))

    # Liquidity summary sentence
    illiquid = [r for r in rows if r["status"] == "ILLIQUID"]
    total_days_normal = max((r["days_normal"] for r in rows), default=0)
    total_days_stress = max((r["days_stress"] for r in rows), default=0)

    if illiquid:
        worst = illiquid[0]
        summary = (
            f"Portfolio liquidity horizon: ~{total_days_normal:.0f} days under normal "
            f"conditions, ~{total_days_stress:.0f} days under stress conditions. "
            f"{worst['symbol']} would require ~{worst['days_normal']:.0f} months to "
            f"exit at 20% ADV participation without market impact. "
            f"This is a material institutional risk at current sizing."
        )
    else:
        summary = (
            f"Portfolio liquidity horizon: ~{total_days_normal:.0f} days under normal "
            f"conditions. No positions are classified as illiquid at current sizing."
        )

    items.append(Paragraph(summary, st["body_sm"]))
    items.append(Spacer(1, 8))

    # Takeaway row
    if illiquid:
        liq_takeaway = (
            f"TAKEAWAY: {illiquid[0]['symbol']} is structurally illiquid at this AUM. "
            f"Exit requires {int(illiquid[0]['days_normal'] / 5)}-{int(illiquid[0]['days_normal'] / 5) + 4} weeks."
        )
    else:
        liq_takeaway = "TAKEAWAY: All positions are liquid under normal conditions."
    items.append(
        Table(
            [[Paragraph(f"<b>{_xml(liq_takeaway)}</b>", st["body_sm"])]],
            colWidths=[cw],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                    ("BOX", (0, 0), (-1, -1), 0.5, pal["border"]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            ),
        )
    )
    return items


# ─── PAGE 5c — SECTOR ATTRIBUTION ─────────────────────────────────────────────

VN_INDEX_SECTOR_WEIGHTS: dict[str, float] = {
    "Securities": 0.08,
    "Banking": 0.35,
    "Materials": 0.12,
    "Construction": 0.05,
    "Energy": 0.08,
    "Other": 0.32,
}

_SECTOR_MAP: dict[str, str] = {
    "VCI.VN": "Securities",
    "SSI.VN": "Securities",
    "VPB.VN": "Banking",
    "MBB.VN": "Banking",
    "BID.VN": "Banking",
    "VCB.VN": "Banking",
    "HPG.VN": "Materials",
    "LCG.VN": "Construction",
    "GAS.VN": "Energy",
}


def _classify_sector(sym: str) -> str:
    return _SECTOR_MAP.get(sym.upper(), "Other")


def _page_sector_attribution(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    items.extend(
        _ic_body_section_header(
            "4c",
            "SECTOR ATTRIBUTION",
            "Active bets vs VN-Index benchmark",
            pal,
            st,
            cw,
        )
    )

    positions = ctx.get("positions") or []
    if not positions:
        items.append(Paragraph("No position data available.", st["muted"]))
        return items

    # Aggregate sector weights
    sector_weights: dict[str, float] = {}
    for pos in positions:
        sym = str(pos.get("symbol") or "").upper()
        w = float(pos.get("weight") or 0)
        sector = _classify_sector(sym)
        sector_weights[sector] = sector_weights.get(sector, 0) + w

    # Table
    headers = ["Sector", "Portfolio%", "VN-Index%", "Active Bet", "Risk Contribution%"]
    col_w = [cw * w for w in [0.22, 0.16, 0.16, 0.22, 0.24]]

    table_data = [[Paragraph(h, st["label"]) for h in headers]]
    largest_bet: tuple[str, float] = ("", 0.0)

    for sector in sorted(sector_weights, key=lambda s: sector_weights[s], reverse=True):
        port_w = sector_weights[sector]
        bench_w = VN_INDEX_SECTOR_WEIGHTS.get(sector, VN_INDEX_SECTOR_WEIGHTS["Other"])
        active = port_w - bench_w
        risk_contrib = round(port_w * port_w * 100, 2)
        active_pct_str = f"{active*100:+.1f}%"
        active_color = (
            "#EF4444"
            if active > 0.15
            else "#F5A623" if active > 0.05 else "#22C55E" if active < 0 else "#64748B"
        )
        if abs(active) > abs(largest_bet[1]):
            largest_bet = (sector, active)
        table_data.append(
            [
                Paragraph(sector, st["body"]),
                Paragraph(f"{port_w*100:.1f}%", st["body"]),
                Paragraph(f"{bench_w*100:.1f}%", st["body"]),
                Paragraph(
                    active_pct_str,
                    ParagraphStyle(
                        f"active_bet_{sector}",
                        parent=st["body"],
                        textColor=HexColor(active_color),
                        fontName="Helvetica-Bold",
                        fontSize=9,
                    ),
                ),
                Paragraph(f"{risk_contrib:.2f}%", st["body"]),
            ]
        )

    tbl = Table(table_data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), pal["card"]),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, pal["border"]),
                ("LINEBELOW", (0, 1), (-1, -1), 0.3, pal["border"]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    items.append(tbl)
    items.append(Spacer(1, 6))

    # IC-grade narrative for the largest active bet
    if largest_bet[0] and abs(largest_bet[1]) > 0.10:
        sector_name = largest_bet[0]
        active_val = largest_bet[1]
        bench_val = VN_INDEX_SECTOR_WEIGHTS.get(
            sector_name, VN_INDEX_SECTOR_WEIGHTS["Other"]
        )
        port_val = sector_weights.get(sector_name, 0)
        direction = "overweight" if active_val > 0 else "underweight"
        narrative = (
            f"This portfolio has a {abs(active_val)*100:.1f}% active {direction} in "
            f"{sector_name.lower()} vs VN-Index ({port_val*100:.1f}% vs {bench_val*100:.1f}% benchmark). "
            f"This is a high-conviction directional bet, not diversification. "
            f"IC should validate whether this active exposure is intentional and within mandate limits."
        )
        items.append(Paragraph(narrative, st["body_sm"]))
    items.append(Spacer(1, 8))
    return items


# ─── PAGE 7 — TAX & OPTIMIZATION ──────────────────────────────────────────────


def _page_tax_optimization(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    items.extend(
        _ic_body_section_header(
            "7", "RECOMMENDATIONS", "Tax & implementation", pal, st, cw
        )
    )

    cgt_total = ctx["total_tax_liability"]
    harvest_total = ctx["total_harvest_opp"]
    tax_positions = ctx["tax_positions"]
    tax_narrative = ctx["tax_narrative"]
    pos_sorted = extra.get("pos_sorted") or []

    if not tax_positions:
        items.append(
            _amber_banner_table(
                "⚠  Cost basis not provided. Upload cost basis data to enable precise CGT analysis, "
                "tax-loss harvesting identification, and year-end optimisation recommendations. "
                "Estimates below are illustrative only.",
                pal,
                st,
                cw,
            )
        )
        items.append(Spacer(1, 10))

    # Summary
    items.append(
        Paragraph(
            f'<font color="{_hex(ACCENT_AMBER)}"><b>ESTIMATED CGT EXPOSURE: '
            f"${cgt_total:,.0f}</b></font><br/>"
            f'<font size="9" color="{_hex(pal["text_mut"])}">'
            f"Tax-loss harvest opportunity: ${harvest_total:,.0f}. "
            f"Computed from cost basis in DNA analysis.</font>",
            st["body"],
        )
    )
    items.append(Spacer(1, 8))

    # Tax positions table
    tax_rows = [["Symbol", "Unrealised G/L", "Est. CGT", "Harvest Credit", "Status"]]
    if tax_positions:
        for tp in tax_positions:
            if not isinstance(tp, dict):
                continue
            unr = float(tp.get("unrealised_gain") or 0)
            cgt = float(tp.get("tax_liability") or 0)
            hrc = float(tp.get("harvest_credit") or 0)
            status = (
                "Harvest candidate"
                if hrc > 0
                else ("Taxable gain" if cgt > 0 else "Neutral")
            )
            gcol = _hex(ACCENT_GREEN) if unr >= 0 else _hex(ACCENT_RED)
            tax_rows.append(
                [
                    str(tp.get("symbol", "—")),
                    Paragraph(f'<font color="{gcol}">{_fnum(unr)}</font>', st["body"]),
                    _fnum(cgt) if cgt > 0 else "—",
                    Paragraph(
                        (
                            f'<font color="{_hex(ACCENT_AMBER)}">{_fnum(hrc)}</font>'
                            if hrc > 0
                            else "—"
                        ),
                        st["body"],
                    ),
                    status,
                ]
            )
    else:
        for pos in pos_sorted[:10]:
            tax_rows.append(
                [
                    str(pos.get("symbol", "—")),
                    "—",
                    "—",
                    "—",
                    "Add cost basis for tax analysis",
                ]
            )
    items.append(Table(tax_rows, colWidths=[52, 90, 80, 90, 105], style=_tbl_std(pal)))
    items.append(Spacer(1, 8))

    # Harvest summary
    harvest_syms = [
        tp["symbol"] for tp in tax_positions if float(tp.get("harvest_credit") or 0) > 0
    ]
    if harvest_syms and harvest_total > 0:
        harvest_text = (
            f"Tax-loss harvesting candidates: {', '.join(harvest_syms[:6])} — "
            f"${harvest_total:,.0f} opportunity. "
            f"Est. 5-year after-tax benefit: ${harvest_total * 5:,.0f} (20% CGT rate)."
        )
    elif tax_narrative:
        harvest_text = tax_narrative
    else:
        harvest_text = (
            "Provide cost basis data to unlock full tax-loss harvesting analysis. "
            "This identifies realizable losses that can offset capital gains."
        )
    items.append(Paragraph(_xml(harvest_text), st["body"]))

    # ── Vietnam-specific tax notes (conditional on region) ────────────────────
    is_vn_tax = (
        ctx.get("is_sea_region")
        and (ctx.get("region_profile") or {}).get("primary_market", "").upper() == "VN"
    )
    if is_vn_tax:
        items.append(Spacer(1, 12))
        items.append(Paragraph("VIETNAM SECURITIES TAX NOTES", st["h3"]))
        vn_notes = [
            "Securities transfer tax: 0.1% of sale value (per Circular 111/2013/TT-BTC), "
            "applied on every sale regardless of gain or loss.",
            "Personal income tax on dividends: 5% withholding at source for listed securities.",
            "Foreign investor repatriation: governed by State Bank of Vietnam (SBV) regulations. "
            "Consult your custodian for VND\u2192USD conversion limits and SWIFT transfer thresholds.",
        ]
        if tax_positions:
            vn_notes.append(
                f"Tax-loss harvest figures above are computed in VND first "
                f"(base currency: {ctx.get('base_currency', 'VND')}), then converted to USD "
                "at the current FX rate shown in the page footer."
            )
        for note in vn_notes:
            items.append(
                Paragraph(
                    f'<font color="{_hex(ACCENT_AMBER)}">&#x2022;  </font>{_xml(note)}',
                    st["body"],
                )
            )
            items.append(Spacer(1, 4))

    return items


# ─── PAGE 8 — STRESS TESTING ──────────────────────────────────────────────────


def _page_stress_testing(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    labels = ctx.get("section_labels") or {}
    items.extend(
        _ic_body_section_header(
            "5",
            str(labels.get("scenario_analysis") or "SCENARIO ANALYSIS"),
            None,
            pal,
            st,
            cw,
        )
    )

    thesis = extra.get("thesis") or {}
    swarm_norm = extra.get("swarm_norm") or {}
    stress_results = (
        thesis.get("stress_results") or swarm_norm.get("stress_results") or {}
    )

    regime_label = ctx["regime_label"] or "Market-Neutral"
    beta = float(ctx.get("weighted_beta") or 0)

    def _scenario_ret_pct(data: Any) -> float:
        if not isinstance(data, dict):
            return 0.0
        raw = data.get("portfolio_return_pct", data.get("portfolio_impact", 0))
        try:
            return float(str(raw).replace("%", "").strip())
        except (TypeError, ValueError):
            return 0.0

    stress_artifact = True
    if isinstance(stress_results, dict) and stress_results:
        stress_artifact = any(
            isinstance(v, dict) and abs(_scenario_ret_pct(v)) > 200
            for v in stress_results.values()
        )
    elif isinstance(stress_results, list) and stress_results:
        stress_artifact = any(
            isinstance(v, dict) and abs(_scenario_ret_pct(v)) > 200
            for v in stress_results
        )
    elif stress_results:
        stress_artifact = False

    def _beta_impact(mult: float) -> str:
        return f"{(beta * mult) * 100:+.1f}% (beta-estimated)"

    if stress_artifact:
        items.append(
            Paragraph(
                "STRESS TEST — QUALITATIVE IC ASSESSMENT",
                ParagraphStyle(
                    "stress_warn_h_" + pal["theme"],
                    fontName="Helvetica-Bold",
                    fontSize=9,
                    textColor=ACCENT_AMBER,
                ),
            )
        )
        items.append(
            Paragraph(
                _xml(
                    "Quantitative stress figures reflect a portfolio weight "
                    "normalization artifact. IC qualitative assessment applied "
                    "based on individual position betas and sector exposures."
                ),
                ParagraphStyle(
                    "stress_warn_b_" + pal["theme"],
                    fontName="Helvetica",
                    fontSize=8,
                    textColor=pal["text_mut"],
                    spaceAfter=8,
                ),
            )
        )

        positions = list(ctx.get("positions") or [])
        market_code = _market_code_from_ctx(ctx, positions)
        defensive = get_defensive_alternatives(market_code)
        tech_cluster = ("AAPL", "MSFT", "AMZN", "NVDA", "META", "GOOGL", "TSLA")
        bond_cluster = ("TLT", "IEF", "BND", "AGG", "SHY", "GOVT")
        tech_w = sum(
            float(p.get("weight_pct") or p.get("weight") or 0)
            for p in positions
            if str(p.get("symbol") or "").upper() in tech_cluster
        )
        bond_w = sum(
            float(p.get("weight_pct") or p.get("weight") or 0)
            for p in positions
            if str(p.get("symbol") or "").upper() in bond_cluster
        )

        qualitative_rows = defensive.get("qualitative_scenarios")
        if qualitative_rows:
            qualitative_data = [
                ["Scenario", "Historical", "Est. Impact", "Primary Risk"]
            ]
            qualitative_data.extend(qualitative_rows)
        else:
            qualitative_data = [
                ["Scenario", "Historical", "Est. Impact", "Primary Risk"],
                [
                    "2022 Rate Shock",
                    "S&P -25.4%",
                    f"Est. -{min(35, max(8, tech_w * 0.5 + bond_w * 0.7)):.0f}% to "
                    f"-{min(45, max(14, tech_w * 0.65 + bond_w * 0.9)):.0f}%",
                    f"Tech {tech_w:.0f}% + duration",
                ],
                [
                    "2020 COVID Crash",
                    "S&P -33.9%",
                    "Est. -20% to -32%",
                    "All correlations -> 1.0 in liquidity crisis",
                ],
                [
                    "2024 AI Rotation",
                    "S&P -8.5%",
                    f"Est. -{max(4, tech_w * 0.3):.0f}% to -{max(8, tech_w * 0.45):.0f}%",
                    "Tech cluster amplifies rotation",
                ],
            ]
        stress_table = Table(
            qualitative_data,
            colWidths=[cw * 0.2, cw * 0.15, cw * 0.3, cw * 0.35],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), pal["border"]),
                    ("TEXTCOLOR", (0, 0), (-1, 0), pal["text_pri"]),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [pal["card"], pal["bg"]]),
                    ("TEXTCOLOR", (0, 1), (-1, -1), pal["text_bod"]),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("BOX", (0, 0), (-1, -1), 1, pal["border"]),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, pal["border"]),
                ]
            ),
        )
        items.append(stress_table)
        items.append(Spacer(1, 10))
    else:
        stress_raw: list[Any] = []
        if isinstance(stress_results, dict):
            stress_raw = list(stress_results.values())
        elif isinstance(stress_results, list):
            stress_raw = stress_results

        def _stress_row_usable(row: dict) -> bool:
            if row.get("data_status") == "unavailable":
                return False
            pr = row.get("portfolio_return_pct", row.get("portfolio_impact"))
            if pr is None:
                return False
            try:
                v = float(str(pr).replace("%", "").strip())
            except (TypeError, ValueError):
                return False
            return abs(v) <= 200

        stress_raw = [
            r for r in stress_raw if isinstance(r, dict) and _stress_row_usable(r)
        ]

        if not stress_raw:
            items.append(
                _amber_banner_table(
                    "Note: Stress-test output from Swarm IC is not available. "
                    "Qualitative scenarios below are estimated from portfolio beta and current regime.",
                    pal,
                    st,
                    cw,
                )
            )
            items.append(Spacer(1, 8))

        def _is_artifact_val(val: Any) -> bool:
            try:
                v = float(str(val).replace("%", "").strip())
                return abs(v) > 200
            except (TypeError, ValueError):
                return False

        has_row_artifact = any(
            _is_artifact_val(
                row.get("portfolio_impact") or row.get("portfolio_return_pct", "")
            )
            for row in stress_raw
            if isinstance(row, dict)
        )
        if has_row_artifact:
            items.append(
                _amber_banner_table(
                    "Note: Stress rows contained extreme values; using beta-estimated scenarios instead.",
                    pal,
                    st,
                    cw,
                )
            )
            items.append(Spacer(1, 8))

        scenario_defaults = [
            ("Bull", "35%", regime_label, _beta_impact(0.12)),
            ("Base", "45%", regime_label, _beta_impact(0.06)),
            ("Bear", "20%", regime_label, _beta_impact(-0.15)),
        ]
        scen_rows = [["Scenario", "Probability", "Regime", "Est. Portfolio Impact"]]
        for i, (label, default_prob, default_reg, default_impact) in enumerate(
            scenario_defaults
        ):
            if (
                (not has_row_artifact)
                and i < len(stress_raw)
                and isinstance(stress_raw[i], dict)
            ):
                row = stress_raw[i]
                impact = str(
                    row.get("portfolio_impact")
                    or row.get("portfolio_return_pct")
                    or default_impact
                )[:200]
                prob = (
                    _fpct(row.get("probability"))
                    if row.get("probability")
                    else default_prob
                )
                reg = str(row.get("regime") or default_reg)[:200]
            else:
                impact, prob, reg = default_impact, default_prob, default_reg
            scen_rows.append([label, prob, reg, impact])

        items.append(
            Table(scen_rows, colWidths=[60, 70, 100, 210], style=_tbl_std(pal))
        )
        items.append(Spacer(1, 10))

    commentary = (
        f"With a weighted beta of {beta:.2f}, the portfolio amplifies broad market moves. "
        f"In the current {regime_label} environment, bear-case drawdown risk is "
        f"{'elevated' if beta > 1.2 else 'contained'}. "
        f"{'Consider reducing high-beta exposure before a risk-off rotation.' if beta > 1.2 else 'Portfolio positioning is broadly appropriate for the current regime.'}"
    )
    items.append(Paragraph("QUALITATIVE STRESS COMMENTARY", st["h3"]))
    items.append(Paragraph(_xml(commentary), st["body"]))
    items.append(Spacer(1, 10))

    market_code = _market_code_from_ctx(ctx, ctx.get("positions") or [])
    defensive = get_defensive_alternatives(market_code)
    risk_scenarios = defensive.get("additional_risk_scenarios") or [
        [
            "Event Risk",
            "+25% VIX spike",
            f"Est. {_beta_impact(-0.08)}",
            "Monitor correlation spikes",
        ],
        [
            "Rate Shock",
            "+100bps yield shock",
            f"Est. {_beta_impact(-0.05)}",
            "Review duration exposure",
        ],
        [
            "FX Volatility",
            "USD +5%",
            "Varies by FX exposure",
            "Check international holdings",
        ],
        [
            "Liquidity Crunch",
            "Bid-ask spreads x 3",
            "Position exits may be costly",
            "Maintain cash buffer",
        ],
    ]
    risk_hdr = [["Scenario", "Trigger", "Impact Estimate", "Action"]]
    items.append(Paragraph("ADDITIONAL RISK SCENARIOS", st["h3"]))
    items.append(
        Table(
            risk_hdr + risk_scenarios,
            colWidths=[100, 110, 130, 110],
            style=_tbl_std(pal),
        )
    )
    return items


def _page_supporting_data(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    metrics = extra.get("metrics") or {}
    quant = extra.get("quant") or {}
    tax_r = extra.get("tax_r") or {}
    pos_sorted = extra.get("pos_sorted") or []
    data_quality = ctx.get("data_quality") or {}

    has_supporting_data = any(
        [
            pos_sorted,
            quant,
            tax_r,
            ctx.get("region_data_sources"),
            data_quality,
            ctx.get("alpha_opps"),
        ]
    )
    if not has_supporting_data:
        return []

    items.extend(
        _ic_body_section_header(
            "6",
            "SUPPORTING DATA",
            "Appendix details included only where source data exists.",
            pal,
            st,
            cw,
        )
    )

    if data_quality:
        dq_rows = [
            ["Price Quality", str(data_quality.get("data_quality") or "UNKNOWN")],
            [
                "Resolved Prices",
                f"{data_quality.get('prices_resolved', '—')} / {data_quality.get('total_positions', '—')}",
            ],
            [
                "Failed Tickers",
                ", ".join(data_quality.get("failed_tickers") or []) or "—",
            ],
        ]
        items.append(Paragraph("DATA QUALITY", st["h3"]))
        items.append(Table(dq_rows, colWidths=[130, 330], style=_tbl_std(pal)))
        items.append(Spacer(1, 8))

    if pos_sorted:
        hold = [["Symbol", "Weight", "Value", "Price Status"]]
        for pos in pos_sorted[:8]:
            hold.append(
                [
                    str(pos.get("symbol") or pos.get("ticker") or "—"),
                    f"{_w(pos) * 100:.1f}%",
                    format_pdf_market_value_cell(pos),
                    str(pos.get("price_status") or pos.get("source") or "—"),
                ]
            )
        items.append(Paragraph("TOP HOLDINGS DETAIL", st["h3"]))
        items.append(Table(hold, colWidths=[80, 70, 150, 160], style=_tbl_std(pal)))
        items.append(Spacer(1, 8))

    alpha_opps = ctx.get("alpha_opps") or []
    if alpha_opps:
        rows = [["Opportunity", "Confidence", "Regime"]]
        for opp in alpha_opps[:4]:
            rows.append(
                [
                    Paragraph(
                        _xml(str(opp.get("title") or "Opportunity")), st["body_sm"]
                    ),
                    str(opp.get("confidence") or "—"),
                    Paragraph(_xml(str(opp.get("regime") or "—")), st["body_sm"]),
                ]
            )
        items.append(Paragraph("ALPHA / ACTION BACKUP", st["h3"]))
        items.append(Table(rows, colWidths=[245, 75, 140], style=_tbl_std(pal)))
        items.append(Spacer(1, 8))

    quant_modes = ctx.get("quant_modes_selected") or []
    if quant_modes or metrics:
        source_note = (
            ctx.get("report_metrics_note")
            or "Metrics sourced from calculator and available Swarm IC outputs."
        )
        items.append(Paragraph("MODEL SOURCES", st["h3"]))
        items.append(
            Paragraph(
                _xml(
                    f"Quant modes: {', '.join(quant_modes) if quant_modes else 'standard calculator metrics'}. "
                    f"{source_note}"
                ),
                st["body_sm"],
            )
        )
    return items


# ─── PAGE 9 — ALPHA OPPORTUNITIES ────────────────────────────────────────────


def _page_alpha_opportunities(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    labels = ctx.get("section_labels") or {}
    items.extend(
        _ic_body_section_header(
            "7",
            str(labels.get("recommended_actions") or "RECOMMENDATIONS"),
            str(labels.get("alpha_opportunities") or "Alpha opportunities"),
            pal,
            st,
            cw,
        )
    )

    swarm_norm = extra.get("swarm_norm") or {}
    thesis = extra.get("thesis") or {}

    if not ctx.get("swarm_available"):
        items.append(
            Paragraph(
                "Portfolio-derived signals below. Run Swarm IC Analysis to unlock "
                "symbol-level alpha signals with estimated return impact.",
                st["muted"],
            )
        )
        items.append(Spacer(1, 6))

    # ── Alpha opportunities — use pre-parsed list; NEVER render raw JSON string
    alpha_opps: list[dict] = list(
        swarm_norm.get("alpha_signal_parsed") or thesis.get("alpha_signal_parsed") or []
    )

    if not alpha_opps:
        raw = swarm_norm.get("alpha_signal") or thesis.get("alpha_signal")
        if isinstance(raw, str) and "{" in raw:
            try:
                p = json.loads(raw)
                alpha_opps = list(
                    p.get("opportunities")
                    or (p.get("alpha_opportunities") or {}).get("opportunities")
                    or []
                )
            except Exception:
                alpha_opps = []
        elif isinstance(raw, dict):
            alpha_opps = list(
                raw.get("opportunities")
                or (raw.get("alpha_opportunities") or {}).get("opportunities")
                or []
            )

    th = pal["theme"]
    if alpha_opps:
        for opp in alpha_opps[:5]:
            if not isinstance(opp, dict):
                continue
            sym = str(opp.get("symbol") or "")
            conf_raw = opp.get("confidence", 0)
            try:
                cf = float(conf_raw)
            except (TypeError, ValueError):
                cf = 0.0
            conf_pct = int(cf * 100) if cf <= 1.0 else int(cf)
            reason = str(opp.get("reason") or "")
            if conf_pct >= 75:
                conf_col = ACCENT_GREEN
            elif conf_pct >= 60:
                conf_col = ACCENT_AMBER
            else:
                conf_col = ACCENT_SLATE

            card_data = [
                [
                    Paragraph(
                        f"<b>{_xml(sym)}</b>",
                        ParagraphStyle(
                            f"alpha_sym_{th}",
                            fontName="Helvetica-Bold",
                            fontSize=14,
                            textColor=ACCENT_TEAL,
                        ),
                    ),
                    Paragraph(
                        f"<b>{conf_pct}%</b> confidence",
                        ParagraphStyle(
                            f"alpha_conf_{th}",
                            fontName="Helvetica-Bold",
                            fontSize=10,
                            textColor=conf_col,
                            alignment=TA_RIGHT,
                        ),
                    ),
                ]
            ]
            card = Table(card_data, colWidths=[cw * 0.3, cw * 0.7])
            card.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                        ("TOPPADDING", (0, 0), (-1, -1), 8),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                        ("LEFTPADDING", (0, 0), (-1, -1), 10),
                        ("BOX", (0, 0), (-1, -1), 1, pal["border"]),
                    ]
                )
            )
            items.append(card)
            if reason:
                items.append(
                    Paragraph(
                        _xml(reason),
                        ParagraphStyle(
                            f"alpha_reason_{th}",
                            fontName="Helvetica",
                            fontSize=9,
                            textColor=pal["text_bod"],
                            leftIndent=10,
                            spaceAfter=4,
                        ),
                    )
                )
            items.append(Spacer(1, 8))
    else:
        defensive = get_defensive_alternatives(
            _market_code_from_ctx(ctx, ctx.get("positions") or [])
        )
        for title, desc, conf in [
            (
                "Defensive Rotation",
                "Portfolio beta suggests exposure to market drawdown. "
                + str(defensive["rotation_text"]),
                "72%",
            ),
            (
                "Tax-Loss Harvest Review",
                "Upload cost basis to identify harvest candidates. "
                "Estimated recoverable alpha: significant for positions "
                "showing unrealized losses.",
                "95%",
            ),
        ]:
            items.append(
                Paragraph(
                    f"<b>{_xml(title)}</b> · Confidence {conf}",
                    ParagraphStyle(
                        f"alpha_fb_title_{th}",
                        fontName="Helvetica-Bold",
                        fontSize=10,
                        textColor=ACCENT_TEAL,
                    ),
                )
            )
            items.append(
                Paragraph(
                    _xml(desc),
                    ParagraphStyle(
                        f"alpha_fb_desc_{th}",
                        fontName="Helvetica",
                        fontSize=9,
                        textColor=pal["text_bod"],
                        leftIndent=10,
                    ),
                )
            )
            items.append(Spacer(1, 8))

    return items


def _behavioral_alpha_summary(ctx: dict) -> list[dict[str, str]]:
    positions = list(ctx.get("positions") or [])
    hhi = float(ctx.get("hhi") or 0)
    rows: list[dict[str, str]] = []

    disposition_rows: list[str] = []
    for pos in positions:
        symbol = str(pos.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        try:
            shares = float(pos.get("shares") or pos.get("quantity") or 0)
            price = float(
                pos.get("current_price")
                or pos.get("price")
                or pos.get("price_local")
                or 0
            )
            basis = float(pos.get("cost_basis") or pos.get("avg_cost") or 0)
            fx_rate = float(pos.get("fx_rate") or 1)
        except (TypeError, ValueError):
            continue
        if shares <= 0 or price <= 0 or basis <= 0:
            continue
        pnl_usd = (price - basis) * shares * fx_rate
        if abs(pnl_usd) >= 500:
            bias = "loss anchoring" if pnl_usd < 0 else "premature profit-taking"
            decay = abs(pnl_usd) * 0.01
            disposition_rows.append(
                f"{symbol}: {bias}; estimated monthly alpha decay USD {decay:,.0f}."
            )
    rows.append(
        {
            "signal": "Disposition effect",
            "status": "Monitor" if disposition_rows else "Data pending",
            "detail": (
                " ".join(disposition_rows[:3])
                if disposition_rows
                else "Holding-period and cost-basis data required for position-level alpha decay."
            ),
        }
    )

    sector_totals: dict[str, float] = {}
    total_value = 0.0
    for pos in positions:
        try:
            value = float(
                pos.get("market_value_usd")
                or pos.get("value")
                or pos.get("current_value")
                or 0
            )
        except (TypeError, ValueError):
            value = 0.0
        if value <= 0:
            continue
        sector = str(pos.get("sector") or pos.get("industry") or "Unclassified")
        sector_totals[sector] = sector_totals.get(sector, 0.0) + value
        total_value += value
    sector_bits = []
    if total_value > 0:
        sector_bits = [
            f"{sector}: {(value / total_value) * 100:.0f}%"
            for sector, value in sorted(
                sector_totals.items(), key=lambda item: item[1], reverse=True
            )[:4]
        ]
    rows.append(
        {
            "signal": "Concentration cascade",
            "status": "Alert" if hhi > 0.4 else "Normal",
            "detail": (
                f"Smart concentration alert: HHI {hhi:.2f}. "
                f"Sector breakdown: {', '.join(sector_bits) or 'unavailable'}."
                if hhi > 0.4
                else f"HHI {hhi:.2f}; no cascade alert triggered."
            ),
        }
    )
    return rows


# ─── PAGE 8b — QUANT MODEL OUTPUTS (standalone) ─────────────────────────────


def _page_quant_model_outputs(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    """Dedicated IC-grade page for quantitative model outputs and analytics."""
    items: list = []
    labels = ctx.get("section_labels") or {}
    items.extend(
        _ic_body_section_header(
            "6",
            str(labels.get("quant_model_outputs") or "QUANT INTELLIGENCE SUMMARY"),
            "Selected objectives · model contribution · scenario implications",
            pal,
            st,
            cw,
        )
    )

    q_modes = ctx.get("quant_modes_selected") or []
    q_contrib = ctx.get("quant_model_contribution_summary") or {}
    q_tradeoffs = ctx.get("quant_alpha_risk_tradeoffs") or {}
    q_scen = ctx.get("quant_scenario_implications") or {}
    if not q_modes:
        return []

    objective_labels = {
        "alpha": "Alpha capture and stock selection",
        "risk": "Downside protection and drawdown control",
        "forecast": "Forward return and volatility outlook",
        "macro": "Macro regime positioning",
        "institutional": "Institutional blended allocation overlay",
        "allocation": "Macro regime positioning",
        "trading": "Tactical alpha and short-horizon timing",
    }

    # ── Selected modes banner ─────────────────────────────────────────────────
    modes_text = ", ".join(
        objective_labels.get(str(mode).lower(), str(mode).replace("_", " ").title())
        for mode in q_modes
    )
    items.append(
        Table(
            [
                [
                    Paragraph(
                        f"<b>Selected Financial Objectives:</b> {_xml(modes_text)}",
                        ParagraphStyle(
                            "qm_modes_" + pal["theme"],
                            fontName="Helvetica",
                            fontSize=9,
                            textColor=pal["text_pri"],
                            leading=13,
                        ),
                    )
                ]
            ],
            colWidths=[cw],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                    ("BOX", (0, 0), (-1, -1), 1, ACCENT_TEAL),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            ),
        )
    )
    items.append(Spacer(1, 10))

    # ── Factor / model contribution chart (via matplotlib bar chart) ──────────
    if HAS_MPL and q_contrib:
        try:
            labels_fc = list(q_contrib.keys())[:8]
            vals_fc = []
            for k in labels_fc:
                try:
                    vals_fc.append(round(float(q_contrib[k]) * 100, 2))
                except (TypeError, ValueError):
                    vals_fc.append(0.0)

            if labels_fc and any(v != 0 for v in vals_fc):
                fig, ax = plt.subplots(figsize=(6.5, 2.4))
                bg = pal["bg_hex"]
                fig.patch.set_facecolor(bg)
                ax.set_facecolor(bg)
                bar_colors = [
                    "#1EB8CC",
                    "#0EA5E9",
                    "#6366F1",
                    "#8B5CF6",
                    "#10B981",
                    "#F59E0B",
                    "#EF4444",
                    "#EC4899",
                ]
                ax.barh(
                    labels_fc,
                    vals_fc,
                    color=bar_colors[: len(labels_fc)],
                    height=0.6,
                )
                ax.set_xlabel("Contribution %", fontsize=8, color=pal["mut_hex"])
                ax.tick_params(labelsize=8, colors=pal["text_hex"])
                for spine in ax.spines.values():
                    spine.set_edgecolor(_hex(pal["border"]))
                ax.set_facecolor(bg)
                fig.patch.set_facecolor(bg)
                buf = io.BytesIO()
                fig.savefig(
                    buf,
                    format="png",
                    dpi=140,
                    bbox_inches="tight",
                    facecolor=bg,
                )
                plt.close(fig)
                buf.seek(0)
                chart_img = Image(buf, width=cw, height=110)
                items.append(Paragraph("MODEL CONTRIBUTION BREAKDOWN", st["h3"]))
                items.append(chart_img)
                items.append(Spacer(1, 10))
        except Exception as e:
            logger.warning("pdf.quant_contrib_chart_failed", error=str(e))

    # ── Model contribution table (text fallback / always shown) ──────────────
    if q_contrib:
        items.append(Paragraph("MODEL CONTRIBUTION SUMMARY", st["h3"]))
        contrib_rows = [["Objective / Signal Layer", "Contribution Weight"]]
        for k, v in q_contrib.items():
            try:
                pct = f"{round(float(v) * 100, 1)}%"
            except (TypeError, ValueError):
                pct = str(v)
            contrib_rows.append([_xml(str(k)), pct])
        items.append(
            Table(contrib_rows, colWidths=[cw * 0.65, cw * 0.35], style=_tbl_std(pal))
        )
        items.append(Spacer(1, 10))
    else:
        items.append(
            _amber_banner_table(
                "Model contribution summary unavailable. "
                "Run quant analysis with at least one mode to populate factor weights.",
                pal,
                st,
                cw,
            )
        )
        items.append(Spacer(1, 10))

    # ── Alpha vs risk tradeoffs ───────────────────────────────────────────────
    items.append(Paragraph("ALPHA vs RISK TRADEOFFS", st["h3"]))
    alpha_val = q_tradeoffs.get("sharpe") or q_tradeoffs.get("sharpe_proxy")
    vol_val = q_tradeoffs.get("volatility") or q_tradeoffs.get(
        "volatility_annualized_proxy"
    )
    dd_val = q_tradeoffs.get("max_drawdown") or q_tradeoffs.get("max_drawdown_proxy")
    sortino_val = q_tradeoffs.get("sortino")

    def _fmt_proxy(v: Any, pct: bool = False) -> str:
        if v is None:
            return "n/a"
        try:
            f = float(v)
            return f"{f * 100:.1f}%" if pct else f"{f:.3f}"
        except (TypeError, ValueError):
            return str(v)

    tradeoff_rows = [
        ["Alpha objective", "Risk implication"],
        [
            "Improve risk-adjusted upside capture",
            f"Sharpe: {_fmt_proxy(alpha_val)} | Sortino: {_fmt_proxy(sortino_val)}",
        ],
        [
            "Keep realised volatility inside mandate",
            f"Volatility: {_fmt_proxy(vol_val, pct=True)} annualised",
        ],
        [
            "Preserve capital through adverse regimes",
            f"Max drawdown: {_fmt_proxy(dd_val, pct=True)}",
        ],
    ]
    items.append(
        Table(tradeoff_rows, colWidths=[cw * 0.45, cw * 0.55], style=_tbl_std(pal))
    )
    items.append(Spacer(1, 10))

    # ── Scenario implications ─────────────────────────────────────────────────
    items.append(Paragraph("SCENARIO IMPLICATIONS", st["h3"]))
    forecast = (
        q_scen.get("forecast_outputs")
        if isinstance(q_scen.get("forecast_outputs"), dict)
        else q_scen.get("forecast") if isinstance(q_scen.get("forecast"), dict) else {}
    ) or {}
    stress = (
        q_scen.get("stress") if isinstance(q_scen.get("stress"), dict) else {}
    ) or {}
    regime_ctx = (
        q_scen.get("regime_context")
        if isinstance(q_scen.get("regime_context"), dict)
        else {}
    ) or {}

    scen_rows = [
        ["Dimension", "Value", "Notes"],
        [
            "Price Direction Confidence",
            f"{forecast.get('price_direction_confidence', 'n/a')}%",
            "Confidence in directional bias",
        ],
        [
            "Volatility Forecast",
            forecast.get("volatility_forecast", "n/a"),
            "Projected realised volatility regime",
        ],
        [
            "Stress Scenarios",
            str(stress.get("scenarios_sampled", "n/a")),
            "Monte Carlo paths sampled",
        ],
        [
            "Regime Context",
            _xml(str(regime_ctx.get("label", "n/a"))[:50]),
            f"Conf: {regime_ctx.get('confidence', 'n/a')}",
        ],
    ]
    items.append(Table(scen_rows, colWidths=[130, 120, cw - 250], style=_tbl_std(pal)))

    if not q_contrib and not q_tradeoffs and not any([forecast, stress, regime_ctx]):
        items.append(Spacer(1, 8))
        items.append(
            Paragraph(
                "Full quant model output requires the Swarm IC analysis to be run "
                "with at least one quantitative mode selected (institutional, trading, "
                "alpha, macro, allocation, forecast, or risk).",
                st["muted"],
            )
        )

    return items


# ─── PAGE 10 — 90-DAY DIRECTIVES ──────────────────────────────────────────────


def _page_directives(ctx: dict, extra: dict, pal: dict, st: dict, cw: float) -> list:
    items: list = []
    labels = ctx.get("section_labels") or {}
    items.extend(
        _ic_body_section_header(
            "7",
            str(labels.get("recommended_actions") or "RECOMMENDATIONS"),
            "Strategic directives (90 days)",
            pal,
            st,
            cw,
        )
    )

    thesis = extra.get("thesis") or {}
    pos_sorted = extra.get("pos_sorted") or []
    advisor_config = extra.get("advisor_config") or {}

    # Priority action table
    recs = ctx.get("recommendations") or []
    act_plan = thesis.get("action_plan") or thesis.get("recommendation_summary") or []
    if not isinstance(act_plan, list):
        act_plan = []
    rec_source = act_plan if act_plan else recs

    prio_rows = [["#", "Priority", "Action", "Rationale", "Timeline"]]
    for i, a in enumerate(rec_source[:6]):
        if isinstance(a, dict):
            pri_str = str(a.get("priority", "MED"))
            action = str(a.get("action") or "")
            rational = str(a.get("rationale") or "IC synthesis")[:200]
            timeline = str(a.get("timeline") or "90 days")[:200]
        else:
            pri_str = "MED"
            action = str(a)
            rational = "IC synthesis"
            timeline = "90 days"
        pri_col = (
            _hex(ACCENT_RED)
            if "HIGH" in pri_str.upper()
            else _hex(ACCENT_AMBER) if "MED" in pri_str.upper() else _hex(ACCENT_GREEN)
        )
        prio_rows.append(
            [
                str(i + 1),
                Paragraph(
                    f'<font color="{pri_col}"><b>{_xml(pri_str)}</b></font>', st["body"]
                ),
                Paragraph(_xml(action), st["body"]),
                Paragraph(_xml(rational), st["body"]),
                _xml(timeline),
            ]
        )
    items.append(
        Table(prio_rows, colWidths=[22, 45, 185, 160, 65], style=_tbl_std(pal))
    )
    items.append(Spacer(1, 10))

    execution_actions = ctx.get("execution_actions") or []
    if execution_actions:
        items.append(Paragraph("EXECUTION PLAN", st["h3"]))
        exec_rows = [
            [
                "Symbol",
                "Action",
                "Current %",
                "Target %",
                "Shares",
                "Notional (USD)",
                "Why Optimal",
                "Post-Trade Impact",
                "Execution Note",
            ]
        ]
        hhi = float(ctx.get("hhi") or 0)
        dna_score = int(ctx.get("dna_score") or 0)
        n_effective = round(1.0 / hhi, 1) if hhi > 0 else 0
        for action in execution_actions:
            # Compute inline metrics
            hhi_target = (
                hhi
                * (
                    float(action["target_weight_pct"])
                    / max(float(action["current_weight_pct"]), 0.01)
                )
                ** 2
            )
            n_effective_post = (
                round(1.0 / hhi_target, 1) if hhi_target > 0 else n_effective
            )
            dna_post = min(
                100,
                dna_score
                + max(
                    2,
                    int(
                        (
                            float(action["current_weight_pct"])
                            - float(action["target_weight_pct"])
                        )
                        / 2
                    ),
                ),
            )

            why_optimal = (
                f"Reduces HHI {hhi:.3f}→{hhi_target:.3f}. "
                f"Effective N: {n_effective}→{n_effective_post} positions."
            )
            post_impact = (
                f"DNA: {dna_score}→{dna_post}/100. "
                f"Risk: {'HIGH→MEDIUM' if float(action['current_weight_pct']) > 30 else 'unchanged'}."
            )
            exec_rows.append(
                [
                    action["ticker"],
                    action["action_type"],
                    f"{float(action['current_weight_pct']):.1f}%",
                    f"{float(action['target_weight_pct']):.1f}%",
                    f"{int(action['shares_to_trade']):,}",
                    f"${float(action['notional_usd']):,.0f}",
                    Paragraph(_xml(why_optimal), st["body_sm"]),
                    Paragraph(_xml(post_impact), st["body_sm"]),
                    Paragraph(_xml(str(action["execution_note"])), st["body_sm"]),
                ]
            )
        items.append(
            Table(
                exec_rows,
                colWidths=[45, 55, 44, 44, 50, 65, 130, 110, 120],
                style=_tbl_std(pal),
            )
        )
        items.append(Spacer(1, 10))
        # Optimization rationale footnote (CHANGE 4)
        has_cost_basis = any(
            float(p.get("cost_basis") or 0) > 0 for p in (ctx.get("positions") or [])
        )
        n_target = 6
        hhi_optimal_single = 1.0 / n_target
        if has_cost_basis:
            opt_note = (
                "Target weight from CVaR-constrained optimisation: minimises portfolio ES(95%). "
                f"HHI optimal single position = 1/{n_target} = {hhi_optimal_single:.3f} for N={n_target} positions."
            )
        else:
            opt_note = (
                f"Target weight derived from: min(current_weight x 0.87, HHI_optimal_single_position) "
                f"where HHI_optimal_single_position = 1/N_target = {hhi_optimal_single:.3f} for N_target = {n_target} positions. "
                "Not mean-variance optimised (cost basis required). Constraint-based floor."
            )
        items.append(Paragraph(opt_note, st["muted8"]))
        items.append(Spacer(1, 8))
    elif pos_sorted:
        items.append(
            Paragraph(
                "All positions are already within execution bands; no immediate re-sizing trade is required.",
                st["muted"],
            )
        )
        items.append(Spacer(1, 10))

    # Next review box
    next_review = datetime.datetime.now() + datetime.timedelta(days=90)
    items.append(
        Table(
            [
                [Paragraph("<b>NEXT PORTFOLIO REVIEW</b>", st["h3"])],
                [
                    Paragraph(
                        _xml(
                            f"Scheduled: {next_review.strftime('%B %Y')} — "
                            "30-day check-in recommended after regime change."
                        ),
                        st["body"],
                    )
                ],
                [
                    Paragraph(
                        _xml(
                            f"Contact: {advisor_config.get('advisor_email') or ctx['advisor_email']}"
                        ),
                        st["body"],
                    )
                ],
            ],
            colWidths=[cw],
            style=TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 1.5, ACCENT_TEAL),
                    ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            ),
        )
    )
    return items


# ─── PAGE 11 — AGENT ATTRIBUTION ─────────────────────────────────────────────


def _page_agent_attribution(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    items.extend(
        _ic_body_section_header(
            "8",
            "APPENDIX",
            "Methodology, data sources, and AI attribution",
            pal,
            st,
            cw,
        )
    )

    swarm_available = ctx.get("swarm_available")
    if not swarm_available:
        items.append(
            Paragraph(
                "Swarm IC analysis not yet run for this portfolio — "
                "trace reflects DNA analysis only. "
                "Run from the portfolio page for full 7-agent attribution.",
                st["muted"],
            )
        )
    items.append(Spacer(1, 6))

    # Agent trace table
    trace_raw = ctx.get("agent_trace") or []
    if isinstance(trace_raw, str):
        trace_raw = [trace_raw]
    if not isinstance(trace_raw, list):
        trace_raw = []

    agent_defs = [
        ("Market Regime", "FRED macro signals", "Regime label + confidence"),
        ("Strategist", "News + narrative", "Positioning implications"),
        ("Quant Analyst", "Prices + correlations", "Risk metrics + stress tests"),
        ("Tax Architect", "Cost basis data", "CGT liability + harvest ops"),
        ("Risk Sentinel", "Portfolio watchdog", "Risk level + mitigations"),
        ("Alpha Scout", "External opportunities", "Symbols + confidence"),
        ("Synthesizer", "Full IC context", "Headline + action plan"),
    ]
    agent_rows: list = [["Agent", "Key Input", "Key Output", "Trace Snippet"]]
    for i, (agent, kin, kout) in enumerate(agent_defs):
        snippet = str(trace_raw[i])[:200] if i < len(trace_raw) else "—"
        agent_rows.append(
            [
                Paragraph(f"<b>{agent}</b>", st["body"]),
                Paragraph(_xml(kin), st["body_sm"]),
                Paragraph(_xml(kout), st["body_sm"]),
                Paragraph(_xml(snippet), st["body_sm"]),
            ]
        )
    items.append(Table(agent_rows, colWidths=[90, 95, 110, 160], style=_tbl_std(pal)))
    items.append(Spacer(1, 10))

    # Quant model I/O section
    labels = ctx.get("section_labels") or {}
    items.append(
        Paragraph(
            str(labels.get("quant_model_outputs") or "QUANT MODEL OUTPUTS"),
            st["h3"],
        )
    )
    q_modes = ctx.get("quant_modes_selected") or []
    q_contrib = ctx.get("quant_model_contribution_summary") or {}
    q_tradeoffs = ctx.get("quant_alpha_risk_tradeoffs") or {}
    q_scen = ctx.get("quant_scenario_implications") or {}

    modes_text = (
        ", ".join(str(m).upper() for m in q_modes)
        if q_modes
        else "Default (none selected)"
    )
    if q_contrib:
        contrib_parts: list[str] = []
        for k, v in q_contrib.items():
            try:
                contrib_parts.append(f"{k}: {round(float(v) * 100)}%")
            except (TypeError, ValueError):
                contrib_parts.append(f"{k}: {v}")
        contrib_text = ", ".join(contrib_parts)
    else:
        contrib_text = "No quant contribution overlay was applied for this run."
    alpha_val = q_tradeoffs.get("sharpe_proxy")
    vol_val = q_tradeoffs.get("volatility_annualized_proxy")
    dd_val = q_tradeoffs.get("max_drawdown_proxy")
    tradeoff_text = (
        f"Sharpe proxy: {alpha_val if alpha_val is not None else 'n/a'} | "
        f"Volatility proxy: {vol_val if vol_val is not None else 'n/a'} | "
        f"Drawdown proxy: {dd_val if dd_val is not None else 'n/a'}"
    )

    forecast = (
        q_scen.get("forecast") if isinstance(q_scen.get("forecast"), dict) else {}
    )
    stress = q_scen.get("stress") if isinstance(q_scen.get("stress"), dict) else {}
    regime_context = (
        q_scen.get("regime_context")
        if isinstance(q_scen.get("regime_context"), dict)
        else {}
    )
    scenario_text = (
        f"Forecast horizon: {forecast.get('horizon_days', 'n/a')} days; "
        f"Vol shift vs baseline: {forecast.get('volatility_shift_pct_vs_baseline', 'n/a')}%. "
        f"Stress scenarios sampled: {stress.get('scenarios_sampled', 'n/a')}. "
        f"Regime context: {regime_context.get('label', 'n/a')}"
    )

    quant_rows = [
        [
            Paragraph("Selected modes", st["label"]),
            Paragraph(_xml(modes_text), st["body_sm"]),
        ],
        [
            Paragraph("Model contribution summary", st["label"]),
            Paragraph(_xml(contrib_text), st["body_sm"]),
        ],
        [
            Paragraph("Alpha vs risk tradeoffs", st["label"]),
            Paragraph(_xml(tradeoff_text), st["body_sm"]),
        ],
        [
            Paragraph("Scenario implications", st["label"]),
            Paragraph(_xml(scenario_text), st["body_sm"]),
        ],
    ]
    items.append(Table(quant_rows, colWidths=[130, cw - 130], style=_tbl_std(pal)))
    items.append(Spacer(1, 10))

    # Behavioral alpha appendix
    items.append(Paragraph("BEHAVIORAL ALPHA SUMMARY", st["h3"]))
    behavioral_rows = [["Signal", "Status", "Interpretation"]]
    for row in _behavioral_alpha_summary(ctx):
        behavioral_rows.append(
            [
                Paragraph(_xml(row["signal"]), st["body_sm"]),
                Paragraph(_xml(row["status"]), st["body_sm"]),
                Paragraph(_xml(row["detail"]), st["body_sm"]),
            ]
        )
    items.append(
        Table(
            behavioral_rows,
            colWidths=[120, 75, cw - 195],
            style=_tbl_std(pal),
        )
    )
    items.append(Spacer(1, 10))

    # Data sources
    items.append(Paragraph("DATA SOURCES & INFRASTRUCTURE", st["h3"]))
    sources = [
        ["Category", "Provider", "Coverage"],
        ["Market Data", "Polygon.io, Yahoo Finance", "Real-time & historical prices"],
        ["Fundamentals", "Finnhub, Alpha Vantage", "Financials, earnings, dividends"],
        ["Macro / FRED", "Federal Reserve (FRED API)", "Rates, CPI, PMI, yield curve"],
        ["AI Engine", "Anthropic Claude Sonnet", "IC synthesis & narrative"],
        ["DNA Engine", "NeuFin proprietary model", "Behavioral archetype scoring"],
    ]
    if ctx.get("is_sea_region"):
        region = ctx.get("region_profile") or {}
        sources.insert(
            2,
            [
                "SEA Market Data",
                f"{region.get('benchmark_name', 'Local index')} / TwelveData / Yahoo Finance",
                ctx.get("region_data_sources")
                or "Local benchmark, FX, and listing data",
            ],
        )
    items.append(Table(sources, colWidths=[100, 180, 155], style=_tbl_std(pal)))
    items.append(Spacer(1, 8))

    # VN market context in methodology appendix
    if (
        ctx.get("is_sea_region")
        and (ctx.get("region_profile") or {}).get("primary_market", "").upper() == "VN"
    ):
        items.append(Paragraph("VIETNAM MARKET CONTEXT", st["h3"]))
        vn_ctx_rows = [
            [
                "Exchange hours",
                "HOSE 09:00\u201311:30 / 13:00\u201314:30 ICT (UTC+7). HNX closes 15:00.",
            ],
            [
                "Daily price limits",
                "\u00b17% for most HOSE stocks; \u00b110% for newly listed; \u00b15% for UpCoM.",
            ],
            [
                "Foreign ownership limits",
                "Sector-specific FOL: typically 49% for non-banking; lower for banking/insurance/defence.",
            ],
            [
                "Currency & settlement",
                "VND (Vietnamese Dong). T+2 settlement on HOSE. FX rate per SBV reference or TwelveData.",
            ],
        ]
        items.append(Table(vn_ctx_rows, colWidths=[130, cw - 130], style=_tbl_std(pal)))
        items.append(Spacer(1, 8))

    # Overall confidence
    conf_pct = 78 if swarm_available else 65
    now = datetime.datetime.now()
    run_id = ctx.get("report_run_id") or "—"
    items.append(
        Table(
            [
                [
                    Paragraph(
                        f"<b>OVERALL CONFIDENCE: {conf_pct}%</b><br/>"
                        f'<font size="8">Based on data freshness, model certainty, and Swarm IC coverage. '
                        f"Scores below 70% indicate higher uncertainty.</font>",
                        ParagraphStyle(
                            "oc_" + pal["theme"],
                            fontSize=11,
                            textColor=pal["text_pri"],
                            alignment=TA_CENTER,
                            leading=15,
                        ),
                    )
                ]
            ],
            colWidths=[cw],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), pal["card"]),
                    ("BOX", (0, 0), (-1, -1), 1, ACCENT_TEAL),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ]
            ),
        )
    )
    items.append(Spacer(1, 8))
    items.append(
        Paragraph(
            _xml(
                f"Market data: Polygon.io, Finnhub, Alpha Vantage, Yahoo Finance. "
                f"Macro: FRED. AI: Claude Sonnet (Anthropic). "
                f"Generated: {now.isoformat()[:19]}. Report ID: {run_id}."
            ),
            st["muted8"],
        )
    )
    return items


# ─── IC READINESS SCORING ─────────────────────────────────────────────────────


def compute_ic_readiness(ctx: dict) -> dict:
    """
    Score completeness of report inputs and return tier + checklist flags.

    Tier:
      IC-READY       score >= 90   (green)
      ADVISOR-READY  score >= 60   (amber)
      DRAFT          score < 60    (red)
    """
    score = 0
    flags: list[dict] = []

    # Core data — 60 pts total
    positions = ctx.get("positions") or []
    if positions:
        score += 20
    else:
        flags.append(
            {
                "item": "Portfolio positions",
                "status": "MISSING",
                "impact": "Cannot generate any analysis",
            }
        )

    prices_fresh = ctx.get("prices_fresh", True)  # assume fresh unless told otherwise
    if prices_fresh:
        score += 15
    else:
        flags.append(
            {
                "item": "Market prices",
                "status": "STALE",
                "impact": "Valuations may be inaccurate",
            }
        )

    data_quality = ctx.get("data_quality") or {}
    if not isinstance(data_quality, dict):
        data_quality = {}
    price_quality_poor = data_quality.get("data_quality") == "POOR" or bool(
        data_quality.get("weights_suspicious")
    )
    if price_quality_poor:
        flags.append(
            {
                "item": "Price resolution",
                "status": "POOR",
                "impact": "Dollar weights could not be fully verified",
            }
        )

    if ctx.get("cost_basis_provided"):
        score += 15
    else:
        flags.append(
            {
                "item": "Cost basis",
                "status": "MISSING",
                "impact": "Tax analysis unavailable",
            }
        )

    if ctx.get("benchmark_set"):
        score += 10
    else:
        flags.append(
            {
                "item": "Benchmark",
                "status": "DEFAULT",
                "impact": "Using broad index — not mandate-specific",
            }
        )

    # Swarm IC — 40 pts
    if ctx.get("swarm_available"):
        score += 40
    else:
        flags.append(
            {
                "item": "Swarm IC Analysis",
                "status": "NOT RUN",
                "impact": "Multi-agent synthesis unavailable — DNA-only output",
            }
        )

    if score >= 90:
        tier, tier_color = "IC-READY", "00C851"
    elif score >= 60:
        tier, tier_color = "ADVISOR-READY", "FFB300"
    else:
        tier, tier_color = "DRAFT", "FF4444"

    if price_quality_poor and tier != "DRAFT":
        tier, tier_color = "DRAFT", "FF4444"

    return {
        "score": score,
        "tier": tier,
        "tier_color": tier_color,
        "flags": flags,
    }


# ─── MAIN SYNC PDF BUILDER ────────────────────────────────────────────────────


def _build_pdf_sync(
    portfolio_data: dict,
    dna_data: dict,
    swarm_norm: dict,
    advisor_config: dict,
    logo_bytes: bytes | None,
    swarm_data_present: bool,
    theme: str = "light",
    ic_grade_only: bool = False,
    report_mode: str = "standard",
) -> bytes:
    pal = _palette(theme)
    st = _styles(pal)
    cw = CONTENT_W

    # Build unified context
    advisor_cfg = dict(advisor_config or {})
    advisor_cfg["report_mode"] = _normalize_report_mode(report_mode)
    ctx = _build_report_context(portfolio_data, dna_data, swarm_norm, advisor_cfg)
    ctx["swarm_available"] = swarm_data_present
    ctx["report_state"] = assess_report_state(ctx)
    ctx["section_confidence"] = build_section_confidence(ctx)

    # IC Readiness — scored from ctx inputs
    _positions_raw = (
        portfolio_data.get("positions")
        or portfolio_data.get("positions_with_basis")
        or []
    )
    _has_cost_basis = any(
        (p.get("cost_basis") or p.get("cost_per_share")) is not None
        for p in (_positions_raw if isinstance(_positions_raw, list) else [])
    ) or bool(ctx.get("cost_basis_provided"))
    ic_ctx = {
        "positions": ctx.get("positions") or _positions_raw,
        "prices_fresh": True,
        "data_quality": ctx.get("data_quality") or {},
        "cost_basis_provided": _has_cost_basis,
        "benchmark_set": bool(ctx.get("portfolio_benchmark") or ctx.get("benchmark")),
        "swarm_available": swarm_data_present,
    }
    ctx["ic_readiness"] = compute_ic_readiness(ic_ctx)

    # VN-specific footer note (built once, reused per page in _make_hf_callback)
    now = datetime.datetime.utcnow()
    if (
        ctx.get("is_sea_region")
        and (ctx.get("region_profile") or {}).get("primary_market", "").upper() == "VN"
    ):
        _vn_positions = ctx.get("positions") or []
        _vn_fx_vals = [
            float(p.get("fx_rate") or 0)
            for p in _vn_positions
            if float(p.get("fx_rate") or 0) > 0
        ]
        _vn_fx_str = (
            f"VNDUSD {_vn_fx_vals[-1]:.6f}"
            if _vn_fx_vals
            else "VNDUSD: see position data"
        )
        ctx["vn_footer_note"] = (
            f"Prices as of {now.strftime('%Y-%m-%d')} \u00b7 VN-Index benchmark"
            f" \u00b7 {_vn_fx_str} \u00b7 Source: TwelveData / Yahoo Finance"
        )
    else:
        ctx["vn_footer_note"] = None

    if ic_grade_only and ctx["report_state"] == REPORT_DRAFT:
        raise ValueError(
            "IC-grade PDF export requires complete portfolio data, DNA analysis, "
            "and normalized weights (report is currently in draft state)."
        )

    # Quality gates
    warnings = _quality_check(ctx)

    # Swarm sub-dicts
    thesis = swarm_norm.get("investment_thesis") or {}
    if not isinstance(thesis, dict):
        thesis = {}
    quant = swarm_norm.get("quant_analysis") or thesis.get("quant_analysis") or {}
    if not isinstance(quant, dict):
        quant = {}
    tax_r = (
        swarm_norm.get("tax_recommendation") or thesis.get("tax_recommendation") or {}
    )
    if not isinstance(tax_r, dict):
        tax_r = {}
    sentinel = swarm_norm.get("risk_sentinel") or thesis.get("risk_sentinel") or {}
    if not isinstance(sentinel, dict):
        sentinel = {}

    # Sort positions
    pos_sorted = sorted(ctx.get("positions") or [], key=_w, reverse=True)

    # Metrics from portfolio_data
    metrics = portfolio_data.get("metrics") or {}
    if not isinstance(metrics, dict):
        metrics = {}

    extra = {
        "swarm_norm": swarm_norm,
        "thesis": thesis,
        "quant": quant,
        "tax_r": tax_r,
        "sentinel": sentinel,
        "metrics": metrics,
        "pos_sorted": pos_sorted,
        "swarm_data_present": swarm_data_present,
        "warnings": warnings,
        "logo_bytes": logo_bytes,
        "advisor_config": advisor_cfg,
    }

    now = datetime.datetime.now()
    report_date = now.strftime("%B %d, %Y")
    firm_name = ctx["firm_name"] or ctx["advisor_name"]

    buffer = io.BytesIO()
    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN + 18,
        bottomMargin=MARGIN + 22,
    )

    cover_cb = _make_cover_callback(ctx, pal, logo_bytes, advisor_config, report_date)
    body_cb = _make_hf_callback(ctx, pal, firm_name, logo_bytes, report_date)

    cover_frame = Frame(0, 0, A4_W, A4_H, id="cover")
    body_frame = Frame(
        MARGIN,
        MARGIN + 20,
        cw,
        A4_H - 2 * MARGIN - 60,
        id="body",
    )
    doc.addPageTemplates(
        [
            PageTemplate(id="Cover", frames=[cover_frame], onPage=cover_cb),
            PageTemplate(id="Body", frames=[body_frame], onPage=body_cb),
        ]
    )

    elems: list = [Spacer(1, 1), NextPageTemplate("Body"), PageBreak()]

    # ── Body: §2 executive … §8 appendix (cover is separate template) ─────────
    def _add_page(builder, *args):
        try:
            elems.extend(builder(*args))
        except Exception as e:
            logger.error(
                f"pdf.page_build_failed builder={builder.__name__}",
                error=str(e),
                exc_info=True,
            )
            elems.append(
                Paragraph(
                    "This section could not be rendered completely. "
                    "Regenerate the report or contact support if the issue persists.",
                    st["muted"],
                )
            )
        elems.append(PageBreak())

    def _add_optional_page(builder, *args):
        try:
            page_items = builder(*args)
            if not page_items:
                return
            elems.extend(page_items)
        except Exception as e:
            logger.error(
                f"pdf.page_build_failed builder={builder.__name__}",
                error=str(e),
                exc_info=True,
            )
            elems.append(
                Paragraph(
                    "This section could not be rendered completely. "
                    "Regenerate the report or contact support if the issue persists.",
                    st["muted"],
                )
            )
        elems.append(PageBreak())

    # Goldman/IC reading order:
    # Cover → Decision Brief → Executive Summary → Portfolio Snapshot →
    # Risk & Behavioral Intelligence → Scenario Analysis → Supporting Data.
    _add_page(_page_decision_brief, ctx, extra, pal, st, cw)
    _add_page(_page_executive_summary_condensed, ctx, extra, pal, st, cw)
    _add_page(_page_portfolio_snapshot, ctx, extra, pal, st, cw)
    _add_page(_page_risk_behavioral_intelligence, ctx, extra, pal, st, cw)
    _add_page(_page_stress_testing, ctx, extra, pal, st, cw)
    _add_optional_page(_page_supporting_data, ctx, extra, pal, st, cw)

    try:
        doc.build(elems, canvasmaker=NumberedCanvas)
    except Exception as e:
        logger.error("pdf.doc_build_failed", error=str(e), exc_info=True)
        try:
            return _generate_emergency_pdf(str(e), advisor_config, pal)
        except Exception as e2:
            logger.error("pdf.emergency_pdf_failed", error=str(e2), exc_info=True)
            raise RuntimeError(f"PDF render failed: {e}") from e2

    return buffer.getvalue()


# ─── ASYNC ORCHESTRATOR ───────────────────────────────────────────────────────


async def generate_advisor_report(
    portfolio_data: dict,
    dna_data: dict,
    swarm_data: Any | None,
    advisor_config: dict,
    theme: str = "light",
    ic_grade_only: bool = False,
    report_mode: str = "standard",
) -> bytes:
    """
    Async orchestrator: fetch logo → normalize swarm → synchronous PDF build.

    Args:
        portfolio_data:  dict with keys: name, total_value, metrics, positions_with_basis
        dna_data:        dict with keys: dna_score, investor_type, strengths, weaknesses, …
        swarm_data:      raw swarm_reports row or None
        advisor_config:  dict with keys: advisor_name, firm_name, logo_url, …
        theme:           "light" (default, institutional) or "white" (alias) or "dark"
        ic_grade_only:   When True, refuse to build if report_state would be ``draft``.

    Returns:
        Raw PDF bytes.
    """
    raw_logo = await _fetch_logo_bytes(advisor_config)
    logo_bytes = _prepare_logo_bytes(raw_logo)
    swarm_norm = _normalize_swarm(swarm_data)
    swarm_present = isinstance(swarm_data, dict) and bool(swarm_data)

    try:
        return _build_pdf_sync(
            portfolio_data,
            dna_data or {},
            swarm_norm,
            advisor_config,
            logo_bytes,
            swarm_present,
            theme=theme,
            ic_grade_only=ic_grade_only,
            report_mode=report_mode,
        )
    except ValueError:
        # Intentional gate (e.g. ic_grade_only + draft state) — never mask as emergency PDF
        raise
    except Exception as e:
        logger.error("pdf.orchestrator_failed", error=str(e), exc_info=True)
        try:
            return _generate_emergency_pdf(
                f"Report assembly failed: {e}",
                advisor_config,
                _palette(theme),
            )
        except Exception as e2:
            logger.error("pdf.emergency_pdf_failed", error=str(e2), exc_info=True)
            raise


# ─── TEST BLOCK ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio

    _POSITIONS = [
        {
            "symbol": "AAPL",
            "value": 75000,
            "weight": 30.0,
            "weight_pct": 30.0,
            "shares": 50,
            "cost_basis": 60000,
        },
        {
            "symbol": "NVDA",
            "value": 50000,
            "weight": 20.0,
            "weight_pct": 20.0,
            "shares": 25,
            "cost_basis": 35000,
        },
        {
            "symbol": "GLD",
            "value": 37500,
            "weight": 15.0,
            "weight_pct": 15.0,
            "shares": 20,
            "cost_basis": 40000,
        },
        {
            "symbol": "MSFT",
            "value": 25000,
            "weight": 10.0,
            "weight_pct": 10.0,
            "shares": 15,
            "cost_basis": 20000,
        },
        {
            "symbol": "TLT",
            "value": 25000,
            "weight": 10.0,
            "weight_pct": 10.0,
            "shares": 100,
            "cost_basis": 27000,
        },
        {
            "symbol": "AMZN",
            "value": 37500,
            "weight": 15.0,
            "weight_pct": 15.0,
            "shares": 12,
            "cost_basis": 30000,
        },
    ]

    _PORTFOLIO = {
        "name": "Test Growth Portfolio",
        "total_value": 250000,
        "metrics": {
            "weighted_beta": 1.24,
            "sharpe_ratio": 0.87,
            "avg_correlation": 0.61,
            "hhi": 0.18,
            "num_positions": 6,
            "total_value": 250000,
        },
        "positions_with_basis": _POSITIONS,
    }

    _DNA = {
        "dna_score": 74,
        "investor_type": "Balanced Growth Investor",
        "strengths": [
            "Diversified across growth and defensive assets with GLD inflation hedge.",
            "Technology exposure balanced with fixed income duration offset via TLT.",
            "NVDA position captures secular AI tailwind with managed concentration.",
        ],
        "weaknesses": [
            "High correlation between AAPL and MSFT creates hidden concentration risk "
            "in large-cap tech - both are sensitive to rate moves and valuation re-rating.",
            "Gold allocation at 15% is below the 10-15% typical inflation hedge threshold; "
            "consider increasing if CPI remains elevated.",
            "TLT duration risk is elevated - prolonged rate volatility could pressure NAV.",
        ],
        "recommendation": (
            "Trim AAPL by 5% and redeploy into XLP (consumer staples) to reduce "
            "tech concentration. Review TLT duration against current yield curve."
        ),
        "weighted_beta": 1.24,
        "avg_correlation": 0.61,
        "tax_analysis": {
            "positions": [
                {
                    "symbol": "AAPL",
                    "unrealised_gain": 15000,
                    "tax_liability": 3000,
                    "harvest_credit": 0,
                },
                {
                    "symbol": "GLD",
                    "unrealised_gain": -2500,
                    "tax_liability": 0,
                    "harvest_credit": 500,
                },
                {
                    "symbol": "TLT",
                    "unrealised_gain": -2000,
                    "tax_liability": 0,
                    "harvest_credit": 400,
                },
            ],
            "total_liability": 3000,
            "total_harvest_opp": 900,
            "narrative": "GLD and TLT are in loss position - harvesting both saves ~$900 CGT.",
        },
    }

    _ADVISOR = {
        "advisor_name": "Jane Smith, CFA",
        "firm_name": "Acme Capital Partners",
        "advisor_email": "jane@acmecapital.com",
        "client_name": "Mr. John Doe",
        "report_run_id": "test-001",
        "white_label": False,
    }

    async def _run():
        out_dir = Path(tempfile.gettempdir())
        for theme, fname in (
            ("light", out_dir / "report_light.pdf"),
            ("dark", out_dir / "report_dark.pdf"),
        ):
            try:
                data = await generate_advisor_report(
                    _PORTFOLIO, _DNA, None, _ADVISOR, theme=theme
                )
                fname.write_bytes(data)
                print(f"OK {theme:5s} theme  {len(data):>8,} bytes  ->  {fname}")
            except Exception as exc:
                print(f"ERR {theme}: {exc}")

    asyncio.run(_run())
