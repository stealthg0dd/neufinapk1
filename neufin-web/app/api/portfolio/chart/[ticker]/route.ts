import { NextRequest } from 'next/server'
import { proxyToRailway } from '@/lib/proxy'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await context.params
  const period = req.nextUrl.searchParams.get('period') || '3mo'
  return proxyToRailway(
    req,
    `/api/portfolio/chart/${encodeURIComponent(ticker)}?period=${period}`,
    'GET',
  )
}
