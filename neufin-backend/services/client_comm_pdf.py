"""Minimal client-facing PDF (1-2 pages) from plain text — no swarm/quant tables."""

from __future__ import annotations

import io
from html import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def build_client_summary_pdf_bytes(
    title: str,
    body: str,
    disclaimer: str,
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title=title[:120],
    )
    styles = getSampleStyleSheet()
    h = ParagraphStyle(
        "H",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=14,
        textColor=colors.HexColor("#0B5561"),
    )
    p = ParagraphStyle(
        "P",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
        spaceAfter=10,
    )
    small = ParagraphStyle(
        "S",
        parent=styles["BodyText"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748B"),
    )
    story: list = [Paragraph(escape(title), h), Spacer(1, 0.15 * inch)]
    chunks = [c.strip() for c in body.split("\n\n") if c.strip()]
    if not chunks:
        chunks = [body.strip() or "—"]
    for block in chunks[:24]:
        safe = escape(block).replace("\n", "<br/>")
        story.append(Paragraph(safe, p))
    story.append(Spacer(1, 0.25 * inch))
    story.append(Paragraph(escape(disclaimer), small))
    doc.build(story)
    return buf.getvalue()
