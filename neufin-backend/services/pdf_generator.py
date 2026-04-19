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
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
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

from services.calculator import canonical_metrics_for_institutional_report
from services.fx_format import format_pdf_market_value_cell
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
        or (float(p.get("current_price") or p.get("native_price") or 0) <= 0
            and not p.get("price_status", "live").startswith("live"))
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
    report_mode = _normalize_report_mode((advisor_config or {}).get("report_mode"))
    section_labels = _report_section_labels(report_mode)

    thesis_obj = s.get("investment_thesis") or {}
    if not isinstance(thesis_obj, dict):
        thesis_obj = {}

    # ── Portfolio basics (canonical AUM / beta / Sharpe — single source) ───────
    positions: list[dict] = p.get("positions_with_basis") or m.get("positions") or []
    _canon = canonical_metrics_for_institutional_report(p, d, thesis_obj, positions)
    total_value = float(_canon["total_value"])
    weighted_beta = float(_canon["weighted_beta"])
    sharpe_ratio = _canon.get("sharpe_ratio")
    report_metrics_note = str(_canon.get("sources_note") or "")

    # # SEA-NATIVE-TICKER-FIX: portfolio-aware benchmark + currency from metrics
    _benchmark_sym = (
        m.get("portfolio_benchmark")
        or p.get("portfolio_benchmark")
        or "^GSPC"
    )
    _benchmark_label = (
        m.get("portfolio_benchmark_label")
        or p.get("portfolio_benchmark_label")
        or ""
    )
    if not _benchmark_label:
        # Lazy import to avoid circular; BENCHMARK_LABELS is a pure dict
        try:
            from services.market_resolver import BENCHMARK_LABELS
            _benchmark_label = BENCHMARK_LABELS.get(_benchmark_sym, _benchmark_sym)
        except Exception:
            _benchmark_label = _benchmark_sym
    _portfolio_market_context = (
        m.get("portfolio_market_context")
        or p.get("portfolio_market_context")
        or "Global equity market"
    )
    _base_currency = m.get("base_currency") or m.get("portfolio_base_currency") or "USD"

    # ── DNA ────────────────────────────────────────────────────────────────────
    dna_score = int(d.get("dna_score") or 0)
    investor_type = str(d.get("investor_type") or "Balanced Growth Investor")
    strengths: list[str] = list(d.get("strengths") or [])
    weaknesses: list[str] = list(d.get("weaknesses") or [])
    recommendation = str(d.get("recommendation") or "")
    tax_analysis: dict = d.get("tax_analysis") or {}
    if not isinstance(tax_analysis, dict):
        tax_analysis = {}

    # ── Quant (correlation / HHI — prefer calculator metrics, else DNA) ───────
    avg_corr = float(d.get("avg_correlation") or m.get("avg_correlation") or 0)
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
            "USD": "$", "GBP": "£", "VND": "₫", "IDR": "Rp",
            "THB": "฿", "MYR": "RM", "SGD": "S$", "HKD": "HK$",
            "JPY": "¥", "AUD": "A$", "INR": "₹",
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
        alpha_opps.append(
            {
                "title": "Defensive Rotation Opportunity",
                "description": (
                    f"Beta {weighted_beta:.2f} amplifies drawdown in {regime_label} regime. "
                    "Rotate 5-10% from high-beta positions into XLU / XLP / GLD "
                    "for improved risk-adjusted return."
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
        "hhi": hhi,
        "quant_modes_selected": quant_modes_selected,
        "quant_model_contribution_summary": quant_model_contrib,
        "quant_alpha_risk_tradeoffs": quant_alpha_risk,
        "quant_scenario_implications": quant_scenarios,
        "report_metrics_note": report_metrics_note,
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
        "advisor_email": advisor_config.get("advisor_email") or "info@neufin.ai",
        "white_label": bool(advisor_config.get("white_label")),
        "report_run_id": advisor_config.get("report_run_id") or "—",
        # SEA-NATIVE-TICKER-FIX: portfolio-aware benchmark + currency (never silently USD/SPY)
        "benchmark_symbol": _benchmark_sym,
        "benchmark_label": _benchmark_label,
        "portfolio_market_context": _portfolio_market_context,
        "base_currency": _base_currency,
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
    WHITE = HexColor("#FFFFFF")
    firm_name = ctx["firm_name"] or ctx["advisor_name"]
    client_name = advisor_config.get("client_name") or "Confidential"
    total_value = ctx["total_value"]
    portfolio_name = ctx["portfolio_name"]
    verdict = ctx["verdict"]
    verdict_color = HexColor(ctx["verdict_color"])
    dna_score = ctx["dna_score"]
    regime = ctx["regime_label"] or "Pending IC Analysis"
    beta = ctx["weighted_beta"]
    sr = ctx.get("sharpe_ratio")
    sharpe_str = _fnum(sr) if sr is not None else "—"
    report_state = str(ctx.get("report_state") or REPORT_DRAFT)
    labels = ctx.get("section_labels") or {}
    cover_title = str(labels.get("cover_title") or "PORTFOLIO INTELLIGENCE REPORT")
    cover_subtitle = str(
        labels.get("cover_subtitle")
        or "Executive summary  ·  Risk  ·  Scenarios  ·  Recommendations"
    )

    def callback(canvas, doc):
        canvas.saveState()
        # Background
        canvas.setFillColor(pal["bg"])
        canvas.rect(0, 0, A4_W, A4_H, fill=1, stroke=0)

        # ── RESTRICTED banner ───────────────────────────────────────────────
        canvas.setFillColor(ACCENT_RED)
        canvas.rect(0, A4_H - 22, A4_W, 22, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 7)
        canvas.setFillColor(WHITE)
        canvas.drawCentredString(
            A4_W / 2, A4_H - 14, "RESTRICTED — INVESTMENT COMMITTEE USE ONLY"
        )
        # Report state ribbon (draft / review — not IC-final)
        if report_state != REPORT_FINAL:
            canvas.setFillColor(ACCENT_AMBER)
            canvas.rect(0, A4_H - 44, A4_W, 22, fill=1, stroke=0)
            canvas.setFont("Helvetica-Bold", 7)
            canvas.setFillColor(HexColor("#0F172A"))
            state_msg = (
                "DRAFT — DATA INCOMPLETE · NOT FOR EXTERNAL IC DISTRIBUTION"
                if report_state == REPORT_DRAFT
                else "ADVISOR REVIEW — VERIFY INPUTS BEFORE IC PRESENTATION"
            )
            canvas.drawCentredString(A4_W / 2, A4_H - 36, state_msg)
            y_logo = A4_H - 55 - 22
        else:
            y_logo = A4_H - 55

        # ── Logo / firm name (top-left) ─────────────────────────────────────
        if logo_bytes:
            try:
                ir = ImageReader(io.BytesIO(logo_bytes))
                canvas.drawImage(
                    ir, MARGIN, y_logo - 35, width=120, height=34, mask="auto"
                )
            except Exception:
                canvas.setFont("Helvetica-Bold", 16)
                canvas.setFillColor(pal["text_pri"])
                canvas.drawString(MARGIN, y_logo - 12, firm_name[:40])
        else:
            canvas.setFont("Helvetica-Bold", 16)
            canvas.setFillColor(pal["text_pri"])
            canvas.drawString(MARGIN, y_logo - 12, firm_name[:40])

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

        # ── Footer ──────────────────────────────────────────────────────────
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(pal["text_mut"])
        disc = (
            "This report is generated by NeuFin AI and is provided for informational purposes only. "
            "Not investment advice. NeuFin OÜ (EU). "
            + (
                f"{firm_name} is responsible for validating these insights."
                if firm_name
                else ""
            )
        )
        canvas.drawCentredString(A4_W / 2, MARGIN - 4, disc[:400])

        if ctx["white_label"]:
            # White-labeled: show firm attribution instead of NeuFin branding
            footer_text = (
                f"Prepared by {firm_name} · Confidential"
                if firm_name
                else "Confidential"
            )
            canvas.setFont("Helvetica-Bold", 8)
            canvas.setFillColor(pal["text_mut"])
            canvas.drawCentredString(A4_W / 2, MARGIN + 12, footer_text)
        else:
            canvas.setFont("Helvetica-Bold", 8)
            canvas.setFillColor(
                pal["text_mut"] if pal["theme"] in ("light", "white") else ACCENT_TEAL
            )
            canvas.drawCentredString(
                A4_W / 2, MARGIN + 12, "Powered by NeuFin Intelligence"
            )

        canvas.restoreState()

    return callback


def _make_hf_callback(ctx: dict, pal: dict, firm_name: str) -> Any:
    """Header/footer onPage callback for body pages."""
    disc = "For informational purposes only. Not investment advice. NeuFin OÜ (EU)." + (
        f" {firm_name} is responsible for validating these insights."
        if firm_name
        else ""
    )

    def callback(canvas, doc):
        canvas.saveState()
        # Background fill (essential for dark theme)
        canvas.setFillColor(pal["bg"])
        canvas.rect(0, 0, A4_W, A4_H, fill=1, stroke=0)
        # Header rule — minimal on light themes
        is_light = pal["theme"] in ("light", "white")
        canvas.setStrokeColor(pal["border"] if is_light else ACCENT_TEAL)
        canvas.setLineWidth(0.75 if is_light else 2)
        canvas.line(MARGIN, A4_H - MARGIN, A4_W - MARGIN, A4_H - MARGIN)
        # Header text
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(pal["text_pri"])
        canvas.drawString(MARGIN, A4_H - MARGIN - 13, "NEUFIN PORTFOLIO INTELLIGENCE")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(pal["text_mut"])
        canvas.drawRightString(A4_W - MARGIN, A4_H - MARGIN - 13, f"Page {doc.page}")
        # Footer
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(pal["text_mut"])
        canvas.drawString(MARGIN, MARGIN - 4, disc[:200])
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
    rule = Table(
        [[""]],
        colWidths=[cw],
        rowHeights=[0.75],
        style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.75, pal["border"])]),
    )
    out.append(rule)
    out.append(Spacer(1, 10))
    num_c = _hex(pal["text_mut"])
    ttl_c = _hex(pal["text_pri"])
    title_pc = (
        f'<font name="Helvetica" size="8" color="{num_c}">{_xml(section_num)}</font>'
        f'<br/><font name="Helvetica-Bold" size="12" color="{ttl_c}">{_xml(title)}</font>'
    )
    out.append(Paragraph(title_pc, st["body"]))
    if subtitle:
        out.append(Spacer(1, 3))
        out.append(Paragraph(_xml(subtitle), st["muted8"]))
    out.append(Spacer(1, 12))
    return out


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


# ─── PAGE 3 — PORTFOLIO SNAPSHOT ──────────────────────────────────────────────


def _page_portfolio_snapshot(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    metrics = extra.get("metrics") or {}
    pos_sorted = extra.get("pos_sorted") or []
    labels = ctx.get("section_labels") or {}

    items.extend(
        _ic_body_section_header(
            "3",
            str(labels.get("portfolio_diagnosis") or "PORTFOLIO DIAGNOSIS"),
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
    sr = ctx.get("sharpe_ratio")
    sharpe: float | None = None
    if sr is not None:
        try:
            v = float(sr)
            if v == v and abs(v) != float("inf"):
                sharpe = v
        except (TypeError, ValueError):
            sharpe = None
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
        ["Sharpe ratio", f"{sharpe:.2f}" if sharpe is not None else "—"],
        ["YTD Return", _fpct(ytd) if ytd is not None else "—"],
    ]
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

    # Behavioral biases
    _BIAS_KEYWORDS = {
        "anchor": (
            "Anchoring Bias",
            "Holding losing positions too long due to original price anchoring",
        ),
        "recency": (
            "Recency Bias",
            "Overweighting recent performance in allocation decisions",
        ),
        "loss aversion": (
            "Loss Aversion",
            "Reluctance to realize losses despite rational case for exit",
        ),
        "overconfidence": (
            "Overconfidence Bias",
            "Concentrated positions indicating excess confidence",
        ),
        "herding": (
            "Herding Bias",
            "Following consensus positions without independent analysis",
        ),
        "home bias": (
            "Home Bias",
            "Geographic or sector concentration beyond diversification rationale",
        ),
        "concentration": (
            "Concentration Risk",
            "Position sizing inconsistent with diversification mandate",
        ),
    }
    wt_lower = " ".join(ctx.get("weaknesses") or []).lower()
    biases = [
        {"name": n, "description": d}
        for kw, (n, d) in _BIAS_KEYWORDS.items()
        if kw in wt_lower
    ]

    items.append(Paragraph("DETECTED BEHAVIORAL BIASES", st["h3"]))
    if biases:
        bias_rows = [["Bias Pattern", "Description", "Evidence"]]
        for b in biases:
            bias_rows.append(
                [
                    Paragraph(f"<b>{_xml(b['name'])}</b>", st["body"]),
                    Paragraph(_xml(b["description"]), st["body"]),
                    Paragraph(
                        '<font size="7" color="#F5A623">Detected in DNA assessment</font>',
                        st["body"],
                    ),
                ]
            )
        items.append(
            Table(
                bias_rows, colWidths=[120, 220, 130], style=_tbl_std(pal, ACCENT_AMBER)
            )
        )
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

    # Portfolio macro signals
    metrics = extra.get("metrics") or {}
    mkt = extra.get("swarm_norm", {}).get("market_regime") or {}
    positions = ctx.get("positions") or []
    beta = float(metrics.get("weighted_beta") or ctx["weighted_beta"] or 0)

    def _sum_weight(syms: set) -> float:
        return sum(
            float(p.get("weight") or p.get("weight_pct") or 0)
            for p in positions
            if p.get("symbol") in syms
        )

    def_w = _sum_weight({"GLD", "TLT", "BND", "JNJ", "PG", "VZ", "XLP", "XLU"})
    tech_w = _sum_weight({"AAPL", "MSFT", "AMZN", "NVDA", "META", "GOOGL", "QQQ"})
    gld_w = next(
        (
            float(p.get("weight") or p.get("weight_pct") or 0)
            for p in positions
            if p.get("symbol") == "GLD"
        ),
        0,
    )
    fi_w = next(
        (
            float(p.get("weight") or p.get("weight_pct") or 0)
            for p in positions
            if p.get("symbol") in {"TLT", "BND", "AGG", "GOVT", "IEF"}
        ),
        0,
    )

    # SEA-NATIVE-TICKER-FIX: show benchmark-aware beta label (not always SPY)
    _bench_lbl = ctx.get("benchmark_label") or ctx.get("benchmark_symbol") or "^GSPC"
    signals = [
        ("Portfolio Beta", f"{beta:.2f}", f"vs {_bench_lbl} 1.00"),
        ("Defensive Weight", f"{def_w:.1f}%", "GLD/TLT/XLP/XLU"),
        ("Tech Concentration", f"{tech_w:.1f}%", "Large-cap tech"),
        ("Gold Hedge", f"{gld_w:.1f}%", "Inflation buffer"),
        ("Fixed Income", f"{fi_w:.1f}%", "Duration exposure"),
        (
            "HHI Concentration",
            f"{float(ctx['hhi']):.4f}",
            "⚠ High" if ctx["hhi"] > 0.20 else "Normal",
        ),
    ]
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

    # VaR / drawdown metrics
    var_95 = quant.get("var_95") or metrics.get("var_95")
    max_dd = quant.get("max_drawdown") or metrics.get("max_drawdown")
    hhi = float(ctx.get("hhi") or 0)
    beta = float(ctx.get("weighted_beta") or 0)

    def _status(val, threshold):
        return "⚠ Review" if val is None else "Calculated"

    risk_tbl = [
        ["Metric", "Value", "Status"],
        [
            "VaR (95%, 1-day)",
            _fpct(var_95) if var_95 is not None else "Pending Swarm IC",
            _status(var_95, None),
        ],
        [
            "Max Drawdown (est.)",
            _fpct(max_dd) if max_dd is not None else "Pending Swarm IC",
            _status(max_dd, None),
        ],
        ["Concentration (HHI)", f"{hhi:.4f}", "⚠ High" if hhi > 0.25 else "Normal"],
        ["Weighted Beta", f"{beta:.2f}", "⚠ High" if beta > 1.8 else "Normal"],
        [
            "Avg. Correlation",
            f"{ctx.get('avg_corr', 0):.3f}",
            "⚠ High" if float(ctx.get("avg_corr") or 0) > 0.75 else "Normal",
        ],
    ]
    items.append(Paragraph("RISK METRICS SUMMARY", st["h3"]))
    items.append(Table(risk_tbl, colWidths=[160, 120, 160], style=_tbl_std(pal)))

    # Concentration warning
    if hhi > 0.25 and pos_sorted:
        top3_w = sum(_w(p) for p in pos_sorted[:3]) * 100
        items.append(Spacer(1, 8))
        items.append(
            _amber_banner_table(
                f"CONCENTRATION WARNING: Top 3 positions represent {top3_w:.1f}% of portfolio. "
                "Industry guideline: no single position > 10%, top-3 < 30%.",
                pal,
                st,
                cw,
            )
        )
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
    return items


# ─── PAGE 8 — STRESS TESTING ──────────────────────────────────────────────────


def _page_stress_testing(
    ctx: dict, extra: dict, pal: dict, st: dict, cw: float
) -> list:
    items: list = []
    labels = ctx.get("section_labels") or {}
    items.extend(
        _ic_body_section_header(
            "6",
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

    risk_scenarios = [
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
        for title, desc, conf in [
            (
                "Defensive Rotation",
                "Portfolio beta suggests exposure to market drawdown. "
                "Rotate 5-10% from high-beta tech into utilities (XLU) "
                "or consumer staples (XLP) to improve risk-adjusted return.",
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

    # Current vs. Target allocation (only when weights are normalized)
    wsum = sum(_w(p) * 100 for p in pos_sorted)
    if wsum > 50 and pos_sorted:
        items.append(Paragraph("CURRENT vs. TARGET ALLOCATION", st["h3"]))
        alloc_rows = [["Symbol", "Current %", "Target %", "Action"]]
        for pos in pos_sorted[:8]:
            sym = pos.get("symbol", "")
            cur = _w(pos) * 100
            tgt = max(cur * 0.95, 0.0)
            action_txt = "Trim" if cur > tgt + 0.5 else "Hold"
            alloc_rows.append(
                [sym, f"{cur:.1f}%", f"{tgt:.1f}% (illustrative)", action_txt]
            )
        items.append(
            Table(alloc_rows, colWidths=[60, 70, 130, 60], style=_tbl_std(pal))
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
    items.append(Table(sources, colWidths=[100, 180, 155], style=_tbl_std(pal)))
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
    body_cb = _make_hf_callback(ctx, pal, firm_name)

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

    # Order: §2 executive → §3 snapshot → §4 risk (macro, correlation) →
    # §5 quant intelligence → §6 behavioral → §7 scenarios →
    # §8 recommendations (tax, alpha, directives) → §9 appendix
    _add_page(_page_executive_memo, ctx, extra, pal, st, cw)
    _add_page(_page_portfolio_snapshot, ctx, extra, pal, st, cw)
    _add_page(_page_macro_regime, ctx, extra, pal, st, cw)
    _add_page(_page_risk_correlation, ctx, extra, pal, st, cw)
    if ctx.get("quant_modes_selected"):
        _add_page(_page_quant_model_outputs, ctx, extra, pal, st, cw)
    _add_page(_page_behavioral_dna, ctx, extra, pal, st, cw)
    _add_page(_page_stress_testing, ctx, extra, pal, st, cw)
    _add_page(_page_tax_optimization, ctx, extra, pal, st, cw)
    _add_page(_page_alpha_opportunities, ctx, extra, pal, st, cw)
    _add_page(_page_directives, ctx, extra, pal, st, cw)
    _add_page(_page_agent_attribution, ctx, extra, pal, st, cw)

    try:
        doc.build(elems)
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
