import { NextRequest } from 'next/server'
import { proxyToRailway } from '@/lib/proxy'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.toString()
  const path = q ? `/api/research/regime?${q}` : '/api/research/regime'
  return proxyToRailway(req, path, 'GET')
}
