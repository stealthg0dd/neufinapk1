"""# SEA-TICKER-FIX: MarketResolver unit tests."""

from services.market_resolver import resolve_security


def test_hpg_vn_vnd_hose_bucket():
    m = resolve_security("HPG.VN")
    assert m.native_currency == "VND"
    assert m.market == "VN"
    assert m.provider_ticker == "HPG.VN"
    assert m.benchmark == "^VNINDEX"
    assert not m.is_index


def test_vnindex_alias_to_caret():
    m = resolve_security("VNINDEX")
    assert m.normalized_symbol == "^VNINDEX"
    assert m.is_index
    assert m.native_currency == "VND"


def test_vod_l_gbp():
    m = resolve_security("VOD.L")
    assert m.native_currency == "GBP"
    assert m.market == "LSE"
    assert m.benchmark == "^FTSE"


def test_us_unchanged():
    m = resolve_security("AAPL")
    assert m.native_currency == "USD"
    assert m.market == "US"
    assert m.provider_ticker == "AAPL"
