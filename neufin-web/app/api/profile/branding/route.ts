import { NextRequest } from 'next/server'
import { proxyToRailway } from '@/lib/proxy'

export async function PATCH(req: NextRequest) {
  return proxyToRailway(req, '/api/profile/branding', 'PATCH')
}
