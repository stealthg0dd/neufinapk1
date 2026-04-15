export type TickerItem = {
  symbol: string;
  price: number;
  changePct: number;
};

const SYMBOLS = [
  "AAPL",
  "GOOGL",
  "MSFT",
  "TSLA",
  "NVDA",
  "META",
  "AMZN",
  "NFLX",
  "BABA",
  "BRK.B",
  "JPM",
  "GS",
] as const;

const MOCK: TickerItem[] = [
  { symbol: "AAPL", price: 224.18, changePct: 0.62 },
  { symbol: "GOOGL", price: 184.72, changePct: -0.41 },
  { symbol: "MSFT", price: 468.55, changePct: 0.33 },
  { symbol: "TSLA", price: 182.04, changePct: -1.12 },
  { symbol: "NVDA", price: 129.27, changePct: 1.84 },
  { symbol: "META", price: 572.11, changePct: 0.27 },
  { symbol: "AMZN", price: 191.66, changePct: -0.19 },
  { symbol: "NFLX", price: 976.5, changePct: 0.88 },
  { symbol: "BABA", price: 78.42, changePct: -0.73 },
  { symbol: "BRK.B", price: 427.12, changePct: 0.11 },
  { symbol: "JPM", price: 208.64, changePct: -0.21 },
  { symbol: "GS", price: 420.33, changePct: 0.49 },
];

function parseNumber(raw: unknown): number | null {
  const n =
    typeof raw === "number" ? raw : Number(String(raw).replace(/[%,$\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function fetchGlobalQuote(
  symbol: string,
  apiKey: string,
): Promise<TickerItem | null> {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    symbol,
  )}&apikey=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      // Cache per-symbol for 5 minutes to avoid rate limiting.
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (data.Note || data.Information) return null;

    const quote = (data["Global Quote"] ??
      data["Global quote"] ??
      null) as Record<string, unknown> | null;
    if (!quote) return null;

    const price = parseNumber(quote["05. price"]);
    const changePctRaw = quote["10. change percent"];
    const changePct = parseNumber(changePctRaw);
    const sym = String(quote["01. symbol"] ?? symbol).trim();

    if (price == null || changePct == null) return null;
    return { symbol: sym, price, changePct };
  } catch {
    return null;
  }
}

export async function getLandingTickers(): Promise<TickerItem[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY?.trim();
  if (!apiKey) return MOCK;

  const settled = await Promise.allSettled(
    SYMBOLS.map((s) => fetchGlobalQuote(s, apiKey)),
  );
  const items = settled
    .map((r, idx) => (r.status === "fulfilled" ? r.value : null) ?? null)
    .filter((x): x is TickerItem => Boolean(x && x.symbol));

  // If Alpha Vantage rate limits / fails, fall back to mock data (no empty marquee).
  if (items.length < Math.ceil(SYMBOLS.length * 0.6)) return MOCK;

  // Preserve desired symbol order (best-effort).
  const bySymbol = new Map(items.map((i) => [i.symbol.toUpperCase(), i]));
  return SYMBOLS.map(
    (s) => bySymbol.get(s.toUpperCase()) ?? MOCK.find((m) => m.symbol === s)!,
  ).filter(Boolean);
}
