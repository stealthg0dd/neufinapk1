"""
cross_portfolio_analyzer.py — NeuFin's cross-portfolio hidden concentration detector.

PURPOSE: Detect hidden correlation and concentration risks ACROSS multiple portfolios
held by the same user on different platforms. This is the 'Platform Silo Concentration
Risk' zero-day pattern.

BUSINESS CONTEXT: Most investors hold assets across 3-7 platforms. A client who appears
'balanced' on Platform A may be 90% correlated with their holding on Platform B. No
existing tool detects this.

Public API
----------
analyze_cross_portfolio(user_id, portfolios, market_data) -> dict
"""

from __future__ import annotations

from typing import Any

import numpy as np
import structlog

from database import supabase

logger = structlog.get_logger("neufin.cross_portfolio")

# ── Constants ────────────────────────────────────────────────────────────────
CORRELATION_CLUSTER_THRESHOLD = 0.70  # correlation > this = hidden cluster
PHANTOM_DIVERSIFICATION_THRESHOLD = 0.65  # aggregate correlation > this = phantom
HHI_CONCENTRATED_THRESHOLD = 0.25  # HHI > 0.25 = concentrated (2500 on 10000 scale)


def _safe_float(val: Any, default: float = 0.0) -> float:
    """Safely convert value to float."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


# ── HHI Calculation ──────────────────────────────────────────────────────────


def compute_aggregate_hhi(portfolios: list[dict]) -> tuple[float, dict[str, float]]:
    """
    Compute Herfindahl-Hirschman Index across all portfolios combined.

    Returns:
        (hhi_value, position_weights) where hhi is 0-1 scale and weights are %.
    """
    # Aggregate all positions across portfolios
    aggregated: dict[str, float] = {}

    for portfolio in portfolios:
        positions = portfolio.get("positions", [])
        for pos in positions:
            symbol = str(pos.get("symbol", "")).upper().strip()
            if not symbol:
                continue
            value = _safe_float(pos.get("value"), 0)
            if value > 0:
                aggregated[symbol] = aggregated.get(symbol, 0) + value

    if not aggregated:
        return 0.0, {}

    total_value = sum(aggregated.values())
    if total_value <= 0:
        return 0.0, {}

    # Compute weights as percentages
    weights = {sym: (val / total_value) * 100 for sym, val in aggregated.items()}

    # HHI = sum of squared weight percentages / 10000 (to normalize to 0-1)
    # Or equivalently, sum of squared decimal weights
    hhi = sum((w / 100) ** 2 for w in weights.values())

    return round(hhi, 4), weights


# ── Correlation Matrix ───────────────────────────────────────────────────────


def _get_sector_proxy(symbol: str) -> str:
    """
    Get sector proxy for a symbol. In production, this would use a sector database.
    For now, use common sector mappings.
    """
    # Tech sector
    tech_symbols = {
        "AAPL",
        "MSFT",
        "GOOGL",
        "GOOG",
        "META",
        "AMZN",
        "NVDA",
        "AMD",
        "INTC",
        "CRM",
        "ORCL",
        "ADBE",
        "CSCO",
        "IBM",
        "QCOM",
        "AVGO",
        "TXN",
        "MU",
        "AMAT",
        "NOW",
        "SNOW",
        "PLTR",
        "NET",
        "DDOG",
        "ZS",
        "CRWD",
        "PANW",
        "FTNT",
    }
    # Financials
    fin_symbols = {
        "JPM",
        "BAC",
        "WFC",
        "GS",
        "MS",
        "C",
        "BLK",
        "SCHW",
        "AXP",
        "V",
        "MA",
        "PYPL",
        "SQ",
        "COIN",
        "ICE",
        "CME",
        "SPGI",
        "MCO",
        "FIS",
        "FISV",
    }
    # Healthcare
    health_symbols = {
        "JNJ",
        "UNH",
        "PFE",
        "ABBV",
        "MRK",
        "LLY",
        "TMO",
        "ABT",
        "DHR",
        "BMY",
        "AMGN",
        "GILD",
        "VRTX",
        "REGN",
        "MRNA",
        "BIIB",
        "ISRG",
        "MDT",
        "SYK",
    }
    # Energy
    energy_symbols = {
        "XOM",
        "CVX",
        "COP",
        "EOG",
        "SLB",
        "MPC",
        "PSX",
        "VLO",
        "OXY",
        "DVN",
        "HAL",
        "BKR",
        "FANG",
        "PXD",
        "HES",
        "MRO",
        "APA",
    }
    # Consumer
    consumer_symbols = {
        "WMT",
        "COST",
        "HD",
        "LOW",
        "TGT",
        "NKE",
        "SBUX",
        "MCD",
        "DIS",
        "NFLX",
        "ABNB",
        "BKNG",
        "MAR",
        "HLT",
        "CMG",
        "YUM",
        "DPZ",
        "KO",
        "PEP",
    }
    # Industrials
    industrial_symbols = {
        "CAT",
        "DE",
        "BA",
        "LMT",
        "RTX",
        "GE",
        "HON",
        "UNP",
        "UPS",
        "FDX",
        "MMM",
        "EMR",
        "ETN",
        "PH",
        "ROK",
        "ITW",
    }

    symbol_upper = symbol.upper()

    if symbol_upper in tech_symbols:
        return "technology"
    if symbol_upper in fin_symbols:
        return "financials"
    if symbol_upper in health_symbols:
        return "healthcare"
    if symbol_upper in energy_symbols:
        return "energy"
    if symbol_upper in consumer_symbols:
        return "consumer"
    if symbol_upper in industrial_symbols:
        return "industrials"

    # ETF mappings
    if symbol_upper in {"QQQ", "VGT", "XLK", "ARKK", "TECL"}:
        return "technology"
    if symbol_upper in {"XLF", "VFH", "KRE", "KBE"}:
        return "financials"
    if symbol_upper in {"XLV", "VHT", "IBB", "XBI"}:
        return "healthcare"
    if symbol_upper in {"XLE", "VDE", "OIH", "XOP"}:
        return "energy"
    if symbol_upper in {"XLY", "VCR", "XRT", "XLP", "VDC"}:
        return "consumer"
    if symbol_upper in {"XLI", "VIS", "IYT"}:
        return "industrials"
    if symbol_upper in {"SPY", "VOO", "IVV", "VTI", "ITOT"}:
        return "broad_market"
    if symbol_upper in {"AGG", "BND", "TLT", "IEF", "SHY", "LQD", "HYG"}:
        return "fixed_income"
    if symbol_upper in {"GLD", "SLV", "IAU", "GLDM"}:
        return "commodities"
    if symbol_upper in {"VNQ", "IYR", "XLRE"}:
        return "real_estate"

    return "other"


def _estimate_pairwise_correlation(sym1: str, sym2: str) -> float:
    """
    Estimate correlation between two symbols.
    In production, this would use historical return data.
    For now, use sector-based heuristics.
    """
    if sym1.upper() == sym2.upper():
        return 1.0

    sector1 = _get_sector_proxy(sym1)
    sector2 = _get_sector_proxy(sym2)

    # Same sector = high correlation
    if sector1 == sector2:
        if sector1 == "technology":
            return 0.85  # Tech is highly correlated
        if sector1 == "broad_market":
            return 0.95  # Index funds are very correlated
        if sector1 == "fixed_income":
            return 0.70  # Bonds are moderately correlated
        return 0.75  # Same sector default

    # Cross-sector correlations
    correlation_matrix = {
        ("technology", "consumer"): 0.55,
        ("technology", "financials"): 0.50,
        ("technology", "broad_market"): 0.80,
        ("financials", "broad_market"): 0.75,
        ("energy", "broad_market"): 0.60,
        ("energy", "industrials"): 0.55,
        ("healthcare", "broad_market"): 0.65,
        ("consumer", "broad_market"): 0.70,
        ("fixed_income", "broad_market"): -0.10,  # Negative correlation
        ("fixed_income", "technology"): -0.05,
        ("commodities", "broad_market"): 0.30,
        ("real_estate", "broad_market"): 0.60,
    }

    # Check both orderings
    key1 = (sector1, sector2)
    key2 = (sector2, sector1)

    if key1 in correlation_matrix:
        return correlation_matrix[key1]
    if key2 in correlation_matrix:
        return correlation_matrix[key2]

    # Default cross-sector correlation
    return 0.40


def compute_correlation_matrix(
    aggregated_positions: dict[str, float],
) -> dict[str, dict[str, float]]:
    """
    Compute pairwise correlation matrix for all positions.

    Returns:
        {symbol: {other_symbol: correlation, ...}, ...}
    """
    symbols = list(aggregated_positions.keys())
    matrix: dict[str, dict[str, float]] = {}

    for sym1 in symbols:
        matrix[sym1] = {}
        for sym2 in symbols:
            matrix[sym1][sym2] = round(_estimate_pairwise_correlation(sym1, sym2), 3)

    return matrix


# ── Hidden Cluster Detection ─────────────────────────────────────────────────


def find_hidden_clusters(
    aggregated_positions: dict[str, float],
    correlation_matrix: dict[str, dict[str, float]],
    portfolio_sources: dict[str, list[str]],
) -> list[dict]:
    """
    Identify groups of holdings across different portfolios with high correlation.

    Args:
        aggregated_positions: {symbol: total_value}
        correlation_matrix: {sym1: {sym2: corr}}
        portfolio_sources: {symbol: [portfolio_ids]}

    Returns:
        List of cluster dicts with holdings, correlation, risk impact
    """
    clusters: list[dict] = []
    symbols = list(aggregated_positions.keys())
    visited = set()

    for i, sym1 in enumerate(symbols):
        if sym1 in visited:
            continue

        cluster_symbols = [sym1]
        cluster_sources = set(portfolio_sources.get(sym1, []))

        for sym2 in symbols[i + 1 :]:
            if sym2 in visited:
                continue

            corr = correlation_matrix.get(sym1, {}).get(sym2, 0)
            if corr >= CORRELATION_CLUSTER_THRESHOLD:
                # Check if from different portfolios (hidden correlation)
                sym2_sources = set(portfolio_sources.get(sym2, []))

                if cluster_sources != sym2_sources or len(cluster_sources) > 1:
                    cluster_symbols.append(sym2)
                    cluster_sources.update(sym2_sources)
                    visited.add(sym2)

        if len(cluster_symbols) > 1:
            # Calculate cluster metrics
            total_value = sum(aggregated_positions.get(s, 0) for s in cluster_symbols)
            total_portfolio_value = sum(aggregated_positions.values())
            weight_pct = (
                (total_value / total_portfolio_value * 100)
                if total_portfolio_value > 0
                else 0
            )

            # Average correlation within cluster
            correlations = []
            for j, s1 in enumerate(cluster_symbols):
                for s2 in cluster_symbols[j + 1 :]:
                    correlations.append(correlation_matrix.get(s1, {}).get(s2, 0))

            avg_corr = sum(correlations) / len(correlations) if correlations else 0

            clusters.append(
                {
                    "holdings": cluster_symbols,
                    "source_portfolios": list(cluster_sources),
                    "correlation_score": round(avg_corr, 3),
                    "combined_weight_pct": round(weight_pct, 2),
                    "risk_impact": _assess_cluster_risk(weight_pct, avg_corr),
                    "sector": _get_sector_proxy(cluster_symbols[0]),
                }
            )

        visited.add(sym1)

    # Sort by risk impact
    clusters.sort(key=lambda c: c["combined_weight_pct"], reverse=True)
    return clusters


def _assess_cluster_risk(weight_pct: float, correlation: float) -> str:
    """Assess risk level of a correlated cluster."""
    risk_score = weight_pct * correlation / 10  # 0-10 scale roughly

    if risk_score > 5 or weight_pct > 40:
        return "HIGH"
    if risk_score > 2 or weight_pct > 25:
        return "MEDIUM"
    return "LOW"


# ── Phantom Diversification Detection ────────────────────────────────────────


def detect_phantom_diversification(
    portfolios: list[dict],
    aggregated_positions: dict[str, float],
    correlation_matrix: dict[str, dict[str, float]],
) -> tuple[bool, float, str]:
    """
    Detect if portfolios appear diversified individually but are correlated in aggregate.

    Returns:
        (alert: bool, aggregate_correlation: float, explanation: str)
    """
    if len(portfolios) < 2:
        return False, 0.0, "Single portfolio - cross-portfolio analysis not applicable."

    # Check individual portfolio diversification
    individual_hhis = []
    for portfolio in portfolios:
        positions = portfolio.get("positions", [])
        if not positions:
            continue

        total = sum(_safe_float(p.get("value"), 0) for p in positions)
        if total <= 0:
            continue

        hhi = sum((_safe_float(p.get("value"), 0) / total) ** 2 for p in positions)
        individual_hhis.append(hhi)

    if not individual_hhis:
        return False, 0.0, "No valid portfolios for analysis."

    avg_individual_hhi = sum(individual_hhis) / len(individual_hhis)

    # Compute aggregate weighted correlation
    total_value = sum(aggregated_positions.values())
    if total_value <= 0:
        return False, 0.0, "No position values available."

    weights = {s: v / total_value for s, v in aggregated_positions.items()}
    symbols = list(weights.keys())

    # Portfolio-weighted average correlation
    weighted_corr_sum = 0.0
    weight_sum = 0.0

    for i, sym1 in enumerate(symbols):
        for sym2 in symbols[i + 1 :]:
            w = weights[sym1] * weights[sym2]
            corr = correlation_matrix.get(sym1, {}).get(sym2, 0)
            weighted_corr_sum += w * corr
            weight_sum += w

    aggregate_correlation = weighted_corr_sum / weight_sum if weight_sum > 0 else 0

    # Phantom diversification: individual portfolios look diversified (low HHI)
    # but aggregate correlation is high
    is_phantom = (
        avg_individual_hhi < 0.15  # Individual portfolios appear diversified
        and aggregate_correlation > PHANTOM_DIVERSIFICATION_THRESHOLD
    )

    if is_phantom:
        explanation = (
            f"PHANTOM DIVERSIFICATION DETECTED: Individual portfolios appear well-diversified "
            f"(avg HHI {avg_individual_hhi:.3f}) but aggregate cross-portfolio correlation "
            f"is {aggregate_correlation:.2f}. Effective diversification is illusory."
        )
    elif aggregate_correlation > PHANTOM_DIVERSIFICATION_THRESHOLD:
        explanation = (
            f"High cross-portfolio correlation ({aggregate_correlation:.2f}) detected. "
            f"Consider rebalancing across accounts for true diversification."
        )
    else:
        explanation = (
            f"Cross-portfolio diversification appears genuine. "
            f"Aggregate correlation: {aggregate_correlation:.2f}."
        )

    return is_phantom, round(aggregate_correlation, 3), explanation


# ── Effective Number of Bets ─────────────────────────────────────────────────


def compute_effective_independent_bets(
    aggregated_positions: dict[str, float],
    correlation_matrix: dict[str, dict[str, float]],
) -> int:
    """
    Compute effective number of independent bets (ENB) across all portfolios.

    ENB accounts for correlation - highly correlated positions count as fewer bets.
    Uses a simplified approach based on eigenvalue decomposition proxy.
    """
    if not aggregated_positions:
        return 0

    n = len(aggregated_positions)
    if n == 1:
        return 1

    # Build correlation matrix as numpy array
    symbols = list(aggregated_positions.keys())
    corr_array = np.zeros((n, n))

    for i, sym1 in enumerate(symbols):
        for j, sym2 in enumerate(symbols):
            corr_array[i, j] = correlation_matrix.get(sym1, {}).get(sym2, 0)

    # ENB approximation using average correlation
    # ENB ≈ n / (1 + (n-1) * avg_correlation)
    off_diag_corrs = []
    for i in range(n):
        for j in range(i + 1, n):
            off_diag_corrs.append(abs(corr_array[i, j]))

    avg_corr = sum(off_diag_corrs) / len(off_diag_corrs) if off_diag_corrs else 0

    # ENB formula
    if avg_corr >= 0.99:
        enb = 1
    else:
        enb = n / (1 + (n - 1) * avg_corr)

    return max(1, round(enb))


# ── Narrative Generation ─────────────────────────────────────────────────────


def _generate_concentration_narrative(
    hhi: float,
    hidden_clusters: list[dict],
    phantom_alert: bool,
    enb: int,
    num_positions: int,
) -> str:
    """Generate plain English explanation of cross-portfolio risks."""
    parts = []

    # HHI interpretation
    if hhi > 0.25:
        parts.append(
            f"CONCENTRATED: Cross-portfolio HHI of {hhi:.3f} indicates significant "
            f"concentration risk when all accounts are viewed together."
        )
    elif hhi > 0.15:
        parts.append(
            f"MODERATE CONCENTRATION: Cross-portfolio HHI of {hhi:.3f}. "
            f"Some concentration exists across combined holdings."
        )
    else:
        parts.append(
            f"Well-diversified: Cross-portfolio HHI of {hhi:.3f} suggests "
            f"good diversification across all accounts."
        )

    # Hidden clusters
    if hidden_clusters:
        high_risk = [c for c in hidden_clusters if c["risk_impact"] == "HIGH"]
        if high_risk:
            cluster = high_risk[0]
            parts.append(
                f"HIDDEN CLUSTER ALERT: {', '.join(cluster['holdings'][:3])} "
                f"across different portfolios have {cluster['correlation_score']:.0%} "
                f"correlation, representing {cluster['combined_weight_pct']:.1f}% of total assets."
            )

    # Phantom diversification
    if phantom_alert:
        parts.append(
            "WARNING: Individual portfolios appear diversified but combined holdings "
            "move together. True diversification benefit is lower than it appears."
        )

    # ENB
    if num_positions > 0:
        parts.append(
            f"Effective independent bets: {enb} out of {num_positions} positions. "
            f"Correlation reduces diversification benefit by {max(0, num_positions - enb)} positions."
        )

    return " ".join(parts)


def _generate_recommendation(
    hhi: float,
    hidden_clusters: list[dict],
    phantom_alert: bool,
) -> str:
    """Generate actionable recommendation."""
    recommendations = []

    if hhi > 0.25:
        recommendations.append(
            "Consider rebalancing across accounts to reduce aggregate concentration."
        )

    high_risk_clusters = [c for c in hidden_clusters if c["risk_impact"] == "HIGH"]
    if high_risk_clusters:
        cluster = high_risk_clusters[0]
        recommendations.append(
            f"Review holdings in {cluster['sector']} sector across portfolios. "
            f"Consider reducing overlap between accounts."
        )

    if phantom_alert:
        recommendations.append(
            "Re-evaluate asset allocation holistically across all platforms. "
            "Add uncorrelated assets (bonds, commodities, international) to improve true diversification."
        )

    if not recommendations:
        return "Cross-portfolio diversification is adequate. Continue monitoring."

    return " ".join(recommendations)


# ── Main Entry Point ─────────────────────────────────────────────────────────


def analyze_cross_portfolio(
    user_id: str,
    portfolios: list[dict] | None = None,
    market_data: dict | None = None,
) -> dict[str, Any]:
    """
    Main entry point: analyze cross-portfolio concentration and correlation.

    Args:
        user_id: User identifier
        portfolios: List of portfolio objects (optional, will fetch if None)
        market_data: Current market data (optional, uses heuristics if None)

    Returns:
        Cross-portfolio analysis result
    """
    logger.info("cross_portfolio.analyze", user_id=user_id)

    # Fetch portfolios if not provided
    if portfolios is None:
        portfolios = _fetch_user_portfolios(user_id)

    if not portfolios or len(portfolios) < 2:
        return {
            "aggregate_hhi": None,
            "cross_portfolio_correlation_matrix": {},
            "hidden_clusters": [],
            "phantom_diversification_alert": False,
            "effective_independent_bets": None,
            "concentration_narrative": (
                "Cross-portfolio analysis requires 2+ linked portfolio accounts. "
                "Link additional accounts to enable this analysis."
            ),
            "recommendation": "Link at least one more portfolio account for cross-portfolio analysis.",
            "portfolios_analyzed": len(portfolios) if portfolios else 0,
        }

    # Build aggregated view
    aggregated_positions: dict[str, float] = {}
    portfolio_sources: dict[str, list[str]] = {}

    for portfolio in portfolios:
        pid = portfolio.get("id") or portfolio.get("portfolio_id") or "unknown"
        positions = portfolio.get("positions", [])

        for pos in positions:
            symbol = str(pos.get("symbol", "")).upper().strip()
            if not symbol:
                continue
            value = _safe_float(pos.get("value"), 0)
            if value > 0:
                aggregated_positions[symbol] = (
                    aggregated_positions.get(symbol, 0) + value
                )
                if symbol not in portfolio_sources:
                    portfolio_sources[symbol] = []
                portfolio_sources[symbol].append(pid)

    # Compute metrics
    hhi, weights = compute_aggregate_hhi(portfolios)
    correlation_matrix = compute_correlation_matrix(aggregated_positions)

    hidden_clusters = find_hidden_clusters(
        aggregated_positions, correlation_matrix, portfolio_sources
    )

    phantom_alert, aggregate_corr, phantom_explanation = detect_phantom_diversification(
        portfolios, aggregated_positions, correlation_matrix
    )

    enb = compute_effective_independent_bets(aggregated_positions, correlation_matrix)

    narrative = _generate_concentration_narrative(
        hhi, hidden_clusters, phantom_alert, enb, len(aggregated_positions)
    )

    recommendation = _generate_recommendation(hhi, hidden_clusters, phantom_alert)

    result = {
        "aggregate_hhi": hhi,
        "cross_portfolio_correlation_matrix": correlation_matrix,
        "hidden_clusters": hidden_clusters,
        "phantom_diversification_alert": phantom_alert,
        "phantom_diversification_explanation": phantom_explanation,
        "effective_independent_bets": enb,
        "concentration_narrative": narrative,
        "recommendation": recommendation,
        "portfolios_analyzed": len(portfolios),
        "total_positions": len(aggregated_positions),
        "aggregated_weights": weights,
        "aggregate_correlation": aggregate_corr,
    }

    logger.info(
        "cross_portfolio.result",
        user_id=user_id,
        portfolios=len(portfolios),
        hhi=hhi,
        phantom_alert=phantom_alert,
        enb=enb,
    )

    return result


def _fetch_user_portfolios(user_id: str) -> list[dict]:
    """Fetch all portfolios for a user from database."""
    try:
        portfolios_result = (
            supabase.table("portfolios")
            .select("id, name, platform, created_at")
            .eq("user_id", user_id)
            .execute()
        )

        if not portfolios_result.data:
            return []

        portfolios = []
        for portfolio in portfolios_result.data:
            pid = portfolio.get("id")

            # Fetch positions for this portfolio
            positions_result = (
                supabase.table("positions")
                .select("symbol, shares, value, weight_pct")
                .eq("portfolio_id", pid)
                .execute()
            )

            portfolios.append(
                {
                    "id": pid,
                    "name": portfolio.get("name"),
                    "platform": portfolio.get("platform"),
                    "positions": positions_result.data or [],
                }
            )

        return portfolios

    except Exception as e:
        logger.warning("cross_portfolio.fetch_failed", error=str(e))
        return []
