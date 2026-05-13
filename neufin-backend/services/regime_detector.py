from __future__ import annotations

from services.research.regime_detector import get_current_regime_summary


def get_current_regime() -> dict:
    """Canonical regime summary accessor used by runtime services."""
    row = get_current_regime_summary()
    return dict(row) if isinstance(row, dict) else {}
