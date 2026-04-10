import { NextRequest } from 'next/server'
import { proxyToRailway } from '@/lib/proxy'

export async function GET(
  req: NextRequest,
  { params }: { params: { ticker: string } },
) {
  const period = req.nextUrl.searchParams.get('period') || '3mo'
  return proxyToRailway(
    req,
    `/api/portfolio/chart/${params.ticker}?period=${period}`,
    'GET',
  )
}
