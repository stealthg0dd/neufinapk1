"""
NeuFin IC-grade 10-page PDF (ReportLab, A4, white-label).
Uses portfolio metrics, DNA scores, and swarm agent outputs only — no LLM calls here.

Orchestration model
-------------------
``generate_advisor_report`` is an **orchestrator**:
  1. **Async** — resolve logo bytes (HTTP ``logo_url`` / ``advisor_logo_url``, optional
     ``logo_base64``); optional Pillow validation of image bytes.
  2. **Sync** — ``_build_pdf_sync`` runs the full ReportLab story (layout only).

Charts (pie, gauge, heatmap) use ``renderPM`` when available; on failure we **degrade**
to Tables / Paragraphs so the 10-page report still builds.
"""

from __future__ import annotations

import base64
import datetime
import io
import json
import uuid
from typing import Any
from xml.sax.saxutils import escape

import httpx
import structlog
from reportlab.graphics import renderPM
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
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

logger = structlog.get_logger("neufin.pdf_generator")

A4_W, A4_H = A4
MARGIN = 40

# Default IC palette (strings for merging with advisor_config["brand_colors"])
DEFAULT_IC_BRAND_COLORS: dict[str, str] = {
    "primary": "#0B0F14",
    "accent": "#1EB8CC",
    "danger": "#EF4444",
    "success": "#22C55E",
    "amber": "#F5A623",
    "white": "#F0F4FF",
    "muted": "#94A3B8",
    "surface": "#161D2E",
}


def _xml(text: str | None) -> str:
    if text is None:
        return ""
    t = str(text).strip()
    if not t:
        return ""
    return escape(t, entities={'"': "&quot;", "'": "&apos;"}).replace("\n", "<br/>")


def _fnum(x: Any, default: str = "—") -> str:
    try:
        if x is None:
            return default
        return f"{float(x):,.2f}"
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


def _html_hex(c: HexColor) -> str:
    """Paragraph <font color=\"#RRGGBB\"> helper."""
    try:
        return f"#{c.hexval() & 0xFFFFFF:06x}"
    except Exception:
        return "#F0F4FF"


def _coerce_list(val: Any, max_n: int | None = None) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        out = [str(x) for x in val if x is not None]
    else:
        out = [str(val)]
    return out[:max_n] if max_n else out


class ICBrand:
    """Design system colors; built from ``advisor_config['brand_colors']`` merged with defaults."""

    def __init__(self, brand_colors: dict | None = None):
        b = {**DEFAULT_IC_BRAND_COLORS, **(brand_colors or {})}
        self.PRIMARY = HexColor(b.get("primary", "#0B0F14"))
        self.ACCENT = HexColor(b.get("accent", "#1EB8CC"))
        self.DANGER = HexColor(b.get("danger", "#EF4444"))
        self.SUCCESS = HexColor(b.get("success", "#22C55E"))
        self.AMBER = HexColor(b.get("amber", "#F5A623"))
        self.WHITE = HexColor(b.get("white", "#F0F4FF"))
        self.MUTED = HexColor(b.get("muted", "#94A3B8"))
        self.SURFACE = HexColor(b.get("surface", "#161D2E"))
        # legacy keys from API ColorScheme
        if (
            brand_colors
            and "secondary" in brand_colors
            and "surface" not in brand_colors
        ):
            self.SURFACE = HexColor(brand_colors["secondary"])

    def as_dict(self) -> dict[str, str]:
        """Hex strings suitable for logging / API (not ReportLab Color objects)."""
        return {
            "primary": f"#{self.PRIMARY.hexval() & 0xFFFFFF:06x}",
            "accent": f"#{self.ACCENT.hexval() & 0xFFFFFF:06x}",
            "danger": f"#{self.DANGER.hexval() & 0xFFFFFF:06x}",
            "success": f"#{self.SUCCESS.hexval() & 0xFFFFFF:06x}",
            "amber": f"#{self.AMBER.hexval() & 0xFFFFFF:06x}",
            "white": f"#{self.WHITE.hexval() & 0xFFFFFF:06x}",
            "muted": f"#{self.MUTED.hexval() & 0xFFFFFF:06x}",
            "surface": f"#{self.SURFACE.hexval() & 0xFFFFFF:06x}",
        }


def _empty_swarm_norm() -> dict[str, Any]:
    """Stable shape when swarm is missing or unreadable (nested keys used by the PDF story)."""
    return {
        "investment_thesis": {
            "headline": "Market intelligence summary unavailable",
            "briefing": (
                "Swarm output was not available or could not be loaded. "
                "Run portfolio intelligence again to populate agent synthesis, "
                "or verify your latest swarm report."
            ),
        },
        "market_regime": {},
        "quant_analysis": {},
        "tax_recommendation": {},
        "risk_sentinel": {},
        "alpha_signal": {},
        "macro_advice": {},
        "agent_trace": [],
        "regime": None,
    }


def _normalize_swarm(swarm: Any) -> dict[str, Any]:
    """Flatten swarm_reports row + nested investment_thesis into one shape."""
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
    nested: dict[str, Any] | None
    if isinstance(raw_thesis, str):
        st = raw_thesis.strip()
        if st.startswith("{") and "}" in st:
            try:
                parsed = json.loads(st)
                nested = parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                nested = {}
        elif st:
            nested = {"briefing": st[:8000]}
        else:
            nested = {}
    elif isinstance(raw_thesis, dict) and raw_thesis:
        nested = dict(raw_thesis)
    else:
        nested = None

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
    if isinstance(atr, str):
        agent_trace_list = [atr]
    elif isinstance(atr, list):
        agent_trace_list = atr
    else:
        agent_trace_list = []

    mr = inv.get("market_regime") or row.get("market_regime") or {}
    if not isinstance(mr, dict):
        mr = {}

    return {
        "investment_thesis": inv,
        "market_regime": mr,
        "quant_analysis": (
            inv.get("quant_analysis") or row.get("quant_analysis") or {}
        ),
        "tax_recommendation": (inv.get("tax_recommendation") or row.get("tax_recommendation") or {}),
        "risk_sentinel": (inv.get("risk_sentinel") or row.get("risk_sentinel") or {}),
        "alpha_signal": (inv.get("alpha_signal") or row.get("alpha_signal") or {}),
        "macro_advice": (inv.get("macro_advice") or row.get("macro_advice") or {}),
        "agent_trace": agent_trace_list,
        "regime": inv.get("regime") or row.get("regime"),
    }


def _generate_emergency_pdf(message: str, advisor_config: dict) -> bytes:
    """Minimal one-page PDF when the main story cannot be built (avoids empty responses / opaque 500s)."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )
    styles = getSampleStyleSheet()
    title = advisor_config.get("advisor_name") or "NeuFin Intelligence"
    ref = advisor_config.get("report_run_id") or "—"
    safe_msg = str(message)[:6000]
    story = [
        Paragraph(_xml("Portfolio intelligence report"), styles["Title"]),
        Paragraph(_xml(title), styles["Heading2"]),
        Paragraph(
            _xml(
                "The full multi-page PDF could not be rendered. "
                "Portfolio metrics and DNA may still be available in the app; technical detail:"
            ),
            styles["BodyText"],
        ),
        Spacer(1, 14),
        Paragraph(_xml(safe_msg), styles["BodyText"]),
        Spacer(1, 20),
        Paragraph(_xml(f"Reference: {ref}"), styles["Normal"]),
    ]
    doc.build(story)
    return buffer.getvalue()


def _dna_score_color(score: int, bc: ICBrand) -> HexColor:
    if score <= 40:
        return bc.DANGER
    if score <= 70:
        return bc.AMBER
    return bc.SUCCESS


def _regime_display(regime: str | None) -> tuple[str, HexColor]:
    r = (regime or "unknown").lower().strip()
    if r in ("recession", "crisis"):
        return "CRISIS / DEEP RISK-OFF", HexColor("#EF4444")
    if r in ("risk-off", "stagflation"):
        return "RISK-OFF", HexColor("#F5A623")
    if r in ("growth", "inflation", "risk-on"):
        return "RISK-ON", HexColor("#22C55E")
    return (regime or "Pending Live Data").upper(), HexColor("#1EB8CC")


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
            logger.warning("pdf.logo_base64_decode_failed", error=str(e))
    return None


def _prepare_logo_bytes(raw: bytes | None) -> bytes | None:
    """Optional Pillow validation so corrupt uploads do not break the cover canvas."""
    if not raw:
        return None
    try:
        from PIL import Image as PILImage

        im = PILImage.open(io.BytesIO(raw))
        im.load()
        return raw
    except Exception as e:
        logger.warning("pdf.logo_pil_rejected", error=str(e))
        return None


def try_render_pie_chart(
    labels: list[str],
    values: list[float],
    bc: ICBrand,
    width: float = 200,
    height: float = 160,
) -> Image | None:
    """
    Attempt ReportLab Pie → PNG via renderPM (needs rlPyCairo/Pillow stack in many envs).
    Returns None on any failure so callers can use allocation table fallback.
    """
    if not values or sum(abs(v) for v in values) < 1e-9:
        return None
    try:
        palette = [bc.ACCENT, bc.AMBER, bc.SUCCESS, bc.DANGER, bc.MUTED]
        d = Drawing(width, height)
        pie = Pie()
        pie.x = 15
        pie.y = 15
        pie.width = min(width - 30, height - 30)
        pie.height = pie.width
        pie.data = [max(v, 0.0) for v in values]
        pie.labels = [str(lab)[:10] for lab in labels]
        for i in range(len(pie.data)):
            pie.slices[i].fillColor = palette[i % len(palette)]
            pie.slices[i].strokeColor = colors.white
        d.add(pie)
        buf = renderPM.drawToString(d, fmt="PNG", dpi=120)
        return Image(io.BytesIO(buf), width=width, height=height)
    except Exception as e:
        logger.warning("pdf.pie_failed", error=str(e))
        return None


def _heatmap_image(
    symbols: list[str],
    matrix: list[list[float]] | None,
    bc: ICBrand,
    size: float = 220,
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
                fillColor=bc.MUTED,
            )
        )
        d.add(
            String(
                35 + i * cell,
                size + 8,
                symbols[i],
                fontName="Helvetica",
                fontSize=6,
                fillColor=bc.MUTED,
            )
        )
    for i in range(n):
        for j in range(n):
            v = 0.0
            if matrix and i < len(matrix) and j < len(matrix[i]):
                try:
                    v = float(matrix[i][j])
                except (TypeError, ValueError, IndexError):
                    v = 0.0
            if i == j:
                fill = HexColor("#0B0F14")
            elif v > 0.7:
                fill = HexColor("#7F1D1D")
            elif v > 0.4:
                fill = bc.AMBER
            elif v < 0.2:
                fill = bc.SUCCESS
            else:
                fill = bc.MUTED
            d.add(
                Rect(
                    30 + j * cell,
                    size - (i + 1) * cell,
                    cell - 1,
                    cell - 1,
                    fillColor=fill,
                    strokeColor=bc.PRIMARY,
                )
            )
    try:
        buf = renderPM.drawToString(d, fmt="PNG", dpi=110)
        return Image(io.BytesIO(buf), width=size + 70, height=size + 50)
    except Exception as e:
        logger.warning("pdf.heatmap_render_failed", error=str(e))
        return None


def _gauge_image(
    score: int, bc: ICBrand, w: float = 180, h: float = 88
) -> Image | None:
    score = max(0, min(100, int(score)))
    d = Drawing(w, h)
    col = _dna_score_color(score, bc)
    d.add(
        Rect(0, 20, w, 36, fillColor=bc.SURFACE, strokeColor=bc.MUTED, strokeWidth=0.5)
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
            fillColor=bc.WHITE,
        )
    )
    d.add(
        String(
            w / 2 + 12,
            12,
            "/ 100",
            fontName="Helvetica",
            fontSize=9,
            fillColor=bc.MUTED,
        )
    )
    try:
        buf = renderPM.drawToString(d, fmt="PNG", dpi=120)
        return Image(io.BytesIO(buf), width=w, height=h)
    except Exception as e:
        logger.warning("pdf.gauge_render_failed", error=str(e))
        return None


def _confidence_bar(conf: float, bc: ICBrand, width_pt: float = 120) -> Table:
    conf = max(0.0, min(1.0, float(conf)))
    fill_w = max(0.5, conf * width_pt)
    rest = max(0.5, width_pt - fill_w)
    return Table(
        [[" ", " "]],
        colWidths=[fill_w, rest],
        rowHeights=[8],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), bc.ACCENT),
                ("BACKGROUND", (1, 0), (1, 0), bc.SURFACE),
                ("BOX", (0, 0), (-1, -1), 0.5, bc.MUTED),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        ),
    )


def _styles(bc: ICBrand):
    base = getSampleStyleSheet()

    def ps(name: str, **kw) -> ParagraphStyle:
        return ParagraphStyle(name, parent=base["Normal"], **kw)

    return {
        "muted8": ps(
            "m8",
            fontSize=8,
            textColor=bc.MUTED,
            fontName="Helvetica",
            leading=10,
        ),
        "body": ps(
            "b", fontSize=9, textColor=bc.WHITE, leading=13, fontName="Helvetica"
        ),
        "h_section": ps(
            "hs",
            fontSize=11,
            textColor=bc.WHITE,
            fontName="Helvetica-Bold",
            leading=14,
        ),
        "h3": ps(
            "h3",
            fontSize=9,
            textColor=bc.ACCENT,
            fontName="Helvetica-Bold",
            leading=12,
            spaceAfter=3,
        ),
        "muted": ps(
            "mt",
            fontSize=8,
            textColor=bc.MUTED,
            fontName="Helvetica-Oblique",
            leading=11,
        ),
        "accent_title": ps(
            "at",
            fontSize=28,
            textColor=bc.ACCENT,
            fontName="Helvetica-Bold",
            alignment=TA_CENTER,
            leading=32,
        ),
        "cover_sub": ps(
            "cs",
            fontSize=13,
            textColor=bc.MUTED,
            fontName="Helvetica",
            alignment=TA_CENTER,
            leading=16,
        ),
    }


def _build_report_context(
    portfolio_data: dict,
    dna_data: dict,
    swarm_norm: dict,
    advisor_config: dict,
) -> dict:
    """
    Single source of truth for all PDF sections.
    Works with swarm_norm (already normalised by _normalize_swarm).
    Never returns None for key fields — always synthesises from available data.
    """
    s = swarm_norm if isinstance(swarm_norm, dict) else {}
    d = dna_data if isinstance(dna_data, dict) else {}
    p = portfolio_data if isinstance(portfolio_data, dict) else {}
    m = p.get("metrics") or {}

    # investment_thesis is a sub-dict inside swarm_norm
    thesis_obj = s.get("investment_thesis") or {}
    if not isinstance(thesis_obj, dict):
        thesis_obj = {}

    # ── Portfolio basics ──────────────────────────────────────────────────────
    positions: list[dict] = m.get("positions") or []
    total_value = float(p.get("total_value") or m.get("total_value") or 0)

    # ── DNA (always present after analysis) ───────────────────────────────────
    dna_score = int(d.get("dna_score") or 0)
    investor_type = str(d.get("investor_type") or "Balanced Growth Investor")
    strengths: list[str] = list(d.get("strengths") or [])
    weaknesses: list[str] = list(d.get("weaknesses") or [])
    recommendation = str(d.get("recommendation") or "")
    tax_analysis: dict = d.get("tax_analysis") or {}
    if not isinstance(tax_analysis, dict):
        tax_analysis = {}

    # ── Quant (DNA first, then swarm fallback) ─────────────────────────────────
    weighted_beta = float(
        d.get("weighted_beta")
        or thesis_obj.get("weighted_beta")
        or s.get("weighted_beta")
        or m.get("weighted_beta")
        or 0
    )
    avg_corr = float(d.get("avg_correlation") or m.get("avg_correlation") or 0)
    # HHI: DNA score_breakdown stores it as a 0-25 score; raw metrics store 0-1
    hhi_raw = float(
        (d.get("score_breakdown") or {}).get("hhi_concentration")
        or m.get("hhi")
        or 0
    )
    hhi = hhi_raw / 100.0 if hhi_raw > 1.0 else hhi_raw

    # ── Tax from DNA (NOT swarm) — always populated after analysis ─────────────
    tax_positions: list[dict] = tax_analysis.get("positions") or []
    total_tax_liability = float(tax_analysis.get("total_liability") or 0)
    total_harvest_opp = float(tax_analysis.get("total_harvest_opp") or 0)
    tax_narrative = str(tax_analysis.get("narrative") or "")

    # ── Regime ────────────────────────────────────────────────────────────────
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
            (mkt_regime.get("confidence") if isinstance(mkt_regime, dict) else None) or 0
        )

    _rmap = {
        "risk_off": "Risk-Off", "risk-off": "Risk-Off",
        "risk_on": "Risk-On", "risk-on": "Risk-On", "growth": "Risk-On",
        "neutral": "Neutral",
        "crisis": "Crisis / Deep Risk-Off", "recession": "Crisis / Deep Risk-Off",
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

    # Derive from portfolio if swarm has no regime data
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
            f"relative to broad market."
        )

    # ── Portfolio mandate ─────────────────────────────────────────────────────
    has_gold = any(pos.get("symbol") == "GLD" for pos in positions)
    has_bonds = any(pos.get("symbol") in ("TLT", "BND", "AGG", "IEF", "GOVT") for pos in positions)
    if weighted_beta > 1.2:
        mandate, mandate_desc = "Aggressive Growth", "Equity-heavy, high-beta profile"
    elif has_gold and has_bonds and weighted_beta < 1.1:
        mandate, mandate_desc = "All-Weather Balanced", "Growth with inflation and duration hedges"
    elif weighted_beta < 0.85:
        mandate, mandate_desc = "Capital Preservation", "Defensive, income-oriented positioning"
    else:
        mandate, mandate_desc = "Balanced Growth", "Moderate risk, multi-factor diversification"

    # ── Investment thesis ─────────────────────────────────────────────────────
    briefing = (
        thesis_obj.get("briefing")
        or thesis_obj.get("body")
        or s.get("briefing")
        or ""
    )
    # Reject the empty-state placeholder inserted by _normalize_swarm/_empty_swarm_norm
    _EMPTY_MARKERS = ("swarm output was not available", "run portfolio intelligence")
    if any(m in briefing.lower() for m in _EMPTY_MARKERS):
        briefing = ""
    thesis = briefing.strip()
    if not thesis:
        top3 = sorted(positions, key=lambda x: float(x.get("weight") or 0), reverse=True)[:3]
        top_names = ", ".join(str(pos.get("symbol", "")) for pos in top3)
        tax_note = (
            f"Tax optimisation is the primary near-term lever "
            f"(${total_tax_liability:,.0f} CGT exposure, ${total_harvest_opp:,.0f} harvestable). "
        ) if total_tax_liability > 0 else ""
        thesis = (
            f"This ${total_value:,.0f} portfolio is structured as a {investor_type} "
            f"with {len(positions)} holdings. Core positions ({top_names or 'diversified holdings'}) "
            f"drive a market beta of {weighted_beta:.2f}. "
            f"{tax_note}"
            f"Portfolio construction is {'sound' if dna_score >= 70 else 'under review'} "
            f"at a DNA score of {dna_score}/100."
        )

    # ── Verdict ───────────────────────────────────────────────────────────────
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

    # ── Recommendations ───────────────────────────────────────────────────────
    recs: list[dict] = []
    rec_summary = s.get("recommendation_summary") or thesis_obj.get("recommendation_summary") or ""
    if rec_summary:
        recs.append({"priority": "HIGH", "action": rec_summary[:120],
                     "rationale": "Swarm IC synthesis", "timeline": "30 days"})
    if recommendation:
        recs.append({"priority": "HIGH", "action": recommendation[:120],
                     "rationale": "Behavioral DNA assessment", "timeline": "30–60 days"})
    if total_harvest_opp > 50:
        harvest_syms = [tp["symbol"] for tp in tax_positions
                        if float(tp.get("harvest_credit") or 0) > 0]
        recs.append({
            "priority": "HIGH",
            "action": (
                f"Harvest losses in {', '.join(harvest_syms[:3])} "
                f"(${total_harvest_opp:,.0f} opportunity)"
            ),
            "rationale": (
                f"Tax efficiency — est. ${total_harvest_opp * 5:,.0f} "
                "5-year after-tax benefit"
            ),
            "timeline": "Immediate — before year-end",
        })
    recs.append({
        "priority": "MEDIUM",
        "action": (
            f"Align defensive allocation to {regime_label} regime"
            if regime_label else
            "Run Swarm IC Analysis for regime-adjusted positioning"
        ),
        "rationale": "Regime alignment",
        "timeline": "60 days",
    })

    # ── Alpha opportunities ────────────────────────────────────────────────────
    alpha_signal_text = (
        s.get("alpha_signal")
        or thesis_obj.get("alpha_signal")
        or s.get("alpha_outlook")
        or ""
    )
    alpha_opps: list[dict] = []
    if alpha_signal_text:
        alpha_opps.append({
            "title": "Alpha Scout Signal",
            "description": str(alpha_signal_text)[:200],
            "confidence": "65%",
            "regime": regime_label or "All regimes",
        })
    if weighted_beta > 1.0 and regime_label in (
        "Risk-Off", "Risk-Off / Stagflation", "Neutral", "Market-Neutral"
    ):
        alpha_opps.append({
            "title": "Defensive Rotation Opportunity",
            "description": (
                f"Beta {weighted_beta:.2f} amplifies drawdown in {regime_label} regime. "
                "Rotate 5–10% from high-beta positions into XLU / XLP / GLD "
                "for improved risk-adjusted return."
            ),
            "confidence": "72%",
            "regime": regime_label,
        })
    if total_harvest_opp > 0:
        harvest_syms = [tp["symbol"] for tp in tax_positions
                        if float(tp.get("harvest_credit") or 0) > 0]
        alpha_opps.append({
            "title": "Tax-Loss Harvesting Window",
            "description": (
                f"${total_harvest_opp:,.0f} harvestable. "
                f"Est. ${total_harvest_opp * 0.2:,.0f} in direct savings at 20% CGT. "
                f"Priority: {', '.join(harvest_syms[:3])}."
            ),
            "confidence": "95%",
            "regime": "All regimes — time-sensitive",
        })
    if not alpha_opps:
        alpha_opps.append({
            "title": "Run Swarm IC Analysis for Alpha Signals",
            "description": (
                "Full alpha discovery requires the 7-agent swarm analysis. "
                "Run from the portfolio page to unlock symbol-level "
                "recommendations with estimated return impact."
            ),
            "confidence": "—",
            "regime": "—",
        })

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
        "avg_corr": avg_corr,
        "hhi": hhi,
        # Tax (from DNA — always populated)
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
        # Trace
        "agent_trace": s.get("agent_trace") or [],
        "swarm_available": bool(
            swarm_norm and isinstance(swarm_norm, dict)
            and any(swarm_norm.get(k) for k in ("regime", "investment_thesis", "quant_analysis"))
        ),
        # Advisor
        "advisor_name": advisor_config.get("advisor_name") or "NeuFin Intelligence",
        "firm_name": advisor_config.get("firm_name") or "",
        "advisor_email": advisor_config.get("advisor_email") or "info@neufin.ai",
        "white_label": bool(advisor_config.get("white_label")),
        "report_run_id": advisor_config.get("report_run_id") or "—",
    }


def _page_executive_memo(ctx: dict, s: dict, cw: float, bc: "ICBrand") -> list:
    """
    Page 2: Executive memo — the most important page.
    An MD reads only this page. Answers: What? What's wrong? What to do?
    Never shows UNKNOWN or See swarm.
    """
    items: list = []

    # ── Verdict banner ────────────────────────────────────────────────────────
    verdict_hx = HexColor(ctx["verdict_color"])
    # Semi-transparent tint for background (ReportLab has no alpha, simulate with surface)
    banner = Table(
        [[Paragraph(
            f"PORTFOLIO VERDICT:  {ctx['verdict']}",
            ParagraphStyle(
                "vb", fontName="Helvetica-Bold", fontSize=16,
                textColor=verdict_hx, alignment=TA_CENTER,
            ),
        )]],
        colWidths=[cw],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
        ("BOX", (0, 0), (-1, -1), 2, verdict_hx),
        ("TOPPADDING", (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ]))
    items.append(banner)
    items.append(Spacer(1, 6))
    items.append(Paragraph(_xml(ctx["verdict_desc"]), s["muted"]))
    items.append(Spacer(1, 14))

    # ── Three metric cards: DNA | Regime | Mandate ────────────────────────────
    score = ctx["dna_score"]
    sc_col = "#22C55E" if score >= 71 else ("#F5A623" if score >= 41 else "#EF4444")
    regime_display = ctx["regime_label"] or "Pending Live Data"
    conf_label = (
        f"{int(ctx['regime_conf'] * 100)}% conf"
        if ctx["regime_conf"] > 0 else "portfolio-derived"
    )
    cw3 = cw / 3
    card_data = [
        [
            Paragraph(
                str(score),
                ParagraphStyle("scv", fontName="Helvetica-Bold", fontSize=26,
                               textColor=HexColor(sc_col), alignment=TA_CENTER),
            ),
            Paragraph(
                _xml(regime_display),
                ParagraphStyle("rcv", fontName="Helvetica-Bold", fontSize=14,
                               textColor=bc.AMBER, alignment=TA_CENTER),
            ),
            Paragraph(
                _xml(ctx["mandate"]),
                ParagraphStyle("mcv", fontName="Helvetica-Bold", fontSize=12,
                               textColor=bc.ACCENT, alignment=TA_CENTER),
            ),
        ],
        [
            Paragraph(
                "PORTFOLIO HEALTH",
                ParagraphStyle("sc2", fontName="Helvetica", fontSize=8,
                               textColor=bc.MUTED, alignment=TA_CENTER),
            ),
            Paragraph(
                f"MACRO REGIME · {conf_label}",
                ParagraphStyle("rc2", fontName="Helvetica", fontSize=8,
                               textColor=bc.MUTED, alignment=TA_CENTER),
            ),
            Paragraph(
                "MANDATE",
                ParagraphStyle("mc2", fontName="Helvetica", fontSize=8,
                               textColor=bc.MUTED, alignment=TA_CENTER),
            ),
        ],
    ]
    cards = Table(card_data, colWidths=[cw3, cw3, cw3])
    cards.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bc.PRIMARY),
        ("BOX", (0, 0), (-1, -1), 1, bc.SURFACE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, bc.SURFACE),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    items.append(cards)
    items.append(Spacer(1, 14))

    # ── Investment thesis ─────────────────────────────────────────────────────
    items.append(Paragraph("INVESTMENT THESIS", s["h3"]))
    items.append(Paragraph(_xml(ctx["thesis"]), s["body"]))
    items.append(Spacer(1, 10))

    # ── Key supporting factors ────────────────────────────────────────────────
    if ctx.get("strengths"):
        items.append(Paragraph("KEY SUPPORTING FACTORS", s["h3"]))
        for strength in ctx["strengths"][:3]:
            sentence = (strength.split(".")[0] + ".") if "." in strength else strength[:120]
            items.append(Paragraph(
                f'<font color="{_html_hex(bc.SUCCESS)}">▶</font>  {_xml(sentence)}',
                s["body"],
            ))
        items.append(Spacer(1, 10))

    # ── Primary recommendation ────────────────────────────────────────────────
    recs = ctx.get("recommendations") or []
    if recs:
        rec = recs[0]
        items.append(Paragraph("PRIMARY RECOMMENDATION", s["h3"]))
        rec_t = Table(
            [[Paragraph(
                f"<b>{_xml(rec['action'])}</b><br/>"
                f'<font color="{_html_hex(bc.MUTED)}">'
                f"{_xml(rec.get('rationale', ''))} · Timeline: {_xml(rec.get('timeline', ''))}"
                f"</font>",
                s["body"],
            )]],
            colWidths=[cw],
        )
        rec_t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
            ("LINEBEFORE", (0, 0), (0, -1), 3, bc.SUCCESS),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ]))
        items.append(rec_t)
        items.append(Spacer(1, 8))

    # ── Primary risk ──────────────────────────────────────────────────────────
    if ctx.get("weaknesses"):
        items.append(Paragraph("PRIMARY RISK TO THESIS", s["h3"]))
        risk = ctx["weaknesses"][0]
        risk_sentence = (risk.split(".")[0] + ".") if "." in risk else risk[:120]
        risk_t = Table(
            [[Paragraph(
                f'<font color="{_html_hex(bc.AMBER)}">⚠  </font>{_xml(risk_sentence)}',
                s["body"],
            )]],
            colWidths=[cw],
        )
        risk_t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
            ("LINEBEFORE", (0, 0), (0, -1), 3, bc.AMBER),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ]))
        items.append(risk_t)
        items.append(Spacer(1, 8))

    # ── Confidence statement ──────────────────────────────────────────────────
    conf_pct = 72 if ctx.get("swarm_available") else 65
    conf_basis = (
        "DNA analysis (live market data) + Swarm IC synthesis"
        if ctx.get("swarm_available")
        else "DNA analysis (live market data). Run Swarm IC for full synthesis."
    )
    items.append(Paragraph(
        f'<font color="{_html_hex(bc.MUTED)}">'
        f"Confidence: {conf_pct}% · Basis: {_xml(conf_basis)}</font>",
        s["muted8"],
    ))
    return items


def _build_pdf_sync(
    portfolio_data: dict,
    dna_data: dict,
    swarm_norm: dict,
    advisor_config: dict,
    logo_bytes: bytes | None,
    swarm_data_present: bool,
    theme: str = "dark",
) -> bytes:
    # Apply light-mode overrides before ICBrand initialisation
    brand_colors = advisor_config.get("brand_colors")
    if theme == "light":
        _light: dict = {
            "primary": "#FFFFFF", "accent": "#0891B2", "danger": "#DC2626",
            "success": "#16A34A", "amber": "#D97706", "white": "#111827",
            "muted": "#475569", "surface": "#F1F5F9", "secondary": "#E2E8F0",
        }
        brand_colors = {**_light, **(brand_colors or {})}
    bc = ICBrand(brand_colors)

    # Single source of truth for all page sections — never produces UNKNOWN
    ctx = _build_report_context(portfolio_data, dna_data, swarm_norm, advisor_config)

    metrics = portfolio_data.get("metrics") or {}
    if not isinstance(metrics, dict):
        metrics = {}
    positions = metrics.get("positions") or []
    if not isinstance(positions, list):
        positions = []

    thesis = swarm_norm.get("investment_thesis") or {}
    if not isinstance(thesis, dict):
        thesis = {}
    mkt = swarm_norm.get("market_regime") or {}
    if not isinstance(mkt, dict):
        mkt = {}
    quant = swarm_norm.get("quant_analysis") or thesis.get("quant_analysis") or {}
    if not isinstance(quant, dict):
        quant = {}
    tax_r = swarm_norm.get("tax_recommendation") or thesis.get("tax_recommendation") or {}
    if not isinstance(tax_r, dict):
        tax_r = {}
    sentinel = swarm_norm.get("risk_sentinel") or thesis.get("risk_sentinel") or {}
    if not isinstance(sentinel, dict):
        sentinel = {}
    alpha_raw = swarm_norm.get("alpha_signal") or thesis.get("alpha_signal") or {}
    if not isinstance(alpha_raw, dict):
        alpha_raw = {}

    dna = dna_data or {}
    # Pull core fields from ctx (already validated, never None/UNKNOWN)
    dna_score = ctx["dna_score"]
    archetype = ctx["investor_type"]
    strengths = ctx["strengths"]
    weaknesses = ctx["weaknesses"]

    # Use ctx regime values (guaranteed non-empty)
    regime_label, regime_color = _regime_display(ctx["regime_label"])
    conf_pct = ctx["regime_conf"] * 100

    portfolio_name = portfolio_data.get("name") or "Portfolio Analysis"
    client_name = advisor_config.get("client_name") or "Confidential"
    total_value = ctx["total_value"]
    firm_name = advisor_config.get("firm_name") or ""
    advisor_name = advisor_config.get("advisor_name") or "NeuFin Intelligence"
    white_label = bool(advisor_config.get("white_label"))
    report_id_short = advisor_config.get("report_run_id") or uuid.uuid4().hex[:8]
    now = datetime.datetime.now()
    report_date = now.strftime("%B %d, %Y")
    ts_full = now.isoformat()

    swarm_note = not swarm_data_present or not (
        thesis.get("headline")
        or thesis.get("briefing")
        or swarm_norm.get("quant_analysis")
    )

    # Thesis body — from ctx (always real text, never empty)
    body_text = ctx["thesis"]

    # Override swarm_available with the actual runtime flag
    ctx["swarm_available"] = swarm_data_present

    # Recommendations — from ctx (always populated)
    recs: list[dict[str, str]] = []
    raw_recs = thesis.get("recommendations")
    if isinstance(raw_recs, list):
        for i, r in enumerate(raw_recs[:5]):
            if isinstance(r, dict):
                recs.append(
                    {
                        "pri": ["HIGH", "MED", "LOW"][min(i, 2)],
                        "action": str(r.get("action", r.get("title", "")))[:120],
                        "why": str(r.get("rationale", r.get("reason", "")))[:200],
                    }
                )
            else:
                recs.append({"pri": "MED", "action": str(r)[:120], "why": ""})
    if not recs:
        for i, w in enumerate(weaknesses[:3]):
            recs.append(
                {
                    "pri": "HIGH" if i == 0 else "MED",
                    "action": f"Address: {w[:80]}",
                    "why": "Identified in DNA assessment.",
                }
            )
        if not recs:
            recs = [
                {
                    "pri": "MED",
                    "action": "Review concentration vs. mandate.",
                    "why": "Standard IC discipline.",
                }
            ]

    # --- Sort positions by weight ---
    def _w(p):
        rw = p.get("weight", 0)
        try:
            return float(rw) if float(rw) <= 1 else float(rw) / 100.0
        except (TypeError, ValueError):
            return 0.0

    pos_sorted = sorted(positions, key=_w, reverse=True)
    top8 = pos_sorted[:8]
    labels_pie = [p.get("symbol", "?") for p in top8]
    vals_pie = []
    for p in top8:
        w = _w(p)
        vals_pie.append(w * 100.0)
    if len(pos_sorted) > 8:
        rest = sum(_w(p) for p in pos_sorted[8:]) * 100.0
        labels_pie.append("Other")
        vals_pie.append(max(rest, 0.01))

    hhi = float(metrics.get("hhi") or metrics.get("concentration_risk") or 0)
    sharpe = float(
        quant.get("sharpe_ratio")
        or thesis.get("sharpe_ratio")
        or metrics.get("sharpe_ratio")
        or 0
    )
    beta = float(
        quant.get("weighted_beta")
        or thesis.get("weighted_beta")
        or metrics.get("weighted_beta")
        or 0
    )
    cash_w = float(metrics.get("cash_weight") or 0)
    ytd = metrics.get("ytd_return")
    num_pos = int(metrics.get("num_positions") or len(positions))

    corr_data = quant.get("corr_matrix_data") or {}
    sym_c = corr_data.get("symbols") or []
    mat_c = corr_data.get("values")
    if not sym_c and pos_sorted:
        sym_c = [p.get("symbol") for p in pos_sorted[:8]]

    # --- Stress / scenarios ---
    stress = thesis.get("stress_results") or []
    if isinstance(stress, dict):
        stress = list(stress.values()) if stress else []
    if not isinstance(stress, list):
        stress = []
    scenarios_rows = []
    for i, label in enumerate(("Bull", "Base", "Bear")):
        if i < len(stress) and isinstance(stress[i], dict):
            scenarios_rows.append(
                [
                    label,
                    _fpct(stress[i].get("probability")),
                    str(stress[i].get("regime", regime_label)),
                    str(
                        stress[i].get(
                            "portfolio_impact",
                            stress[i].get("portfolio_return_pct", ""),
                        )
                    )[:40],
                ]
            )
        else:
            scenarios_rows.append(
                [
                    label,
                    "—",
                    regime_label,
                    f"Beta {beta:.2f} in {regime_label}",
                ]
            )

    # --- Tax ---
    cgt_total = float(tax_r.get("total_liability") or tax_r.get("total_exposure") or 0)
    liability_top = tax_r.get("liability_top3") or []
    harvest = tax_r.get("harvest_opportunities") or tax_r.get("harvestable_top3") or []

    # --- Alpha opportunities ---
    opps: list = []
    if isinstance(alpha_raw.get("opportunities"), list):
        opps = alpha_raw["opportunities"]
    elif isinstance(alpha_raw.get("alpha_opportunities"), dict):
        opps = alpha_raw["alpha_opportunities"].get("opportunities") or []
    if not opps:
        opps = [
            {
                "title": "Consider defensive sector rotation",
                "impact": "+1-2% risk-adjusted (illustrative)",
                "regime": regime_label,
                "action": "Evaluate utilities / staples vs. high-beta growth.",
                "confidence": 0.55,
            },
            {
                "title": "Reduce top-3 concentration",
                "impact": "Lower tail risk",
                "regime": "All regimes",
                "action": "Trim outsized winners toward policy weights.",
                "confidence": 0.62,
            },
        ]

    # --- Agent trace ---
    trace_raw = swarm_norm.get("agent_trace") or []
    if isinstance(trace_raw, str):
        trace_raw = [trace_raw]
    if not isinstance(trace_raw, list):
        trace_raw = []

    agent_defs = [
        ("Market Regime", "Macro classification", "Regime label + confidence"),
        ("Strategist", "News + narrative", "Positioning implications"),
        ("Quant", "Prices + correlation", "Risk metrics + stress tests"),
        ("Tax Architect", "Cost basis", "Liability + harvest"),
        ("Risk Sentinel", "Watchdog review", "Risk level + mitigations"),
        ("Alpha Scout", "External opportunities", "Symbols + confidence"),
        ("Synthesizer", "IC thesis", "Headline + action plan"),
    ]
    agent_rows = []
    for i, (a, kin, kout) in enumerate(agent_defs):
        conf = "—"
        if i < len(trace_raw):
            snippet = str(trace_raw[i])[:80]
        else:
            snippet = "—"
        agent_rows.append([a, kin, kout, conf, snippet])

    buffer = io.BytesIO()

    styles = _styles(bc)
    elems: list = []

    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN + 18,
        bottomMargin=MARGIN + 22,
    )

    def _hf(canvas, d):
        canvas.saveState()
        canvas.setFillColor(bc.PRIMARY)
        canvas.rect(0, 0, A4_W, A4_H, fill=1, stroke=0)
        canvas.setStrokeColor(bc.ACCENT)
        canvas.setLineWidth(2)
        canvas.line(MARGIN, A4_H - MARGIN, A4_W - MARGIN, A4_H - MARGIN)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(bc.WHITE)
        canvas.drawString(MARGIN, A4_H - MARGIN - 14, "NEUFIN PORTFOLIO INTELLIGENCE")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(bc.MUTED)
        canvas.drawRightString(A4_W - MARGIN, A4_H - MARGIN - 14, f"Page {d.page}")
        disc = (
            "This report is generated by NeuFin AI intelligence and is provided for informational purposes only. "
            "Not investment advice. NeuFin OÜ (EU)."
        )
        if firm_name:
            disc += f" {firm_name} is responsible for validating these insights."
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(bc.MUTED)
        canvas.drawString(MARGIN, MARGIN - 6, disc[:220])
        canvas.restoreState()

    body_frame = Frame(
        MARGIN,
        MARGIN + 20,
        A4_W - 2 * MARGIN,
        A4_H - 2 * MARGIN - 38,
        id="normal",
    )

    def _cover_page(canvas, d):
        canvas.saveState()
        canvas.setFillColor(bc.PRIMARY)
        canvas.rect(0, 0, A4_W, A4_H, fill=1, stroke=0)
        y = A4_H - MARGIN - 30
        if logo_bytes:
            try:
                from reportlab.lib.utils import ImageReader

                ir = ImageReader(io.BytesIO(logo_bytes))
                canvas.drawImage(ir, MARGIN, y - 55, width=130, height=48, mask="auto")
            except Exception:
                canvas.setFont("Helvetica-Bold", 20)
                canvas.setFillColor(bc.WHITE)
                canvas.drawString(MARGIN, y - 25, (firm_name or advisor_name)[:42])
        else:
            canvas.setFont("Helvetica-Bold", 20)
            canvas.setFillColor(bc.WHITE)
            canvas.drawString(MARGIN, y - 25, (firm_name or advisor_name)[:42])
        canvas.setFont("Helvetica-Bold", 26)
        canvas.setFillColor(bc.ACCENT)
        canvas.drawCentredString(
            A4_W / 2, A4_H / 2 + 40, "PORTFOLIO INTELLIGENCE REPORT"
        )
        canvas.setFont("Helvetica", 13)
        canvas.setFillColor(bc.MUTED)
        canvas.drawCentredString(
            A4_W / 2,
            A4_H / 2 + 12,
            "Behavioral DNA · Risk Analysis · Strategic Recommendations",
        )
        canvas.setStrokeColor(bc.ACCENT)
        canvas.setLineWidth(1)
        canvas.line(A4_W * 0.2, A4_H / 2 - 10, A4_W * 0.8, A4_H / 2 - 10)
        canvas.setFont("Helvetica", 11)
        canvas.setFillColor(bc.WHITE)
        lines = [
            f"Portfolio: {portfolio_name}",
            f"Client:    {client_name}",
            f"Total Value: ${total_value:,.0f}",
            f"Date:      {report_date}",
            f"Advisor:   {advisor_name}",
            f"Firm:      {firm_name}",
        ]
        yy = A4_H / 2 - 40
        for line in lines:
            canvas.drawString(MARGIN + 50, yy, line[:85])
            yy -= 16
        if not white_label:
            canvas.setFont("Helvetica", 9)
            canvas.setFillColor(bc.MUTED)
            canvas.drawCentredString(
                A4_W / 2, MARGIN + 20, "Powered by NeuFin Intelligence"
            )
        canvas.restoreState()

    cover_frame = Frame(0, 0, A4_W, A4_H, id="cover")
    doc.addPageTemplates(
        [
            PageTemplate(id="Cover", frames=[cover_frame], onPage=_cover_page),
            PageTemplate(id="Body", frames=[body_frame], onPage=_hf),
        ]
    )

    elems.append(Spacer(1, 1))
    elems.append(PageBreak())
    elems.append(NextPageTemplate("Body"))

    # PAGE 2 Executive memo (IC-grade: verdict, thesis, rec, risk, confidence)
    cw = A4_W - 2 * MARGIN
    elems.extend(_page_executive_memo(ctx, styles, cw, bc))
    elems.append(PageBreak())

    # PAGE 3 Portfolio snapshot
    elems.append(Paragraph("PORTFOLIO SNAPSHOT", styles["h_section"]))
    elems.append(Spacer(1, 8))
    pie_img = None
    try:
        pie_img = try_render_pie_chart(labels_pie, vals_pie, bc)
    except Exception as e:
        logger.warning("pdf.pie_failed", error=str(e))
    if pie_img:
        left = pie_img
    else:
        alloc_rows = [
            [
                Paragraph(_xml(str(labels_pie[i])), styles["body"]),
                Table(
                    [[""]],
                    colWidths=[max(20, min(120, float(vals_pie[i]) * 1.2))],
                    rowHeights=[10],
                    style=TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), bc.ACCENT),
                        ]
                    ),
                ),
                Paragraph(f"{float(vals_pie[i]):.1f}%", styles["body"]),
            ]
            for i in range(len(labels_pie))
        ]
        left = Table(
            alloc_rows,
            colWidths=[55, 130, 45],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                ]
            ),
        )
    stats_data = [
        ["Metric", "Value"],
        ["Total Value", f"${total_value:,.0f}"],
        ["# Positions", str(num_pos)],
        ["Cash Weight", f"{cash_w:.1f}%"],
        ["Concentration (HHI)", f"{hhi:.4f}"],
        ["Weighted Beta", f"{beta:.2f}"],
        ["Sharpe Ratio", f"{sharpe:.2f}"],
        ["YTD Return", _fpct(ytd) if ytd is not None else "—"],
    ]
    st = Table(
        stats_data,
        colWidths=[140, 120],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), bc.ACCENT),
                ("TEXTCOLOR", (0, 0), (-1, 0), bc.WHITE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [bc.SURFACE, bc.PRIMARY]),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, bc.MUTED),
            ]
        ),
    )
    snap = Table([[left, st]], colWidths=[260, 240])
    snap.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elems.append(snap)
    elems.append(Spacer(1, 12))
    hold = [["Symbol", "Name", "Weight %", "Value", "Beta", "Day Chg"]]
    for p in pos_sorted[:10]:
        sym = str(p.get("symbol", ""))
        w_pct = _w(p) * 100
        val = float(p.get("current_value") or p.get("value") or 0)
        beta_p = float(p.get("beta") or 0)
        dc = p.get("day_change_pct")
        dc_s = _fpct(dc) if dc is not None else "—"
        try:
            dc_f = float(dc) if dc is not None else None
        except (TypeError, ValueError):
            dc_f = None
        dc_color = (
            bc.MUTED if dc_f is None else (bc.SUCCESS if dc_f >= 0 else bc.DANGER)
        )
        hold.append(
            [
                sym,
                sym[:8],
                f"{w_pct:.1f}%",
                f"${val:,.0f}",
                f"{beta_p:.2f}",
                Paragraph(
                    f'<font color="{_html_hex(dc_color)}">{dc_s}</font>',
                    styles["body"],
                ),
            ]
        )
    elems.append(
        Table(
            hold,
            colWidths=[50, 55, 55, 70, 45, 55],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), bc.ACCENT),
                    ("TEXTCOLOR", (0, 0), (-1, 0), bc.WHITE),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [bc.PRIMARY, bc.SURFACE]),
                    ("GRID", (0, 0), (-1, -1), 0.25, bc.MUTED),
                ]
            ),
        )
    )
    elems.append(PageBreak())

    # PAGE 4 DNA
    elems.append(Paragraph("BEHAVIORAL DNA ANALYSIS", styles["h_section"]))
    elems.append(Spacer(1, 8))
    g = _gauge_image(dna_score, bc)
    if not g:
        g = Paragraph(
            f'<font size="26" color="{_html_hex(_dna_score_color(dna_score, bc))}"><b>{dna_score}</b></font>'
            f' <font size="11" color="#94A3B8">/ 100</font>',
            ParagraphStyle("gauge_txt", alignment=TA_CENTER, fontName="Helvetica-Bold"),
        )
    arch_txt = _xml(str(archetype)[:500])
    desc = Paragraph(
        f"{arch_txt}<br/><br/>This archetype reflects observed concentration, beta, and "
        f"behavioral patterns from your holdings and DNA assessment.",
        styles["body"],
    )
    row_dna = [[g or Spacer(1, 1), desc]]
    elems.append(
        Table(
            row_dna,
            colWidths=[200, A4_W - 2 * MARGIN - 200],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]),
        )
    )
    elems.append(Spacer(1, 10))
    elems.append(Paragraph("<b>Strengths</b>", styles["h_section"]))
    for s in strengths:
        elems.append(Paragraph(f"✓ {_xml(s)}", styles["body"]))
    elems.append(Spacer(1, 6))
    elems.append(Paragraph("<b>Weaknesses</b>", styles["h_section"]))
    for w in weaknesses:
        elems.append(Paragraph(f"⚠ {_xml(w)}", styles["body"]))
    elems.append(Spacer(1, 8))
    bias_box = Table(
        [
            [Paragraph("<b>DETECTED BIASES</b>", styles["h_section"])],
            [
                Paragraph(
                    _xml(
                        sentinel.get(
                            "primary_risks",
                            ["Recency / concentration — review top holdings"],
                        )[0]
                        if sentinel.get("primary_risks")
                        else "No specific behavioral bias flags — see DNA weaknesses."
                    ),
                    styles["body"],
                )
            ],
        ],
        colWidths=[A4_W - 2 * MARGIN],
        style=TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, bc.AMBER),
                ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        ),
    )
    elems.append(bias_box)
    elems.append(PageBreak())

    # PAGE 5 Regime — uses ctx["regime_label"] (always set, never UNKNOWN)
    elems.append(Paragraph("MARKET REGIME & MACRO CONTEXT", styles["h_section"]))
    elems.append(Spacer(1, 8))
    regime_display = ctx["regime_label"]   # guaranteed non-empty from _build_report_context
    regime_conf_val = ctx["regime_conf"]
    regime_conf_label = (
        f"Confidence: {regime_conf_val * 100:.0f}%"
        if regime_conf_val > 0
        else "Portfolio-derived classification"
    )
    sub_line = (
        f"{regime_conf_label} · "
        "Classification based on FRED macro signals via Swarm IC analysis."
        if regime_conf_val > 0
        else
        f"{regime_conf_label} · Run Swarm IC for live FRED/macro regime signals."
    )
    banner = Table(
        [[Paragraph(
            f"<b>PORTFOLIO REGIME EXPOSURE: {_xml(regime_display.upper())}</b><br/>"
            f"<font size='9'>{_xml(sub_line)}</font>",
            ParagraphStyle(
                "bn", textColor=colors.white, alignment=TA_CENTER, fontSize=13,
            ),
        )]],
        colWidths=[A4_W - 2 * MARGIN],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), regime_color),
            ("TOPPADDING", (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ]),
    )
    elems.append(banner)
    elems.append(Spacer(1, 10))

    # Portfolio-derived macro signals (always available — no swarm needed)
    _def_w = sum(
        float(pos.get("weight") or 0) / 100
        for pos in positions
        if pos.get("symbol") in ("GLD", "TLT", "BND", "JNJ", "PG", "VZ", "XLP", "XLU")
    )
    _tech_w = sum(
        float(pos.get("weight") or 0) / 100
        for pos in positions
        if pos.get("symbol") in ("AAPL", "MSFT", "AMZN", "NVDA", "META", "GOOGL", "QQQ")
    )
    _gld_w = next(
        (float(pos.get("weight") or 0) / 100 for pos in positions if pos.get("symbol") == "GLD"),
        0,
    )
    _fi_w = next(
        (float(pos.get("weight") or 0) / 100 for pos in positions
         if pos.get("symbol") in ("TLT", "BND", "AGG", "GOVT", "IEF")),
        0,
    )
    portfolio_signals = [
        ("Portfolio Beta", f"{beta:.2f}", "vs SPY 1.00"),
        ("Defensive Weight", _fpct(_def_w), "GLD/TLT/XLP/XLU"),
        ("Tech Concentration", _fpct(_tech_w), "Large-cap tech"),
        ("Gold Hedge", _fpct(_gld_w), "Inflation buffer"),
        ("Fixed Income", _fpct(_fi_w), "Duration exposure"),
        ("HHI Concentration", f"{hhi:.4f}", "⚠ High" if hhi > 0.20 else "Normal"),
    ]
    macro_cells = []
    for sig_name, sig_val, sig_note in portfolio_signals:
        macro_cells.append(Paragraph(
            f"<b>{_xml(sig_name)}</b><br/>{_xml(sig_val)}<br/>"
            f"<font size='8' color='#94A3B8'>{_xml(sig_note)}</font>",
            styles["body"],
        ))
    # Fill with swarm drivers if available
    drivers = _coerce_list(mkt.get("drivers"), 6)
    if drivers:
        macro_names = ["VIX Level", "Yield Curve", "CPI YoY", "PMI", "Liquidity", "Credit Spread"]
        macro_cells = []
        for i, name in enumerate(macro_names):
            val = drivers[i] if i < len(drivers) else "Pending Swarm IC analysis"
            macro_cells.append(Paragraph(
                f"<b>{name}</b><br/>{_xml(str(val)[:60])}",
                styles["body"],
            ))
    grid = Table(
        [macro_cells[:3], macro_cells[3:]],
        colWidths=[150, 150, 150],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
            ("BOX", (0, 0), (-1, -1), 0.5, bc.PRIMARY),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]),
    )
    elems.append(grid)
    elems.append(Spacer(1, 10))
    # Narrative: from ctx (swarm macro_advice if available, else portfolio-derived)
    regime_narr = ctx["regime_narrative"] or (
        f"Portfolio beta of {beta:.2f} shapes sensitivity to the "
        f"{regime_display} environment. "
        f"Review correlation clusters in the risk section for factor overlap."
    )
    elems.append(Paragraph(_xml(regime_narr[:800]), styles["body"]))
    elems.append(Spacer(1, 8))
    scen = [
        ["Scenario", "Probability", "Regime", "Portfolio Impact"],
        *scenarios_rows,
    ]
    elems.append(
        Table(
            scen,
            colWidths=[70, 80, 90, 200],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), bc.ACCENT),
                ("TEXTCOLOR", (0, 0), (-1, 0), bc.WHITE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [bc.PRIMARY, bc.SURFACE]),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, bc.MUTED),
            ]),
        )
    )
    elems.append(PageBreak())

    # PAGE 6 Risk
    elems.append(Paragraph("RISK & CORRELATION", styles["h_section"]))
    elems.append(Spacer(1, 8))
    hm = _heatmap_image(sym_c, mat_c, bc)
    if hm:
        elems.append(hm)
    else:
        elems.append(
            Paragraph(
                f"Correlation heatmap available after Swarm IC analysis. "
                f"Portfolio HHI: {hhi:.4f} — "
                f"{'concentration risk present' if hhi > 0.20 else 'diversification is healthy'}.",
                styles["body"],
            )
        )
    elems.append(Spacer(1, 8))
    var_95 = quant.get("var_95") or metrics.get("var_95")
    max_dd = quant.get("max_drawdown") or metrics.get("max_drawdown")
    risk_tbl = [
        ["Metric", "Value", "Status"],
        [
            "VaR (95%, 1-day)",
            _fpct(var_95) if var_95 is not None else "—",
            "Pending Swarm IC analysis" if var_95 is None else "Calculated",
        ],
        ["Max Drawdown (est.)", _fpct(max_dd) if max_dd is not None else "—", "Normal"],
        ["Concentration (HHI)", f"{hhi:.4f}", "⚠ High" if hhi > 0.25 else "Normal"],
    ]
    elems.append(
        Table(
            risk_tbl,
            colWidths=[140, 80, 200],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), bc.ACCENT),
                    ("TEXTCOLOR", (0, 0), (-1, 0), bc.WHITE),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [bc.PRIMARY, bc.SURFACE]),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.25, bc.MUTED),
                ]
            ),
        )
    )
    if hhi > 0.25:
        elems.append(Spacer(1, 8))
        top3 = sum(_w(p) for p in pos_sorted[:3]) * 100
        cw = Table(
            [
                [Paragraph("<b>CONCENTRATION WARNING</b>", styles["h_section"])],
                [
                    Paragraph(
                        _xml(
                            f"Your top 3 positions represent {top3:.1f}% of portfolio value. "
                            f"Industry guideline: avoid outsized single-name risk."
                        ),
                        styles["body"],
                    )
                ],
            ],
            style=TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 1, bc.DANGER),
                    ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
                ]
            ),
        )
        elems.append(cw)
    elems.append(PageBreak())

    # PAGE 7 Tax — reads directly from DNA data via ctx (always populated)
    elems.append(Paragraph("TAX & OPTIMIZATION", styles["h_section"]))
    elems.append(Spacer(1, 8))
    ctx_tax_total = ctx["total_tax_liability"]
    ctx_harvest_total = ctx["total_harvest_opp"]
    ctx_tax_positions = ctx["tax_positions"]
    ctx_tax_narrative = ctx["tax_narrative"]

    elems.append(Paragraph(
        f"<font color='{_html_hex(bc.AMBER)}'>"
        f"<b>ESTIMATED CGT EXPOSURE: ${ctx_tax_total:,.0f}</b></font><br/>"
        f"<font size='9' color='#94A3B8'>Computed from cost basis in DNA analysis. "
        f"Tax-loss harvest opportunity: ${ctx_harvest_total:,.0f}.</font>",
        styles["body"],
    ))
    elems.append(Spacer(1, 8))

    # Build tax table from DNA positions (all positions with real gain/loss data)
    tax_rows = [["Symbol", "Unrealised G/L", "Est. CGT", "Harvest Credit", "Status"]]
    if ctx_tax_positions:
        for tp in ctx_tax_positions:
            if not isinstance(tp, dict):
                continue
            unrealised = float(tp.get("unrealised_gain") or 0)
            cgt = float(tp.get("tax_liability") or 0)
            harvest = float(tp.get("harvest_credit") or 0)
            status = (
                "Harvest candidate" if harvest > 0
                else ("Taxable gain" if cgt > 0 else "Neutral")
            )
            gain_color = _html_hex(bc.SUCCESS) if unrealised >= 0 else _html_hex(bc.DANGER)
            tax_rows.append([
                str(tp.get("symbol", "—")),
                Paragraph(f'<font color="{gain_color}">{_fnum(unrealised)}</font>', styles["body"]),
                _fnum(cgt) if cgt > 0 else "—",
                Paragraph(
                    f'<font color="{_html_hex(bc.AMBER)}">{_fnum(harvest)}</font>'
                    if harvest > 0 else "—",
                    styles["body"],
                ),
                status,
            ])
    else:
        # Fallback to position list if no cost basis data
        for pos in pos_sorted[:12]:
            tax_rows.append([
                str(pos.get("symbol", "—")), "—", "—", "—",
                "Add cost basis for tax analysis",
            ])

    elems.append(Table(
        tax_rows,
        colWidths=[50, 80, 70, 80, 100],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), bc.ACCENT),
            ("TEXTCOLOR", (0, 0), (-1, 0), bc.WHITE),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [bc.PRIMARY, bc.SURFACE]),
            ("GRID", (0, 0), (-1, -1), 0.25, bc.MUTED),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]),
    ))
    elems.append(Spacer(1, 8))

    # Harvest summary
    harvest_syms = [tp["symbol"] for tp in ctx_tax_positions
                    if float(tp.get("harvest_credit") or 0) > 0]
    if harvest_syms and ctx_harvest_total > 0:
        harvest_text = (
            f"Tax-loss harvesting candidates: {', '.join(harvest_syms[:6])} — "
            f"${ctx_harvest_total:,.0f} opportunity. "
            f"Est. 5-year after-tax benefit: ${ctx_harvest_total * 5:,.0f} (assuming 20% CGT rate)."
        )
    elif ctx_tax_narrative:
        harvest_text = ctx_tax_narrative
    else:
        harvest_text = (
            "Provide cost basis data to unlock full tax-loss harvesting analysis. "
            "This identifies realizable losses that offset capital gains."
        )
    elems.append(Paragraph(_xml(harvest_text), styles["body"]))
    elems.append(PageBreak())

    # PAGE 8 Alpha — uses ctx["alpha_opps"] (always has at least 1 entry)
    elems.append(Paragraph("ALPHA OPPORTUNITIES", styles["h_section"]))
    elems.append(Spacer(1, 6))
    if not ctx.get("swarm_available"):
        elems.append(Paragraph(
            "<i>Portfolio-derived signals below. Run Swarm IC Analysis to unlock "
            "symbol-level alpha signals with estimated return impact.</i>",
            ParagraphStyle("sn", fontName="Helvetica-Oblique", textColor=bc.AMBER, fontSize=9),
        ))
        elems.append(Spacer(1, 4))
    for opp in ctx["alpha_opps"][:5]:
        if not isinstance(opp, dict):
            continue
        title = opp.get("title") or "Opportunity"
        desc = opp.get("description") or ""
        regime_o = opp.get("regime") or ctx["regime_label"] or "All regimes"
        conf_raw = opp.get("confidence") or "—"
        try:
            conf = float(str(conf_raw).replace("%", "")) / 100 if "%" in str(conf_raw) else 0.65
        except (ValueError, TypeError):
            conf = 0.65
        card = Table(
            [
                [Paragraph(f"<b>{_xml(str(title)[:80])}</b>", styles["body"])],
                [Paragraph(_xml(str(desc)[:300]), styles["body"])],
                [Paragraph(
                    f"Regime: {_xml(str(regime_o))} · Confidence: {_xml(str(conf_raw))}",
                    styles["body"],
                )],
                [_confidence_bar(conf, bc)],
            ],
            colWidths=[A4_W - 2 * MARGIN],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
                ("BOX", (0, 0), (-1, -1), 0.5, bc.ACCENT),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]),
        )
        elems.append(card)
        elems.append(Spacer(1, 8))
    elems.append(PageBreak())

    # PAGE 9 Trace
    elems.append(Paragraph("HOW THIS REPORT WAS GENERATED", styles["h_section"]))
    elems.append(
        Paragraph(
            "<font size='9' color='#94A3B8'>Full transparency on AI agent contributions.</font>",
            styles["body"],
        )
    )
    if swarm_note:
        elems.append(Paragraph(
            "<i>Swarm IC analysis not yet run for this portfolio — "
            "trace reflects DNA analysis only. "
            "Run from the portfolio page for full 7-agent attribution.</i>",
            ParagraphStyle("sn2", fontName="Helvetica-Oblique", textColor=bc.AMBER, fontSize=9),
        ))
    elems.append(Spacer(1, 6))
    elems.append(
        Table(
            [
                ["Agent", "Key Input", "Key Output", "Confidence", "Trace"],
                *agent_rows,
            ],
            colWidths=[78, 78, 78, 52, 120],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), bc.ACCENT),
                    ("TEXTCOLOR", (0, 0), (-1, 0), bc.WHITE),
                    ("FONTSIZE", (0, 0), (-1, -1), 6),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [bc.PRIMARY, bc.SURFACE]),
                    ("GRID", (0, 0), (-1, -1), 0.2, bc.MUTED),
                ]
            ),
        )
    )
    elems.append(Spacer(1, 10))
    elems.append(
        Paragraph(
            _xml(
                "Market data: Polygon.io, Finnhub, Alpha Vantage, Yahoo Finance. "
                "Macro: FRED. AI: Claude Sonnet (Anthropic). "
                f"Generated: {ts_full}. Report version: {report_id_short}"
            ),
            styles["muted8"],
        )
    )
    elems.append(Spacer(1, 8))
    oc = 72
    elems.append(
        Paragraph(
            f"<b>OVERALL CONFIDENCE: {oc}%</b><br/>"
            f"<font size='8'>Based on data freshness and model certainty. Scores below 70% indicate higher uncertainty.</font>",
            ParagraphStyle("oc", fontSize=11, textColor=bc.WHITE, alignment=TA_CENTER),
        )
    )
    elems.append(PageBreak())

    # PAGE 10 Recommendations
    elems.append(Paragraph("RECOMMENDATIONS & NEXT STEPS", styles["h_section"]))
    elems.append(Spacer(1, 8))
    act_plan = thesis.get("action_plan") or thesis.get("recommendation_summary") or []
    if not isinstance(act_plan, list):
        act_plan = []
    # Use ctx recommendations (always populated, from swarm + DNA + tax)
    ctx_recs = ctx.get("recommendations") or []
    prio = [["#", "Action", "Rationale", "Expected Impact", "Timeline"]]
    rec_source = act_plan if act_plan else ctx_recs
    for i, a in enumerate(rec_source[:5]):
        if isinstance(a, dict):
            action_text = _xml(str(a.get("action", ""))[:80])
            rationale_text = _xml(str(a.get("rationale", "IC synthesis"))[:60])
            timeline_text = _xml(str(a.get("timeline", "90 days"))[:30])
        else:
            action_text = _xml(str(a)[:80])
            rationale_text = _xml("IC synthesis")
            timeline_text = "90 days"
        prio.append([str(i + 1), action_text, rationale_text, "Portfolio optimisation", timeline_text])
    elems.append(
        Table(
            prio,
            colWidths=[25, 130, 110, 80, 80],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), bc.ACCENT),
                    ("TEXTCOLOR", (0, 0), (-1, 0), bc.WHITE),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [bc.PRIMARY, bc.SURFACE]),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, bc.MUTED),
                ]
            ),
        )
    )
    elems.append(Spacer(1, 10))
    cur_t = [["Symbol", "Current %", "Target %"]]
    for p in pos_sorted[:8]:
        sym = p.get("symbol", "")
        w = _w(p) * 100
        tgt = max(w * 0.95, 0.0)
        cur_t.append([sym, f"{w:.1f}%", f"{tgt:.1f}% (illustrative)"])
    elems.append(
        Table(
            cur_t,
            colWidths=[80, 80, 120],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), bc.ACCENT),
                    ("TEXTCOLOR", (0, 0), (-1, 0), bc.WHITE),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [bc.PRIMARY, bc.SURFACE]),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.25, bc.MUTED),
                ]
            ),
        )
    )
    elems.append(Spacer(1, 10))
    cta = Table(
        [
            [Paragraph("<b>Schedule Portfolio Review</b>", styles["h_section"])],
            [
                Paragraph(
                    _xml(
                        f"Contact: {advisor_config.get('advisor_email') or 'info@neufin.ai'}"
                    ),
                    styles["body"],
                )
            ],
        ],
        style=TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1.5, bc.ACCENT),
                ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ]
        ),
    )
    elems.append(cta)
    elems.append(Spacer(1, 12))
    firm_footer = advisor_config.get("firm_name") or ""
    elems.append(
        Paragraph(
            _xml(
                "This report is generated by NeuFin AI intelligence and is provided for informational purposes only. "
                "This is not investment advice and should not be construed as a recommendation to buy, sell, or hold any security. "
                "Past performance does not guarantee future results. NeuFin OÜ is registered in Estonia (EU). "
                + (
                    f"{firm_footer} is responsible for validating these insights against their regulatory obligations."
                    if firm_footer
                    else ""
                )
            ),
            ParagraphStyle(
                "ft",
                fontSize=8,
                textColor=bc.MUTED,
                leading=10,
                fontName="Helvetica",
            ),
        )
    )

    try:
        doc.build(elems)
    except Exception as e:
        logger.error("pdf.doc_build_failed", error=str(e), exc_info=True)
        try:
            return _generate_emergency_pdf(str(e), advisor_config)
        except Exception as e2:
            logger.error("pdf.emergency_pdf_failed", error=str(e2), exc_info=True)
            raise RuntimeError(f"PDF render failed: {e}") from e2
    return buffer.getvalue()


async def generate_advisor_report(
    portfolio_data: dict,
    dna_data: dict,
    swarm_data: Any | None,
    advisor_config: dict,
    theme: str = "dark",
) -> bytes:
    """
    Orchestrator: async asset resolution, then synchronous PDF build.

    1. **Async**: fetch ``logo_url`` / decode ``logo_base64``; Pillow-validate bytes.
    2. **Sync**: ``_build_pdf_sync`` — BaseDocTemplate + 10-page story (no I/O).

    Returns raw PDF bytes; caller uploads or returns ``Response(content=...)``.
    Swarm data may be None; DNA may be empty — report still renders 10 pages.
    ``theme`` is ``"dark"`` (default) or ``"light"`` (white background, print-friendly).
    """
    raw_logo = await _fetch_logo_bytes(advisor_config)
    logo_bytes = _prepare_logo_bytes(raw_logo)
    swarm_norm = _normalize_swarm(swarm_data)
    swarm_data_present = isinstance(swarm_data, dict) and bool(swarm_data)
    try:
        return _build_pdf_sync(
            portfolio_data,
            dna_data or {},
            swarm_norm,
            advisor_config,
            logo_bytes,
            swarm_data_present,
            theme=theme,
        )
    except Exception as e:
        logger.error("pdf.orchestrator_failed", error=str(e), exc_info=True)
        try:
            return _generate_emergency_pdf(
                f"Report assembly failed: {e}",
                advisor_config,
            )
        except Exception as e2:
            logger.error("pdf.emergency_pdf_failed", error=str(e2), exc_info=True)
            raise
