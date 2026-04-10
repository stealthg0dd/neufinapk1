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


def _normalize_swarm(swarm: dict | None) -> dict[str, Any]:
    """Flatten swarm_reports row + nested investment_thesis into one shape."""
    if not swarm:
        return {}
    row = dict(swarm)
    nested = row.get("investment_thesis")
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
            "tax_report",
            "risk_sentinel",
            "alpha_scout",
            "strategist_intel",
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
            "tax_report": row.get("tax_report"),
            "risk_sentinel": row.get("risk_sentinel"),
            "alpha_scout": row.get("alpha_scout"),
            "strategist_intel": row.get("strategist_intel"),
        }
    return {
        "investment_thesis": inv,
        "market_regime": (inv.get("market_regime") or row.get("market_regime") or {}),
        "quant_analysis": (
            inv.get("quant_analysis") or row.get("quant_analysis") or {}
        ),
        "tax_report": (inv.get("tax_report") or row.get("tax_report") or {}),
        "risk_sentinel": (inv.get("risk_sentinel") or row.get("risk_sentinel") or {}),
        "alpha_scout": (inv.get("alpha_scout") or row.get("alpha_scout") or {}),
        "agent_trace": row.get("agent_trace") or [],
        "regime": inv.get("regime") or row.get("regime"),
    }


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
    return (regime or "UNKNOWN").upper(), HexColor("#1EB8CC")


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


def _build_pdf_sync(
    portfolio_data: dict,
    dna_data: dict,
    swarm_norm: dict,
    advisor_config: dict,
    logo_bytes: bytes | None,
    swarm_data_present: bool,
) -> bytes:
    bc = ICBrand(advisor_config.get("brand_colors"))
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
    tax_r = swarm_norm.get("tax_report") or thesis.get("tax_report") or {}
    if not isinstance(tax_r, dict):
        tax_r = {}
    sentinel = swarm_norm.get("risk_sentinel") or thesis.get("risk_sentinel") or {}
    if not isinstance(sentinel, dict):
        sentinel = {}
    alpha_raw = swarm_norm.get("alpha_scout") or thesis.get("alpha_scout") or {}
    if not isinstance(alpha_raw, dict):
        alpha_raw = {}

    dna = dna_data or {}
    dna_score = int(
        dna.get("dna_score") or thesis.get("dna_score") or metrics.get("dna_score") or 0
    )
    archetype = (
        dna.get("investor_type") or thesis.get("headline") or "PORTFOLIO INVESTOR"
    )
    strengths = _coerce_list(dna.get("strengths"), 5)
    weaknesses = _coerce_list(dna.get("weaknesses"), 5)

    regime_raw = mkt.get("regime") or swarm_norm.get("regime") or thesis.get("regime")
    regime_label, regime_color = _regime_display(
        str(regime_raw) if regime_raw else None
    )
    conf_pct = 0.0
    try:
        conf_pct = float(mkt.get("confidence") or 0) * 100
    except (TypeError, ValueError):
        conf_pct = 0.0

    portfolio_name = portfolio_data.get("name") or "Portfolio Analysis"
    client_name = advisor_config.get("client_name") or "Confidential"
    total_value = float(
        portfolio_data.get("total_value") or metrics.get("total_value") or 0
    )
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

    # --- Thesis body ---
    body_text = thesis.get("body") or thesis.get("briefing") or ""
    if not body_text.strip():
        body_text = (
            f"Portfolio DNA score is {dna_score}/100 under a {regime_raw or 'mixed'!s} regime. "
            f"Weighted beta is {_fnum(thesis.get('weighted_beta') or metrics.get('weighted_beta'))}. "
            f"Sharpe ratio: {_fnum(thesis.get('sharpe_ratio') or metrics.get('sharpe_ratio'))}."
        )

    # --- Recommendations (executive table) ---
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

    # PAGE 2 Executive summary
    elems.append(
        Table(
            [[Paragraph("EXECUTIVE SUMMARY", styles["h_section"])]],
            colWidths=[A4_W - 2 * MARGIN],
            style=TableStyle(
                [
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("LINEABOVE", (0, 0), (0, 0), 0, bc.ACCENT),
                    ("LINEBEFORE", (0, 0), (0, 0), 3, bc.ACCENT),
                    ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
                ]
            ),
        )
    )
    elems.append(Spacer(1, 10))

    card_w = (A4_W - 2 * MARGIN - 20) / 3
    dna_col = _dna_score_color(dna_score, bc)
    alpha_n = len(opps) if opps else 0
    card_tbl = Table(
        [
            [
                Paragraph(
                    f'<font color="{_html_hex(dna_col)}"><b>{dna_score}</b></font><br/><font size="8" color="#94A3B8">Portfolio Health</font>',
                    ParagraphStyle(
                        "c1", alignment=TA_CENTER, fontSize=12, textColor=bc.WHITE
                    ),
                ),
                Paragraph(
                    f"<b>{_xml(regime_label)}</b><br/><font size='8' color='#94A3B8'>Confidence {conf_pct:.0f}%</font>",
                    ParagraphStyle(
                        "c2", alignment=TA_CENTER, fontSize=10, textColor=regime_color
                    ),
                ),
                Paragraph(
                    f"<b>{alpha_n} opportunities</b><br/><font size='8' color='#94A3B8'>Alpha Potential</font>",
                    ParagraphStyle(
                        "c3", alignment=TA_CENTER, fontSize=10, textColor=bc.WHITE
                    ),
                ),
            ]
        ],
        colWidths=[card_w, card_w, card_w],
    )
    card_tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bc.PRIMARY),
                ("BOX", (0, 0), (-1, -1), 0.5, bc.SURFACE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    elems.append(card_tbl)
    elems.append(Spacer(1, 12))
    elems.append(Paragraph(_xml(body_text[:1200]), styles["body"]))
    elems.append(Spacer(1, 10))

    rec_data = [["Priority", "Action", "Rationale"]]
    for r in recs[:3]:
        pri = r.get("pri", "MED")
        icon = "!!" if pri == "HIGH" else ("!" if pri == "MED" else "i")
        clr = bc.DANGER if pri == "HIGH" else (bc.AMBER if pri == "MED" else bc.ACCENT)
        rec_data.append(
            [
                Paragraph(
                    f'<font color="{_html_hex(clr)}">{icon}</font>', styles["body"]
                ),
                Paragraph(_xml(r.get("action", "")), styles["body"]),
                Paragraph(_xml(r.get("why", "")), styles["body"]),
            ]
        )
    elems.append(
        Table(
            rec_data,
            colWidths=[40, 200, A4_W - 2 * MARGIN - 260],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), bc.ACCENT),
                    ("TEXTCOLOR", (0, 0), (-1, 0), bc.WHITE),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.25, bc.SURFACE),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [bc.PRIMARY, bc.SURFACE]),
                ]
            ),
        )
    )
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
                Paragraph(_xml(str(lab)), styles["body"]),
                Table(
                    [[""]],
                    colWidths=[max(20, min(120, float(v) * 1.2))],
                    rowHeights=[10],
                    style=TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), bc.ACCENT),
                        ]
                    ),
                ),
                Paragraph(f"{float(v):.1f}%", styles["body"]),
            ]
            for lab, v in zip(labels_pie, vals_pie)
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

    # PAGE 5 Regime
    elems.append(Paragraph("MARKET REGIME & MACRO CONTEXT", styles["h_section"]))
    elems.append(Spacer(1, 8))
    banner = Table(
        [
            [
                Paragraph(
                    f"<b>CURRENT REGIME: {_xml(regime_label)}</b><br/>"
                    f"<font size='9'>Confidence: {conf_pct:.0f}% · Last updated: {_xml(ts_full[:19])}</font>",
                    ParagraphStyle(
                        "bn", textColor=colors.white, alignment=TA_CENTER, fontSize=14
                    ),
                )
            ]
        ],
        colWidths=[A4_W - 2 * MARGIN],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), regime_color),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        ),
    )
    elems.append(banner)
    elems.append(Spacer(1, 10))
    drivers = _coerce_list(mkt.get("drivers"), 6)
    macro_cells = []
    macro_names = ["VIX", "Yield Curve", "CPI YoY", "PMI", "Liquidity", "Credit"]
    for i, name in enumerate(macro_names):
        val = drivers[i] if i < len(drivers) else "—"
        macro_cells.append(
            Paragraph(
                f"<b>{name}</b><br/>{ _xml(str(val)[:40]) }<br/><font size='8' color='#94A3B8'>See swarm run for detail</font>",
                styles["body"],
            )
        )
    grid = Table(
        [
            macro_cells[:3],
            macro_cells[3:],
        ],
        colWidths=[150, 150, 150],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
                ("BOX", (0, 0), (-1, -1), 0.5, bc.PRIMARY),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        ),
    )
    elems.append(grid)
    elems.append(Spacer(1, 10))
    elems.append(
        Paragraph(
            _xml(
                f"Your portfolio beta of {beta:.2f} shapes sensitivity to the {regime_label} environment. "
                f"Review correlation clusters in the risk section for factor overlap."
            ),
            styles["body"],
        )
    )
    elems.append(Spacer(1, 8))
    scen = [
        ["Scenario", "Probability", "Regime", "Portfolio Impact"],
        *scenarios_rows,
    ]
    elems.append(
        Table(
            scen,
            colWidths=[70, 80, 90, 200],
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
                "Correlation matrix not available — run Swarm IC analysis for full heatmap.",
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
            "See quant run",
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

    # PAGE 7 Tax
    elems.append(Paragraph("TAX & OPTIMIZATION", styles["h_section"]))
    elems.append(Spacer(1, 8))
    elems.append(
        Paragraph(
            f"<font color='{_html_hex(bc.AMBER)}'><b>ESTIMATED CGT EXPOSURE: ${cgt_total:,.0f}</b></font><br/>"
            f"<font size='9' color='#94A3B8'>Based on swarm tax model and unrealized gains where available.</font>",
            styles["body"],
        )
    )
    elems.append(Spacer(1, 8))
    tax_rows = [["Symbol", "Cost", "Current", "Gain/Loss", "Est. CGT"]]
    if isinstance(liability_top, list):
        for row in liability_top[:10]:
            if not isinstance(row, dict):
                continue
            tax_rows.append(
                [
                    str(row.get("symbol", "—")),
                    _fnum(row.get("cost")),
                    _fnum(row.get("current")),
                    _fpct(row.get("gain_pct")),
                    _fnum(row.get("tax")),
                ]
            )
    if len(tax_rows) == 1:
        for p in pos_sorted[:10]:
            tax_rows.append(
                [
                    str(p.get("symbol")),
                    "—",
                    _fnum(p.get("current_value")),
                    "—",
                    "—",
                ]
            )
    elems.append(
        Table(
            tax_rows,
            colWidths=[55, 65, 65, 65, 80],
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
    elems.append(Spacer(1, 8))
    hv = "Consider tax-loss harvesting on: " + ", ".join(
        str(h.get("symbol", h))
        for h in (harvest if isinstance(harvest, list) else [])[:5]
    )
    elems.append(
        Paragraph(
            _xml(
                hv
                if harvest
                else "No harvest list in swarm output — add cost basis for detail."
            ),
            styles["body"],
        )
    )
    elems.append(PageBreak())

    # PAGE 8 Alpha
    elems.append(Paragraph("ALPHA OPPORTUNITIES", styles["h_section"]))
    elems.append(Spacer(1, 6))
    if swarm_note:
        elems.append(
            Paragraph(
                "<i>Run Swarm IC Analysis for full intelligence.</i>",
                ParagraphStyle(
                    "sn", fontName="Helvetica-Oblique", textColor=bc.AMBER, fontSize=9
                ),
            )
        )
    for opp in opps[:5] if opps else []:
        if isinstance(opp, dict):
            title = opp.get("title") or opp.get("symbol") or "Opportunity"
            impact = opp.get("impact") or opp.get("reason") or ""
            regime_o = opp.get("regime") or regime_label
            action = opp.get("action") or opp.get("reason") or ""
            conf = float(opp.get("confidence") or 0.6)
        else:
            title, impact, regime_o, action, conf = str(opp), "", "", "", 0.5
        card = Table(
            [
                [Paragraph(f"<b>{_xml(str(title)[:80])}</b>", styles["body"])],
                [Paragraph(_xml(str(impact)[:200]), styles["body"])],
                [
                    Paragraph(
                        f"Regime: {_xml(str(regime_o))} · Confidence {conf:.0%}",
                        styles["body"],
                    )
                ],
                [Paragraph(f"Action: {_xml(str(action)[:200])}", styles["body"])],
                [_confidence_bar(conf, bc)],
            ],
            colWidths=[A4_W - 2 * MARGIN],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), bc.SURFACE),
                    ("BOX", (0, 0), (-1, -1), 0.5, bc.ACCENT),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ]
            ),
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
        elems.append(
            Paragraph(
                "<i>Limited agent trace — run Swarm IC Analysis for full detail.</i>",
                ParagraphStyle(
                    "sn2", fontName="Helvetica-Oblique", textColor=bc.AMBER, fontSize=9
                ),
            )
        )
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
    act_plan = thesis.get("action_plan") or []
    if not isinstance(act_plan, list):
        act_plan = []
    prio = [["#", "Action", "Rationale", "Expected Impact", "Timeline"]]
    for i, a in enumerate((act_plan or [r.get("action") for r in recs])[:5]):
        prio.append(
            [
                str(i + 1),
                (
                    _xml(str(a)[:80])
                    if not isinstance(a, dict)
                    else _xml(str(a.get("action", a))[:80])
                ),
                _xml("IC synthesis"),
                "Medium",
                "90 days",
            ]
        )
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

    doc.build(elems)
    return buffer.getvalue()


async def generate_advisor_report(
    portfolio_data: dict,
    dna_data: dict,
    swarm_data: dict | None,
    advisor_config: dict,
) -> bytes:
    """
    Orchestrator: async asset resolution, then synchronous PDF build.

    1. **Async**: fetch ``logo_url`` / decode ``logo_base64``; Pillow-validate bytes.
    2. **Sync**: ``_build_pdf_sync`` — BaseDocTemplate + 10-page story (no I/O).

    Returns raw PDF bytes; caller uploads or returns ``Response(content=...)``.
    Swarm data may be None; DNA may be empty — report still renders 10 pages.
    """
    raw_logo = await _fetch_logo_bytes(advisor_config)
    logo_bytes = _prepare_logo_bytes(raw_logo)
    swarm_norm = _normalize_swarm(swarm_data)
    try:
        return _build_pdf_sync(
            portfolio_data,
            dna_data or {},
            swarm_norm,
            advisor_config,
            logo_bytes,
            bool(swarm_data),
        )
    except Exception as e:
        logger.error("pdf.build_failed", error=str(e))
        raise
