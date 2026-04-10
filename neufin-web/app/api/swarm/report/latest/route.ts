import { NextRequest } from 'next/server'
import { proxyToRailway } from '@/lib/proxy'
import { NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const res = await proxyToRailway(req, '/api/swarm/report/latest', 'GET')
  // Backend returns 404 when user has no prior swarm report.
  // Normalize to 200 so dashboard clients can treat this as empty state.
  if (res.status === 404) {
    return NextResponse.json({ found: false, report: null }, { status: 200 })
  }
  return res
}
