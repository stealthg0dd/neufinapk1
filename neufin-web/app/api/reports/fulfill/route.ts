import { NextRequest } from 'next/server'
import { proxyToRailway } from '@/lib/proxy'
export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get('report_id')
  return proxyToRailway(req,
    `/api/reports/fulfill${reportId ? `?report_id=${reportId}` : ''}`,
    'GET'
  )
}
