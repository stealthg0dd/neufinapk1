import { NextRequest } from 'next/server'
import { proxyToRailway } from '@/lib/proxy'
export async function GET(req: NextRequest) {
  return proxyToRailway(req, '/api/portfolio/list', 'GET')
}
