"""# SEA-NATIVE-TICKER-FIX: MarketResolver unit tests — VN, UK, SEA, mixed, unresolved."""

from services.market_resolver import (
    BENCHMARK_LABELS,
    portfolio_dominant_benchmark,
    portfolio_market_framing,
    resolve_security,
)

# ── Vietnam equities ───────────────────────────────────────────────────────────

def test_hpg_vn_vnd_hose_bucket():
    m = resolve_security("HPG.VN")
    assert m.native_currency == "VND"
    assert m.market == "VN"
    assert m.provider_ticker == "HPG.VN"
    assert m.benchmark == "^VNINDEX"
    assert not m.is_index


def test_mbb_vn():
    m = resolve_security("MBB.VN")
    assert m.native_currency == "VND"
    assert m.benchmark == "^VNINDEX"


def test_ssi_vn():
    m = resolve_security("SSI.VN")
    assert m.native_currency == "VND"
    assert m.market == "VN"


def test_vci_vn():
    m = resolve_security("VCI.VN")
    assert m.benchmark == "^VNINDEX"


def test_vpb_vn():
    m = resolve_security("VPB.VN")
    assert m.native_currency == "VND"
    assert not m.is_index


def test_lcg_vn():
    m = resolve_security("LCG.VN")
    assert m.native_currency == "VND"
    assert m.benchmark == "^VNINDEX"


# ── VN indices ─────────────────────────────────────────────────────────────────

def test_vnindex_alias_to_caret():
    m = resolve_security("VNINDEX")
    assert m.normalized_symbol == "^VNINDEX"
    assert m.is_index
    assert m.native_currency == "VND"
    assert m.benchmark == "^VNINDEX"


def test_caret_vnindex_direct():
    m = resolve_security("^VNINDEX")
    assert m.normalized_symbol == "^VNINDEX"
    assert m.native_currency == "VND"
    assert m.is_index


def test_caret_vn30_vnd():
    m = resolve_security("^VN30")
    assert m.native_currency == "VND"
    assert m.is_index


def test_vn30_alias():
    m = resolve_security("VN30")
    assert m.normalized_symbol == "^VN30"
    assert m.native_currency == "VND"


# ── UK / FTSE ──────────────────────────────────────────────────────────────────

def test_vod_l_gbp():
    m = resolve_security("VOD.L")
    assert m.native_currency == "GBP"
    assert m.market == "LSE"
    assert m.benchmark == "^FTSE"


def test_bp_l():
    m = resolve_security("BP.L")
    assert m.native_currency == "GBP"
    assert m.benchmark == "^FTSE"


def test_ftse_index_gbp():
    m = resolve_security("FTSE100")
    assert m.normalized_symbol == "^FTSE"
    assert m.native_currency == "GBP"
    assert m.benchmark == "^FTSE"


def test_caret_ftse_direct():
    m = resolve_security("^FTSE")
    assert m.native_currency == "GBP"
    assert m.is_index


# ── US equities (must remain unchanged) ───────────────────────────────────────

def test_us_unchanged():
    m = resolve_security("AAPL")
    assert m.native_currency == "USD"
    assert m.market == "US"
    assert m.provider_ticker == "AAPL"
    assert m.benchmark == "^GSPC"


def test_brk_b_us():
    m = resolve_security("BRK-B")
    assert m.native_currency == "USD"
    assert m.market == "US"


def test_sp500_index():
    m = resolve_security("^GSPC")
    assert m.native_currency == "USD"
    assert m.is_index


# ── Indonesia (.JK) ────────────────────────────────────────────────────────────

def test_bbca_jk_idr():
    m = resolve_security("BBCA.JK")
    assert m.native_currency == "IDR"
    assert m.market == "JK"
    assert m.benchmark == "^JKSE"
    assert not m.is_index


def test_jkse_index_alias():
    m = resolve_security("JKSE")
    assert m.normalized_symbol == "^JKSE"
    assert m.native_currency == "IDR"
    assert m.is_index


def test_jci_alias():
    m = resolve_security("JCI")
    assert m.normalized_symbol == "^JKSE"
    assert m.native_currency == "IDR"


# ── Thailand (.BK) ─────────────────────────────────────────────────────────────

def test_ptt_bk_thb():
    m = resolve_security("PTT.BK")
    assert m.native_currency == "THB"
    assert m.market == "BK"
    assert m.benchmark == "^SET.BK"


def test_set_index_alias():
    m = resolve_security("SET")
    assert m.normalized_symbol == "^SET.BK"
    assert m.native_currency == "THB"
    assert m.is_index


# ── Malaysia (.KL) ─────────────────────────────────────────────────────────────

def test_maybank_kl_myr():
    m = resolve_security("1155.KL")
    assert m.native_currency == "MYR"
    assert m.market == "KL"
    assert m.benchmark == "^KLSE"


def test_klci_alias():
    m = resolve_security("KLCI")
    assert m.normalized_symbol == "^KLSE"
    assert m.native_currency == "MYR"


# ── Singapore (.SI) ────────────────────────────────────────────────────────────

def test_dbs_si_sgd():
    m = resolve_security("D05.SI")
    assert m.native_currency == "SGD"
    assert m.market == "SG"
    assert m.benchmark == "^STI"


def test_sti_alias():
    m = resolve_security("STI")
    assert m.normalized_symbol == "^STI"
    assert m.native_currency == "SGD"
    assert m.is_index


# ── portfolio_dominant_benchmark() ─────────────────────────────────────────────

def test_all_vn_benchmark():
    syms = ["HPG.VN", "MBB.VN", "SSI.VN", "VCI.VN", "VPB.VN"]
    assert portfolio_dominant_benchmark(syms) == "^VNINDEX"


def test_all_us_benchmark():
    syms = ["AAPL", "MSFT", "NVDA", "GOOG"]
    assert portfolio_dominant_benchmark(syms) == "^GSPC"


def test_uk_benchmark():
    syms = ["VOD.L", "BP.L", "SHEL.L"]
    assert portfolio_dominant_benchmark(syms) == "^FTSE"


def test_indonesia_benchmark():
    syms = ["BBCA.JK", "TLKM.JK", "BMRI.JK"]
    assert portfolio_dominant_benchmark(syms) == "^JKSE"


def test_thailand_benchmark():
    syms = ["PTT.BK", "KBANK.BK"]
    assert portfolio_dominant_benchmark(syms) == "^SET.BK"


def test_mixed_vn_us_prefers_vnindex():
    # 3 VN vs 2 US — VN wins
    syms = ["HPG.VN", "MBB.VN", "SSI.VN", "AAPL", "MSFT"]
    assert portfolio_dominant_benchmark(syms) == "^VNINDEX"


def test_mixed_vn_us_tie_prefers_local():
    # 2 VN vs 2 US — local benchmark preferred over ^GSPC on tie
    syms = ["HPG.VN", "MBB.VN", "AAPL", "MSFT"]
    result = portfolio_dominant_benchmark(syms)
    assert result == "^VNINDEX"  # non-GSPC wins on tie


def test_empty_symbols_returns_gspc():
    assert portfolio_dominant_benchmark([]) == "^GSPC"


# ── portfolio_market_framing() ─────────────────────────────────────────────────

def test_framing_vn_portfolio():
    framing = portfolio_market_framing(["HPG.VN", "MBB.VN", "SSI.VN"])
    assert framing["benchmark"] == "^VNINDEX"
    assert framing["native_currency"] == "VND"
    assert framing["is_sea"] is True
    assert "Vietnam" in framing["market_context"]


def test_framing_us_portfolio():
    framing = portfolio_market_framing(["AAPL", "MSFT", "NVDA"])
    assert framing["benchmark"] == "^GSPC"
    assert framing["native_currency"] == "USD"
    assert framing["is_sea"] is False


def test_framing_uk_portfolio():
    framing = portfolio_market_framing(["VOD.L", "BP.L"])
    assert framing["benchmark"] == "^FTSE"
    assert framing["native_currency"] == "GBP"
    assert framing["is_sea"] is False


def test_framing_singapore_portfolio():
    framing = portfolio_market_framing(["D05.SI", "Z74.SI"])
    assert framing["benchmark"] == "^STI"
    assert framing["native_currency"] == "SGD"
    assert framing["is_sea"] is True


# ── BENCHMARK_LABELS coverage ──────────────────────────────────────────────────

def test_benchmark_labels_vn():
    assert BENCHMARK_LABELS["^VNINDEX"] == "VN-Index"


def test_benchmark_labels_ftse():
    assert BENCHMARK_LABELS["^FTSE"] == "FTSE 100"


def test_benchmark_labels_jkse():
    assert BENCHMARK_LABELS["^JKSE"] == "IDX Composite"


def test_benchmark_labels_set():
    assert BENCHMARK_LABELS["^SET.BK"] == "SET Index"


def test_benchmark_labels_klse():
    assert BENCHMARK_LABELS["^KLSE"] == "FBM KLCI"


def test_benchmark_labels_sti():
    assert BENCHMARK_LABELS["^STI"] == "Straits Times Index"


# ── Unresolved / unknown symbols don't crash ──────────────────────────────────

def test_unknown_symbol_defaults_us():
    m = resolve_security("XYZUNK")
    assert m.market == "US"
    assert m.native_currency == "USD"
    assert m.benchmark == "^GSPC"


def test_portfolio_benchmark_survives_bad_symbols():
    # Should not raise, should return a valid benchmark
    result = portfolio_dominant_benchmark(["AAPL", "???INVALID???", "HPG.VN"])
    assert result in {"^GSPC", "^VNINDEX"}


# ── Case insensitivity ─────────────────────────────────────────────────────────

def test_lowercase_vn_ticker():
    m = resolve_security("hpg.vn")
    assert m.native_currency == "VND"
    assert m.benchmark == "^VNINDEX"


def test_mixed_case_index():
    m = resolve_security("vnindex")
    assert m.normalized_symbol == "^VNINDEX"
    assert m.native_currency == "VND"
