"""
In-process HTTP request samples for admin/system observability.

Stores (wall_time, duration_ms, status_code, path) in a bounded deque.
Not durable across restarts and not cross-worker — good enough for p50/p95/p99
and error-rate hints on a single Railway instance or per-worker view.
"""

from __future__ import annotations

import threading
import time
from collections import deque

_MAX_SAMPLES = 12_000
_buf: deque[tuple[float, float, int, str]] = deque(maxlen=_MAX_SAMPLES)
_lock = threading.Lock()


def record_http_sample(
    *,
    duration_ms: float,
    status_code: int,
    path: str,
) -> None:
    """Record one completed request (best-effort, never raises)."""
    try:
        now = time.time()
        with _lock:
            _buf.append((now, float(duration_ms), int(status_code), path))
    except Exception:
        # Intentionally silent — metrics must never break requests.
        return


def _percentile(sorted_vals: list[float], p: float) -> float | None:
    if not sorted_vals:
        return None
    n = len(sorted_vals)
    if n == 1:
        return round(sorted_vals[0], 1)
    pos = (n - 1) * p
    lo = int(pos)
    hi = min(lo + 1, n - 1)
    if lo == hi:
        return round(sorted_vals[lo], 1)
    frac = pos - lo
    return round(sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * frac, 1)


def http_stats_last_hours(hours: float = 24.0) -> dict[str, float | int | None]:
    cutoff = time.time() - hours * 3600.0
    with _lock:
        samples = [s for s in _buf if s[0] >= cutoff]
    if not samples:
        return {
            "sample_count": 0,
            "p50_ms": None,
            "p95_ms": None,
            "p99_ms": None,
            "error_rate_pct": None,
        }
    durs = sorted(s[1] for s in samples)
    errs = sum(1 for s in samples if s[2] >= 500)
    n = len(samples)
    return {
        "sample_count": n,
        "p50_ms": _percentile(durs, 0.50),
        "p95_ms": _percentile(durs, 0.95),
        "p99_ms": _percentile(durs, 0.99),
        "error_rate_pct": round(errs / n * 100.0, 2) if n else None,
    }
