from services.raw_portfolio_normalize import normalize_raw_portfolio


def test_aapl_shares_pattern():
    r = normalize_raw_portfolio("AAPL 25 shares", "US")
    assert r["confidence"] == "HIGH"
    assert len(r["positions"]) == 1
    p = r["positions"][0]
    assert p["ticker"] == "AAPL"
    assert p["quantity"] == 25
    assert p["asset_class"] == "equity"


def test_msft_csv_triple():
    r = normalize_raw_portfolio("MSFT,10,3200", "US")
    assert len(r["positions"]) == 1
    p = r["positions"][0]
    assert p["ticker"] == "MSFT"
    assert p["quantity"] == 10
    assert p["market_value_usd"] == 3200


def test_cash_usd():
    r = normalize_raw_portfolio("cash USD 20000", "US")
    assert len(r["positions"]) == 1
    p = r["positions"][0]
    assert p["asset_class"] == "cash"
    assert p["ticker"] == "USD"
    assert p["quantity"] == 20000


def test_vci_vn():
    r = normalize_raw_portfolio("VCI.VN 500", "VN")
    assert len(r["positions"]) == 1
    p = r["positions"][0]
    assert p["ticker"] == "VCI.VN"
    assert p["quantity"] == 500


def test_tab_separated_no_header():
    r = normalize_raw_portfolio("HPG.VN\t100\t45000", "VN")
    assert len(r["positions"]) == 1
    p = r["positions"][0]
    assert p["ticker"] == "HPG.VN"
    assert p["quantity"] == 100
