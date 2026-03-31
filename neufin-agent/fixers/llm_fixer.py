"""
llm_fixer.py — Call Claude only for severity >= high AND auto_fixable=True.

Returns a structured LLMFixResult with root cause, diff, test command, risk level,
and a flag indicating whether human review is required.

Token budget: max 1000 tokens. Prompt is deliberately minimal.
"""

import logging
import os
import re
from pathlib import Path
from typing import TypedDict

import anthropic

REPO_ROOT = Path(__file__).parent.parent.parent
log = logging.getLogger("neufin-agent.llm_fixer")

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 1000
CONTEXT_LINES = 15

SYSTEM_PROMPT = (
    "You are a senior staff engineer at Meta reviewing Neufin (FastAPI + Next.js + Expo). "
    "You receive a bug report. Respond ONLY with:\n"
    "1. ROOT_CAUSE: one sentence\n"
    "2. FIX: exact code change (diff format)\n"
    "3. TEST: one command to verify fix\n"
    "4. RISK: low/medium/high\n"
    "If RISK is high, end response with REQUIRES_HUMAN_REVIEW.\n"
    "Never write more than 200 tokens. Be surgical."
)


class LLMFixResult(TypedDict):
    diff: str
    root_cause: str
    test_cmd: str
    risk: str           # low | medium | high
    requires_human: bool
    method: str
    tokens_used: int


def _read_context(issue: dict) -> str:
    file_path = REPO_ROOT / issue.get("file", "")
    if not file_path.exists():
        return "(file not found)"
    try:
        lines = file_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return "(unreadable)"
    lineno = int(issue.get("line", 1))
    start = max(0, lineno - CONTEXT_LINES - 1)
    end = min(len(lines), lineno + CONTEXT_LINES)
    return "\n".join(f"{i + 1}: {line}" for i, line in enumerate(lines[start:end], start=start))


def _parse_response(text: str) -> tuple[str, str, str, str, bool]:
    """Extract (root_cause, diff, test_cmd, risk, requires_human) from LLM output."""

    def _section(label: str) -> str:
        m = re.search(rf"{label}:\s*(.+?)(?=\n[1-9A-Z]|\Z)", text, re.DOTALL | re.IGNORECASE)
        return m.group(1).strip() if m else ""

    root_cause = _section("ROOT_CAUSE")
    test_cmd = _section("TEST")
    risk_raw = _section("RISK").lower()
    risk = "high" if "high" in risk_raw else ("medium" if "medium" in risk_raw else "low")
    requires_human = "REQUIRES_HUMAN_REVIEW" in text or risk == "high"

    # Extract diff block
    diff_m = re.search(r"(---\s+a/.+?)(?=\n[1-9]\.|\n[A-Z_]+:|\Z)", text, re.DOTALL)
    diff = diff_m.group(1).strip() if diff_m else _section("FIX")

    return root_cause, diff, test_cmd, risk, requires_human


async def generate_fix(issue: dict) -> LLMFixResult:
    """
    Generate a fix for an issue using Claude.

    Only called when severity >= high AND auto_fixable=True.
    Raises anthropic.APIError on network/auth failure.
    """
    sev = issue.get("severity", "low")
    if sev not in ("critical", "high"):
        raise ValueError(f"generate_fix called for low-severity issue {issue.get('id')} — skipped")

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    context = _read_context(issue)

    user_msg = (
        f"Bug report:\n"
        f"  file:     {issue.get('file')}\n"
        f"  line:     {issue.get('line')}\n"
        f"  type:     {issue.get('type')}\n"
        f"  severity: {sev}\n"
        f"  message:  {issue.get('message')}\n"
        f"  hint:     {issue.get('suggested_fix')}\n\n"
        f"Code context:\n{context}"
    )

    message = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = message.content[0].text.strip()
    tokens = message.usage.input_tokens + message.usage.output_tokens
    root_cause, diff, test_cmd, risk, requires_human = _parse_response(raw)

    log.info({
        "action": "llm_fix_generated",
        "issue_id": issue.get("id"),
        "tokens": tokens,
        "risk": risk,
        "requires_human": requires_human,
    })

    return LLMFixResult(
        diff=diff,
        root_cause=root_cause,
        test_cmd=test_cmd,
        risk=risk,
        requires_human=requires_human,
        method="llm",
        tokens_used=tokens,
    )
