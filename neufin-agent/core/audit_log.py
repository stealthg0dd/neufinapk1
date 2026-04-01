"""
audit_log.py — SQLite-backed audit trail, agent memory, and scan history.

Tables:
  issues              — detected issues (open / resolved / dismissed)
  fixes               — applied fixes with tsc error counts
  scan_runs           — per-scan metadata for trend analysis
  known_false_positives — patterns dismissed by Varun; suppressed on future scans
  fix_history         — legacy alias kept for backwards compatibility
"""

import uuid
from datetime import datetime, UTC, timedelta
from pathlib import Path

import aiosqlite

DB_PATH = Path(__file__).parent.parent / "agent.db"

# ── Schema ────────────────────────────────────────────────────────────────

_DDL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS issues (
    id            TEXT PRIMARY KEY,
    severity      TEXT NOT NULL,
    type          TEXT NOT NULL,
    file          TEXT,
    line          INTEGER DEFAULT 0,
    message       TEXT,
    suggested_fix TEXT,
    auto_fixable  INTEGER DEFAULT 0,
    requires_human INTEGER DEFAULT 0,
    detected_at   TEXT NOT NULL,
    resolved_at   TEXT,
    resolution    TEXT,   -- auto_fixed | pr_created | dismissed | fix_failed
    repo          TEXT,
    status        TEXT DEFAULT 'open'  -- open | fixed | dismissed
);

CREATE TABLE IF NOT EXISTS fixes (
    id            TEXT PRIMARY KEY,
    issue_id      TEXT REFERENCES issues(id),
    fix_type      TEXT,        -- template | llm_generated | llm_auto | llm_pr | review_pr
    diff          TEXT,
    applied_at    TEXT NOT NULL,
    status        TEXT DEFAULT 'pending',  -- pending | applied | reverted | awaiting_review
    pr_url        TEXT,
    commit_sha    TEXT,
    tsc_before    INTEGER,
    tsc_after     INTEGER,
    method        TEXT,
    success       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scan_runs (
    id              TEXT PRIMARY KEY,
    started_at      TEXT NOT NULL,
    completed_at    TEXT,
    backend_score   INTEGER,
    web_score       INTEGER,
    mobile_score    INTEGER,
    total_issues    INTEGER DEFAULT 0,
    critical_count  INTEGER DEFAULT 0,
    high_count      INTEGER DEFAULT 0,
    medium_count    INTEGER DEFAULT 0,
    low_count       INTEGER DEFAULT 0,
    auto_fixed_count INTEGER DEFAULT 0,
    llm_calls_made  INTEGER DEFAULT 0,
    llm_tokens_used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS known_false_positives (
    id          TEXT PRIMARY KEY,
    pattern     TEXT NOT NULL,   -- regex or substring
    type        TEXT,            -- issue type to scope suppression (NULL = any)
    file_glob   TEXT,            -- file path glob (NULL = any)
    reason      TEXT,
    dismissed_by TEXT DEFAULT 'varun',
    dismissed_at TEXT NOT NULL
);

-- Legacy table kept for backwards compatibility with fix_engine / runtime_monitor
CREATE TABLE IF NOT EXISTS fix_history (
    id        TEXT PRIMARY KEY,
    issue_id  TEXT,
    applied_at TEXT,
    method    TEXT,
    diff      TEXT,
    pr_url    TEXT,
    success   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_issues_status    ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_severity  ON issues(severity);
CREATE INDEX IF NOT EXISTS idx_issues_detected  ON issues(detected_at);
CREATE INDEX IF NOT EXISTS idx_fixes_issue_id   ON fixes(issue_id);
CREATE INDEX IF NOT EXISTS idx_scan_runs_start  ON scan_runs(started_at);
"""


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(_DDL)
        # Schema migrations — idempotent (SQLite raises if column exists)
        for stmt in (
            "ALTER TABLE issues ADD COLUMN root_cause TEXT",
            "ALTER TABLE issues ADD COLUMN root_cause_confidence TEXT DEFAULT 'medium'",
        ):
            try:
                await db.execute(stmt)
            except Exception:
                pass  # column already present
        await db.commit()


async def cache_root_cause(issue_id: str, root_cause: str, confidence: str = "medium") -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE issues SET root_cause = ?, root_cause_confidence = ? WHERE id = ?",
            (root_cause, confidence, issue_id),
        )
        await db.commit()


# ── Issue CRUD ────────────────────────────────────────────────────────────

async def upsert_issues(issues: list[dict]) -> None:
    """Insert or update issues; preserve status if already fixed/dismissed."""
    # Load false positives once per call
    fps = await get_false_positives()

    async with aiosqlite.connect(DB_PATH) as db:
        for issue in issues:
            if _is_false_positive(issue, fps):
                continue
            await db.execute(
                """
                INSERT INTO issues
                    (id, severity, type, file, line, message, suggested_fix,
                     auto_fixable, requires_human, detected_at, repo, status)
                VALUES
                    (:id, :severity, :type, :file, :line, :message, :suggested_fix,
                     :auto_fixable, :requires_human, :detected_at, :repo, 'open')
                ON CONFLICT(id) DO UPDATE SET
                    severity      = excluded.severity,
                    message       = excluded.message,
                    detected_at   = excluded.detected_at,
                    status        = CASE
                                      WHEN issues.status IN ('fixed','dismissed') THEN issues.status
                                      ELSE 'open'
                                    END
                """,
                {
                    "id": issue.get("id") or str(uuid.uuid4()),
                    "severity": issue.get("severity", "medium"),
                    "type": issue.get("type", ""),
                    "file": issue.get("file", ""),
                    "line": issue.get("line", 0),
                    "message": issue.get("message", ""),
                    "suggested_fix": issue.get("suggested_fix", ""),
                    "auto_fixable": int(bool(issue.get("auto_fixable", False))),
                    "requires_human": int(bool(issue.get("requires_human", False))),
                    "detected_at": issue.get("detected_at") or datetime.now(UTC).isoformat(),
                    "repo": issue.get("repo", ""),
                },
            )
        await db.commit()


async def get_open_issues(limit: int = 50) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """
            SELECT * FROM issues
            WHERE status = 'open'
            ORDER BY
                CASE severity
                    WHEN 'critical' THEN 0
                    WHEN 'high'     THEN 1
                    WHEN 'medium'   THEN 2
                    ELSE                 3
                END,
                detected_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [dict(r) for r in await cur.fetchall()]


async def get_issue(issue_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def mark_fixed(issue_id: str, resolution: str = "auto_fixed") -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE issues SET status='fixed', resolved_at=?, resolution=? WHERE id=?",
            (datetime.now(UTC).isoformat(), resolution, issue_id),
        )
        await db.commit()


async def dismiss_issue(issue_id: str, reason: str = "") -> None:
    """Mark a single issue dismissed and optionally record a false-positive pattern."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE issues SET status='dismissed', resolved_at=?, resolution='dismissed' WHERE id=?",
            (datetime.now(UTC).isoformat(), issue_id),
        )
        await db.commit()


# ── Fix history (new schema) ──────────────────────────────────────────────

async def record_fix(
    issue_id: str,
    method: str,
    diff: str,
    pr_url: str,
    success: bool,
    tsc_before: int | None = None,
    tsc_after: int | None = None,
    commit_sha: str = "",
) -> str:
    fix_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    status = "applied" if success else "pending"
    if pr_url:
        status = "awaiting_review"

    async with aiosqlite.connect(DB_PATH) as db:
        # New fixes table
        await db.execute(
            """
            INSERT INTO fixes
                (id, issue_id, fix_type, diff, applied_at, status, pr_url,
                 commit_sha, tsc_before, tsc_after, method, success)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (fix_id, issue_id, method, diff, now, status,
             pr_url, commit_sha, tsc_before, tsc_after, method, int(success)),
        )
        # Legacy fix_history for backwards compat
        await db.execute(
            """
            INSERT INTO fix_history (id, issue_id, applied_at, method, diff, pr_url, success)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), issue_id, now, method, diff, pr_url, int(success)),
        )
        await db.commit()
    return fix_id


async def get_fix_history(limit: int = 100) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM fixes ORDER BY applied_at DESC LIMIT ?", (limit,)
        )
        return [dict(r) for r in await cur.fetchall()]


# ── Scan runs ─────────────────────────────────────────────────────────────

async def begin_scan_run() -> str:
    run_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO scan_runs (id, started_at) VALUES (?, ?)",
            (run_id, datetime.now(UTC).isoformat()),
        )
        await db.commit()
    return run_id


async def complete_scan_run(
    run_id: str,
    scores: dict[str, int],
    counts: dict[str, int],
    auto_fixed: int = 0,
    llm_calls: int = 0,
    llm_tokens: int = 0,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            UPDATE scan_runs SET
                completed_at     = ?,
                backend_score    = ?,
                web_score        = ?,
                mobile_score     = ?,
                total_issues     = ?,
                critical_count   = ?,
                high_count       = ?,
                medium_count     = ?,
                low_count        = ?,
                auto_fixed_count = ?,
                llm_calls_made   = ?,
                llm_tokens_used  = ?
            WHERE id = ?
            """,
            (
                datetime.now(UTC).isoformat(),
                scores.get("neufin-backend"),
                scores.get("neufin-web"),
                scores.get("neufin-mobile"),
                sum(counts.values()),
                counts.get("critical", 0),
                counts.get("high", 0),
                counts.get("medium", 0),
                counts.get("low", 0),
                auto_fixed,
                llm_calls,
                llm_tokens,
                run_id,
            ),
        )
        await db.commit()


async def get_recent_scan_runs(days: int = 7) -> list[dict]:
    since = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM scan_runs WHERE started_at >= ? ORDER BY started_at ASC",
            (since,),
        )
        return [dict(r) for r in await cur.fetchall()]


# ── Health score algorithm ────────────────────────────────────────────────

async def compute_health_score(issues: list[dict], repo: str) -> int:
    """
    Start at 100. Deduct per issue. Apply bonuses.
    Returns 0-100.
    """
    DEDUCTIONS = {"critical": 20, "high": 10, "medium": 5, "low": 2}
    score = 100
    for issue in issues:
        if issue.get("repo") == repo:
            score -= DEDUCTIONS.get(issue.get("severity", "low"), 0)
    score = max(0, score)

    # Bonus: no critical in last 7 days
    since_7d = (datetime.now(UTC) - timedelta(days=7)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            """
            SELECT COUNT(*) as n FROM issues
            WHERE repo = ? AND severity = 'critical' AND detected_at >= ?
            """,
            (repo, since_7d),
        )
        row = await cur.fetchone()
        if row and row[0] == 0:
            score = min(100, score + 5)

        # Bonus: fix rate > 80% in last 7 days
        cur = await db.execute(
            """
            SELECT
                SUM(CASE WHEN status IN ('fixed','dismissed') THEN 1 ELSE 0 END) as resolved,
                COUNT(*) as total
            FROM issues
            WHERE repo = ? AND detected_at >= ?
            """,
            (repo, since_7d),
        )
        row = await cur.fetchone()
        if row and row[1] > 0 and (row[0] / row[1]) > 0.80:
            score = min(100, score + 3)

    return score


# ── False positive / agent memory ─────────────────────────────────────────

async def add_false_positive(
    pattern: str,
    issue_type: str | None = None,
    file_glob: str | None = None,
    reason: str = "",
) -> str:
    fp_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO known_false_positives
                (id, pattern, type, file_glob, reason, dismissed_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (fp_id, pattern, issue_type, file_glob, reason, datetime.now(UTC).isoformat()),
        )
        await db.commit()
    return fp_id


async def get_false_positives() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM known_false_positives")
        return [dict(r) for r in await cur.fetchall()]


def _is_false_positive(issue: dict, fps: list[dict]) -> bool:
    import fnmatch
    import re as _re
    for fp in fps:
        # Type filter
        if fp.get("type") and fp["type"] != issue.get("type"):
            continue
        # File glob filter
        if fp.get("file_glob") and not fnmatch.fnmatch(issue.get("file", ""), fp["file_glob"]):
            continue
        # Pattern match against message
        try:
            if _re.search(fp["pattern"], issue.get("message", "")):
                return True
        except _re.error:
            if fp["pattern"] in issue.get("message", ""):
                return True
    return False


# ── Weekly trend report data ───────────────────────────────────────────────

async def get_weekly_trend() -> dict:
    """
    Aggregate last 7 days of scan_runs to produce trend report data.
    Returns dict ready for notifier.send_weekly_trend().
    """
    runs = await get_recent_scan_runs(days=7)
    if not runs:
        return {"error": "no_scan_data"}

    first = runs[0]
    last = runs[-1]

    def _score_delta(key: str) -> dict:
        start = first.get(key) or 0
        end = last.get(key) or 0
        delta = end - start
        trend = "Improving" if delta > 0 else ("Degrading" if delta < 0 else "Stable")
        return {"start": start, "end": end, "delta": delta, "trend": trend}

    # Most common issue type in the window
    since_7d = (datetime.now(UTC) - timedelta(days=7)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """
            SELECT type, COUNT(*) as n FROM issues
            WHERE detected_at >= ?
            GROUP BY type ORDER BY n DESC LIMIT 1
            """,
            (since_7d,),
        )
        top_type_row = await cur.fetchone()
        top_type = dict(top_type_row) if top_type_row else {"type": "none", "n": 0}

        # Fix success rate
        cur = await db.execute(
            """
            SELECT
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as ok,
                COUNT(*) as total
            FROM fixes WHERE applied_at >= ?
            """,
            (since_7d,),
        )
        fix_row = await cur.fetchone()
        fix_rate = (fix_row["ok"] / fix_row["total"]) if fix_row and fix_row["total"] else 0.0

        # PRs awaiting review
        cur = await db.execute(
            "SELECT COUNT(*) as n FROM fixes WHERE status = 'awaiting_review'"
        )
        pr_row = await cur.fetchone()
        prs_open = pr_row["n"] if pr_row else 0

    # LLM cost estimate: ~$3 per 1M input tokens, ~$15 per 1M output tokens
    # We only track combined tokens — use $6/M as blended average
    total_tokens = sum(r.get("llm_tokens_used") or 0 for r in runs)
    llm_cost_usd = (total_tokens / 1_000_000) * 6.0

    total_auto_fixed = sum(r.get("auto_fixed_count") or 0 for r in runs)

    return {
        "backend": _score_delta("backend_score"),
        "web": _score_delta("web_score"),
        "mobile": _score_delta("mobile_score"),
        "top_issue_type": top_type.get("type", "none"),
        "top_issue_count": top_type.get("n", 0),
        "fix_success_rate": fix_rate,
        "llm_cost_usd": round(llm_cost_usd, 2),
        "total_tokens": total_tokens,
        "prs_open": prs_open,
        "total_auto_fixed": total_auto_fixed,
        "scan_count": len(runs),
    }
