import { NextRequest, NextResponse } from "next/server";
import {
  candlesFromProxyBody,
  fetchYahooChartCandles,
} from "@/lib/chart-yahoo-fallback";
import { proxyToRailway } from "@/lib/proxy";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await context.params;
  const period = req.nextUrl.searchParams.get("period") || "3mo";
  const upstream = await proxyToRailway(
    req,
    `/api/portfolio/chart/${encodeURIComponent(ticker)}?period=${period}`,
    "GET",
  );

  const sym = ticker.trim().toUpperCase();
  let body: unknown;
  try {
    body = await upstream.clone().json();
  } catch {
    body = null;
  }

  const fromRailway = candlesFromProxyBody(body);
  if (fromRailway?.length) {
    return NextResponse.json(body, { status: 200 });
  }

  const yahoo = await fetchYahooChartCandles(sym, period);
  if (yahoo?.length) {
    return NextResponse.json({ symbol: sym, period, data: yahoo });
  }

  return NextResponse.json({ symbol: sym, period, data: [] }, { status: 200 });
}
