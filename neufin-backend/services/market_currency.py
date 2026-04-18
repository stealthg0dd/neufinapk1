"""
Canonical exchange-suffix → ISO 4217 mapping and ticker hints for pricing providers.
"""

from __future__ import annotations

# Maps ticker exchange suffix (uppercase key) → ISO 4217 currency code.
SUFFIX_CURRENCY: dict[str, str] = {
    ".SI": "SGD",
    ".VN": "VND",
    ".KL": "MYR",
    ".BK": "THB",
    ".HK": "HKD",
    ".L": "GBP",
    ".AX": "AUD",
    ".T": "JPY",
    ".SS": "CNY",
    ".SZ": "CNY",
    ".NS": "INR",
    ".BO": "INR",
    ".JK": "IDR",
}

# Yahoo Finance works reliably for these; Polygon US snapshot does not.
INTERNATIONAL_SUFFIXES: tuple[str, ...] = tuple(SUFFIX_CURRENCY.keys())


def infer_native_currency(symbol: str) -> str:
    """
    Infer trading / quote currency from ticker suffix.
    No suffix or unknown suffix → USD (US-listings default).
    """
    u = symbol.upper().strip()
    for suf, cur in SUFFIX_CURRENCY.items():
        if u.endswith(suf):
            return cur
    return "USD"


def is_international_listed(symbol: str) -> bool:
    u = symbol.upper().strip()
    return any(u.endswith(suf) for suf in INTERNATIONAL_SUFFIXES)


def finnhub_symbol(sym: str) -> str:
    """
    Finnhub: US-style class shares BRK.B → BRK-B.
    Regional listings (e.g. HPG.VN, BP.L) keep the dot — converting to HPG-VN breaks quotes.
    """
    u = sym.upper().strip()
    for suf in INTERNATIONAL_SUFFIXES:
        if u.endswith(suf):
            return u
    return sym.replace(".", "-").upper()
