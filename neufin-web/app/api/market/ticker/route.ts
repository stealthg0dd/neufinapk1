import { NextResponse } from "next/server";
import { getLandingTickers } from "@/lib/market/ticker";

export const revalidate = 300;

export async function GET() {
  const data = await getLandingTickers();
  return NextResponse.json({ tickers: data });
}
