"""
Neufin White-Label PDF Report Generator
10-page professional layout with custom branding, colors, and Supabase Storage upload.
"""

from __future__ import annotations

import base64
import datetime
import io

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# ── Default brand palette ──────────────────────────────────────────────────────
DEFAULTS = {
    "primary": "#1A56DB",
    "secondary": "#8B5CF6",
    "accent": "#F97316",
    "bg_light": "#F9FAFB",
    "border": "#E5E7EB",
    "text": "#111827",
    "muted": "#6B7280",
}


def _hex(h: str) -> colors.HexColor:
    return colors.HexColor(h)


class BrandColors:
    def __init__(self, scheme: dict | None = None):
        s = {**DEFAULTS, **(scheme or {})}
        self.primary = _hex(s["primary"])
        self.secondary = _hex(s["secondary"])
        self.accent = _hex(s["accent"])
        self.bg_light = _hex(s["bg_light"])
        self.border = _hex(s["border"])
        self.text = _hex(s["text"])
        self.muted = _hex(s["muted"])
        self.white = colors.white
        self.black = colors.black


def _make_styles(bc: BrandColors):
    base = getSampleStyleSheet()

    def ps(name, **kw) -> ParagraphStyle:
        return ParagraphStyle(name, parent=base["Normal"], **kw)

    return {
        "cover_title": ps(
            "CoverTitle",
            fontSize=32,
            textColor=bc.white,
            fontName="Helvetica-Bold",
            alignment=TA_CENTER,
            leading=40,
            spaceAfter=8,
        ),
        "cover_sub": ps(
            "CoverSub",
            fontSize=14,
            textColor=_hex("#93C5FD"),
            alignment=TA_CENTER,
            spaceAfter=6,
        ),
        "cover_meta": ps("CoverMeta", fontSize=11, textColor=_hex("#D1D5DB"), alignment=TA_CENTER),
        "h1": ps(
            "H1",
            fontSize=18,
            textColor=bc.primary,
            fontName="Helvetica-Bold",
            spaceBefore=14,
            spaceAfter=8,
        ),
        "h2": ps(
            "H2",
            fontSize=13,
            textColor=bc.text,
            fontName="Helvetica-Bold",
            spaceBefore=10,
            spaceAfter=5,
        ),
        "body": ps("Body", fontSize=10, textColor=bc.text, leading=16),
        "body_muted": ps("BodyMuted", fontSize=9, textColor=bc.muted, leading=14),
        "bullet": ps(
            "Bullet",
            fontSize=10,
            textColor=bc.text,
            leading=16,
            leftIndent=14,
            bulletIndent=6,
            spaceBefore=3,
        ),
        "score_big": ps(
            "ScoreBig",
            fontSize=48,
            fontName="Helvetica-Bold",
            textColor=bc.primary,
            alignment=TA_CENTER,
        ),
        "center": ps("Center", fontSize=10, textColor=bc.text, alignment=TA_CENTER),
        "footer": ps("Footer", fontSize=7.5, textColor=bc.muted, alignment=TA_CENTER),
        "toc": ps("TOC", fontSize=11, textColor=bc.text, leading=20),
    }


def _colored_table(data, col_widths, bc: BrandColors, header=True) -> Table:
    t = Table(data, colWidths=col_widths)
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.4, bc.border),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), bc.primary),
            ("TEXTCOLOR", (0, 0), (-1, 0), bc.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [bc.bg_light, bc.white]),
        ]
    t.setStyle(TableStyle(style))
    return t


def _bar_row(label: str, pct: float, bc: BrandColors, bar_width: float = 3.5) -> Table:
    """Inline text + colour bar for allocation charts."""
    filled = max(0.01, min(pct / 100, 1)) * bar_width
    inner = Table(
        [[""]],
        colWidths=[filled * inch],
        rowHeights=[0.18 * inch],
    )
    inner.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bc.primary),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return Table(
        [
            [
                Paragraph(label, ParagraphStyle("bl", fontSize=9, textColor=bc.text)),
                inner,
                Paragraph(
                    f"{pct:.1f}%",
                    ParagraphStyle("br", fontSize=9, textColor=bc.muted, alignment=TA_RIGHT),
                ),
            ]
        ],
        colWidths=[1.6 * inch, bar_width * inch, 0.55 * inch],
        rowHeights=[0.28 * inch],
    )


# ── Page header / footer callbacks ────────────────────────────────────────────


def _make_page_callbacks(bc: BrandColors, advisor_name: str, report_date: str, logo_img=None):
    def header(canvas, doc):
        canvas.saveState()
        # Top blue rule
        canvas.setFillColor(bc.primary)
        canvas.rect(0.5 * inch, 10.4 * inch, 7.5 * inch, 0.04 * inch, fill=1, stroke=0)
        # Logo or brand text
        if logo_img:
            try:
                canvas.drawImage(
                    logo_img,
                    0.5 * inch,
                    10.45 * inch,
                    width=1.2 * inch,
                    height=0.38 * inch,
                    preserveAspectRatio=True,
                    mask="auto",
                )
            except Exception:
                canvas.setFont("Helvetica-Bold", 11)
                canvas.setFillColor(bc.primary)
                canvas.drawString(0.5 * inch, 10.45 * inch, "Neufin")
        else:
            canvas.setFont("Helvetica-Bold", 11)
            canvas.setFillColor(bc.primary)
            canvas.drawString(0.5 * inch, 10.45 * inch, "Neufin")
        # Right side
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(bc.muted)
        canvas.drawRightString(8 * inch, 10.45 * inch, f"{advisor_name}  ·  {report_date}")
        canvas.restoreState()

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(bc.border)
        canvas.rect(0.5 * inch, 0.55 * inch, 7.5 * inch, 0.02 * inch, fill=1, stroke=0)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(bc.muted)
        canvas.drawString(
            0.5 * inch,
            0.38 * inch,
            "Neufin AI Report · For informational purposes only · Not financial advice",
        )
        canvas.drawRightString(8 * inch, 0.38 * inch, f"Page {doc.page}")
        canvas.restoreState()

    def cover_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(_hex("#94A3B8"))
        canvas.drawCentredString(
            4.25 * inch,
            0.5 * inch,
            "Confidential · Prepared exclusively for the named advisor",
        )
        canvas.restoreState()

    return header, footer, cover_footer


# ── Main generator ─────────────────────────────────────────────────────────────


def generate_advisor_report(
    portfolio_data: dict,
    analysis: dict,
    advisor_name: str = "Neufin Advisor",
    logo_base64: str | None = None,
    color_scheme: dict | None = None,
) -> bytes:
    """
    Generate a 10-page white-label advisor PDF.
    Returns raw PDF bytes.
    """
    bc = BrandColors(color_scheme)
    S = _make_styles(bc)
    metrics = portfolio_data.get("metrics", {})
    positions = metrics.get("positions", [])
    now = datetime.datetime.utcnow()
    report_date = now.strftime("%B %d, %Y")

    # Decode logo if provided
    logo_img = None
    if logo_base64:
        try:
            logo_bytes = base64.b64decode(logo_base64)
            logo_img = io.BytesIO(logo_bytes)
        except Exception:
            logo_img = None

    buffer = io.BytesIO()

    header_cb, footer_cb, cover_footer_cb = _make_page_callbacks(
        bc, advisor_name, report_date, logo_img
    )

    doc = BaseDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.95 * inch,
        bottomMargin=0.75 * inch,
    )

    # Two templates: cover (no running header) and inner pages
    cover_frame = Frame(0, 0, letter[0], letter[1], id="cover")
    body_frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        letter[0] - doc.leftMargin - doc.rightMargin,
        letter[1] - doc.topMargin - doc.bottomMargin,
        id="body",
    )

    doc.addPageTemplates(
        [
            PageTemplate(id="Cover", frames=[cover_frame], onPage=cover_footer_cb),
            PageTemplate(
                id="Body",
                frames=[body_frame],
                onPage=lambda c, d: (header_cb(c, d), footer_cb(c, d)),
            ),
        ]
    )

    E = []  # elements list

    # ── PAGE 1: Cover ──────────────────────────────────────────────────────────
    E.append(Spacer(1, 2.2 * inch))
    # Dark cover background via canvas (done in page callback is complex — use coloured table instead)
    cover_bg = Table(
        [
            [
                Paragraph("Portfolio Intelligence<br/>Report", S["cover_title"]),
            ]
        ],
        colWidths=[7.7 * inch],
        rowHeights=[1.6 * inch],
    )
    cover_bg.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _hex("#0F172A")),
                ("LEFTPADDING", (0, 0), (-1, -1), 40),
                ("RIGHTPADDING", (0, 0), (-1, -1), 40),
                ("TOPPADDING", (0, 0), (-1, -1), 28),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 28),
            ]
        )
    )
    E.append(cover_bg)
    E.append(Spacer(1, 0.3 * inch))
    E.append(Paragraph(f"Prepared by <b>{advisor_name}</b>", S["cover_sub"]))
    E.append(Paragraph(report_date, S["cover_meta"]))
    E.append(Spacer(1, 0.25 * inch))
    score_val = analysis.get("dna_score", "—")
    investor_type = analysis.get("investor_type", "—")
    E.append(Paragraph(f"DNA Score: <b>{score_val}/100</b>  ·  {investor_type}", S["cover_meta"]))
    E.append(Spacer(1, 1.5 * inch))
    E.append(
        Paragraph(
            "This document is confidential and prepared exclusively for the named financial advisor. "
            "It is for informational purposes only and does not constitute investment advice.",
            ParagraphStyle("CovDiscl", parent=S["body_muted"], alignment=TA_CENTER, fontSize=8),
        )
    )

    # Switch to body template
    E.append(PageBreak())
    E.append(
        Paragraph("__SWITCH_TEMPLATE__", ParagraphStyle("_", fontSize=0.1))
    )  # trigger handled below

    # ── PAGE 2: Table of Contents ──────────────────────────────────────────────
    E.append(Paragraph("Contents", S["h1"]))
    E.append(HRFlowable(width="100%", thickness=0.8, color=bc.primary))
    E.append(Spacer(1, 12))
    toc_items = [
        ("1", "Executive Summary"),
        ("2", "Portfolio Overview"),
        ("3", "Performance & Returns"),
        ("4", "Risk Assessment"),
        ("5", "Sector Allocation"),
        ("6", "AI Analysis — Strengths"),
        ("7", "AI Analysis — Opportunities & Risks"),
        ("8", "Market Outlook & Action Plan"),
        ("9", "Disclaimer"),
    ]
    for num, title in toc_items:
        E.append(Paragraph(f"<b>{num}.</b>  {title}", S["toc"]))
    E.append(PageBreak())

    # ── PAGE 3: Executive Summary ──────────────────────────────────────────────
    E.append(Paragraph("1. Executive Summary", S["h1"]))
    E.append(HRFlowable(width="100%", thickness=0.8, color=bc.primary))
    E.append(Spacer(1, 8))

    # Big score box
    score_tbl = Table(
        [
            [
                Paragraph(str(score_val), S["score_big"]),
                Paragraph(
                    f"<b>Investor Type</b><br/>{investor_type}<br/><br/>"
                    f"<b>Total Value</b><br/>${metrics.get('total_value', 0):,.0f}",
                    S["body"],
                ),
            ]
        ],
        colWidths=[2.8 * inch, 4.5 * inch],
        rowHeights=[1.1 * inch],
    )
    score_tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), _hex("#EFF6FF")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 16),
                ("RIGHTPADDING", (0, 0), (-1, -1), 16),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, bc.border),
            ]
        )
    )
    E.append(score_tbl)
    E.append(Spacer(1, 14))

    summary_rows = [
        ["Metric", "Value", "Metric", "Value"],
        [
            "Total Value",
            f"${metrics.get('total_value', 0):,.0f}",
            "Positions",
            str(metrics.get("num_positions", 0)),
        ],
        [
            "Max Position",
            f"{metrics.get('max_position_pct', 0):.1f}%",
            "Concentration Risk",
            f"{metrics.get('concentration_risk', 0):.1f}",
        ],
        [
            "Diversification",
            f"{metrics.get('diversification_score', 0)}/30",
            "Annualised Vol",
            f"{metrics.get('annualized_volatility', 0):.1f}%",
        ],
    ]
    if metrics.get("pnl_pct") is not None:
        summary_rows.append(["Unrealised P&L", f"{metrics['pnl_pct']:+.2f}%", "", ""])
    E.append(_colored_table(summary_rows, [1.8 * inch, 1.6 * inch, 1.8 * inch, 1.5 * inch], bc))
    E.append(PageBreak())

    # ── PAGE 4: Holdings Overview ──────────────────────────────────────────────
    E.append(Paragraph("2. Portfolio Overview", S["h1"]))
    E.append(HRFlowable(width="100%", thickness=0.8, color=bc.primary))
    E.append(Spacer(1, 10))
    if positions:
        pos_rows = [["Symbol", "Shares", "Price", "Value", "Weight"]]
        for p in positions:
            raw_w = p.get("weight", 0)
            w_pct = raw_w * 100 if raw_w <= 1 else raw_w
            pos_rows.append(
                [
                    p.get("symbol", ""),
                    f"{p.get('shares', 0):,.2f}",
                    f"${p.get('current_price', p.get('price', 0)):,.2f}",
                    f"${p.get('current_value', p.get('value', 0)):,.0f}",
                    f"{w_pct:.1f}%",
                ]
            )
        E.append(
            _colored_table(
                pos_rows,
                [1.1 * inch, 1.2 * inch, 1.3 * inch, 1.5 * inch, 1.1 * inch],
                bc,
            )
        )
    else:
        E.append(Paragraph("No position data available.", S["body_muted"]))
    E.append(PageBreak())

    # ── PAGE 5: Performance Analysis ──────────────────────────────────────────
    E.append(Paragraph("3. Performance & Returns", S["h1"]))
    E.append(HRFlowable(width="100%", thickness=0.8, color=bc.primary))
    E.append(Spacer(1, 10))
    pnl = metrics.get("pnl_pct")
    vol = metrics.get("annualized_volatility", 0)
    E.append(
        Paragraph(
            f"The portfolio has an annualised volatility of <b>{vol:.1f}%</b>, "
            f"reflecting the degree of price variation over the observed period. "
            + (
                f"The unrealised return stands at <b>{pnl:+.2f}%</b> against cost basis."
                if pnl is not None
                else "Cost-basis data was not provided; unrealised P&L cannot be computed."
            ),
            S["body"],
        )
    )
    E.append(Spacer(1, 14))
    perf_rows = [["Metric", "Value", "Interpretation"]]
    perf_rows.append(
        ["Annualised Volatility", f"{vol:.1f}%", "Low < 10% · Med 10-25% · High > 25%"]
    )
    if pnl is not None:
        perf_rows.append(
            [
                "Unrealised P&L",
                f"{pnl:+.2f}%",
                "vs. average cost basis across all positions",
            ]
        )
    perf_rows.append(
        [
            "Max Position Weight",
            f"{metrics.get('max_position_pct', 0):.1f}%",
            "Positions > 15% increase single-stock risk",
        ]
    )
    E.append(_colored_table(perf_rows, [2 * inch, 1.4 * inch, 3.3 * inch], bc))
    E.append(PageBreak())

    # ── PAGE 6: Risk Assessment ────────────────────────────────────────────────
    E.append(Paragraph("4. Risk Assessment", S["h1"]))
    E.append(HRFlowable(width="100%", thickness=0.8, color=bc.primary))
    E.append(Spacer(1, 10))
    risk_text = analysis.get(
        "risk_assessment",
        "A comprehensive risk assessment requires additional market data including beta, "
        "correlation matrices, and sector exposure. The key risk indicators available are "
        "summarised in the performance section.",
    )
    E.append(Paragraph(risk_text, S["body"]))
    E.append(Spacer(1, 14))
    # Concentration risk visual bars
    if positions:
        E.append(Paragraph("Position Concentration", S["h2"]))
        E.append(Spacer(1, 6))
        for p in sorted(positions, key=lambda x: x.get("weight", 0), reverse=True)[:8]:
            raw_w = p.get("weight", 0)
            w_pct = raw_w * 100 if raw_w <= 1 else raw_w
            bar = _bar_row(p.get("symbol", ""), w_pct, bc)
            E.append(bar)
            E.append(Spacer(1, 3))
    E.append(PageBreak())

    # ── PAGE 7: Sector Allocation ──────────────────────────────────────────────
    SECTOR_MAP = {
        "AAPL": "Technology",
        "MSFT": "Technology",
        "GOOGL": "Technology",
        "GOOG": "Technology",
        "META": "Technology",
        "NVDA": "Technology",
        "AMD": "Technology",
        "TSLA": "Consumer Disc.",
        "AMZN": "Consumer Disc.",
        "NFLX": "Comm. Services",
        "JPM": "Financials",
        "BAC": "Financials",
        "GS": "Financials",
        "MS": "Financials",
        "V": "Financials",
        "MA": "Financials",
        "JNJ": "Healthcare",
        "PFE": "Healthcare",
        "UNH": "Healthcare",
        "MRK": "Healthcare",
        "XOM": "Energy",
        "CVX": "Energy",
        "COP": "Energy",
        "WMT": "Consumer Staples",
        "COST": "Consumer Staples",
    }
    sectors: dict[str, float] = {}
    for p in positions:
        sym = p.get("symbol", "").upper()
        raw_w = p.get("weight", 0)
        w_pct = raw_w * 100 if raw_w <= 1 else raw_w
        s = SECTOR_MAP.get(sym, "Other")
        sectors[s] = sectors.get(s, 0) + w_pct

    E.append(Paragraph("5. Sector Allocation", S["h1"]))
    E.append(HRFlowable(width="100%", thickness=0.8, color=bc.primary))
    E.append(Spacer(1, 10))
    if sectors:
        sec_rows = [["Sector", "Allocation %", "Assessment"]]
        for sec, pct in sorted(sectors.items(), key=lambda x: -x[1]):
            note = "Overweight (>30%)" if pct > 30 else "Moderate" if pct > 15 else "Low exposure"
            sec_rows.append([sec, f"{pct:.1f}%", note])
        E.append(_colored_table(sec_rows, [2.4 * inch, 1.5 * inch, 2.8 * inch], bc))
        E.append(Spacer(1, 14))
        for sec, pct in sorted(sectors.items(), key=lambda x: -x[1])[:6]:
            E.append(_bar_row(sec, pct, bc, bar_width=3.0))
            E.append(Spacer(1, 4))
    E.append(PageBreak())

    # ── PAGE 8: AI Strengths ───────────────────────────────────────────────────
    E.append(Paragraph("6. AI Analysis — Strengths", S["h1"]))
    E.append(HRFlowable(width="100%", thickness=0.8, color=bc.primary))
    E.append(Spacer(1, 10))
    E.append(
        Paragraph(
            "The following strengths were identified through multi-model AI analysis of the portfolio "
            "composition, risk profile, and behavioural finance indicators.",
            S["body"],
        )
    )
    E.append(Spacer(1, 12))
    for i, strength in enumerate(analysis.get("strengths", []), 1):
        blk = Table(
            [
                [
                    Paragraph(f"<b>{i}</b>", S["center"]),
                    Paragraph(f"<b>{strength}</b>", S["body"]),
                ]
            ],
            colWidths=[0.4 * inch, 6.8 * inch],
            rowHeights=[0.36 * inch],
        )
        blk.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, 0), bc.primary),
                    ("TEXTCOLOR", (0, 0), (0, 0), bc.white),
                    ("ALIGN", (0, 0), (0, 0), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("BACKGROUND", (1, 0), (1, 0), _hex("#EFF6FF")),
                    ("BOX", (0, 0), (-1, -1), 0.5, bc.border),
                ]
            )
        )
        E.append(blk)
        E.append(Spacer(1, 8))
    E.append(PageBreak())

    # ── PAGE 9: AI Weaknesses & Opportunities ─────────────────────────────────
    E.append(Paragraph("7. Opportunities & Risk Factors", S["h1"]))
    E.append(HRFlowable(width="100%", thickness=0.8, color=bc.primary))
    E.append(Spacer(1, 10))
    E.append(
        Paragraph(
            "Areas requiring attention or presenting opportunities for improvement:",
            S["body"],
        )
    )
    E.append(Spacer(1, 12))
    for w in analysis.get("weaknesses", []):
        E.append(Paragraph(f"⚠  {w}", S["bullet"]))
        E.append(Spacer(1, 6))
    E.append(Spacer(1, 14))
    E.append(Paragraph("Key Recommendation", S["h2"]))
    rec_tbl = Table(
        [[Paragraph(analysis.get("recommendation", ""), S["body"])]],
        colWidths=[7.2 * inch],
    )
    rec_tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _hex("#EFF6FF")),
                ("BOX", (0, 0), (-1, -1), 1.2, bc.primary),
                ("LEFTPADDING", (0, 0), (-1, -1), 16),
                ("RIGHTPADDING", (0, 0), (-1, -1), 16),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    E.append(rec_tbl)
    E.append(PageBreak())

    # ── PAGE 10: Market Outlook + Action Items ─────────────────────────────────
    E.append(Paragraph("8. Market Outlook & Action Plan", S["h1"]))
    E.append(HRFlowable(width="100%", thickness=0.8, color=bc.primary))
    E.append(Spacer(1, 10))
    outlook = analysis.get(
        "market_outlook",
        "Market conditions and portfolio positioning should be reviewed regularly. "
        "Consider the current macroeconomic environment when evaluating concentration risk.",
    )
    E.append(Paragraph(outlook, S["body"]))
    E.append(Spacer(1, 14))
    E.append(Paragraph("Recommended Action Items", S["h2"]))
    E.append(Spacer(1, 6))
    for i, action in enumerate(analysis.get("action_items", []), 1):
        row = Table(
            [[Paragraph(f"<b>{i}</b>", S["center"]), Paragraph(action, S["body"])]],
            colWidths=[0.4 * inch, 6.8 * inch],
            rowHeights=[0.34 * inch],
        )
        row.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, 0), bc.secondary),
                    ("TEXTCOLOR", (0, 0), (0, 0), bc.white),
                    ("ALIGN", (0, 0), (0, 0), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("BOX", (0, 0), (-1, -1), 0.4, bc.border),
                ]
            )
        )
        E.append(row)
        E.append(Spacer(1, 7))
    E.append(PageBreak())

    # ── PAGE 11 (appended): Disclaimer ────────────────────────────────────────
    E.append(Paragraph("9. Disclaimer", S["h1"]))
    E.append(HRFlowable(width="100%", thickness=0.8, color=bc.primary))
    E.append(Spacer(1, 10))
    disclaimer_paragraphs = [
        "This report has been generated by Neufin AI and is provided for informational purposes "
        "only. It does not constitute financial, investment, legal, or tax advice.",
        "The information contained herein is based on data provided by the user and publicly "
        "available market data. Neufin makes no representations or warranties, express or implied, "
        "as to the accuracy, completeness, or fitness for any particular purpose.",
        "Past performance is not indicative of future results. All investments involve risk, "
        "including the possible loss of principal. Portfolio values shown are based on market "
        "prices at the time of report generation and may not reflect current values.",
        "This report is prepared exclusively for the named advisor and their authorised clients. "
        "Redistribution without the advisor's written consent is prohibited.",
        f"Report generated: {report_date}. Powered by Neufin AI (Claude · Gemini · GPT-4).",
    ]
    for para in disclaimer_paragraphs:
        E.append(Paragraph(para, S["body_muted"]))
        E.append(Spacer(1, 10))

    # ── Build ──────────────────────────────────────────────────────────────────
    # Switch page template after cover
    # We need to inject the template switch — use the NextPageTemplate flowable
    from reportlab.platypus import NextPageTemplate

    final_elements = []
    switched = False
    for el in E:
        if isinstance(el, Paragraph) and el.text == "__SWITCH_TEMPLATE__":
            final_elements.append(NextPageTemplate("Body"))
            switched = True
            continue
        final_elements.append(el)
    if not switched:
        final_elements.insert(0, NextPageTemplate("Body"))

    doc.build(final_elements)
    return buffer.getvalue()
