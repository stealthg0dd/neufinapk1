import { NextRequest } from 'next/server'
import { proxyToRailway } from '@/lib/proxy'

/** Proxies to Railway; maps `limit` → `per_page` for the FastAPI handler. */
export async function GET(req: NextRequest) {
  const sp = new URLSearchParams(req.nextUrl.searchParams)
  if (sp.has('limit') && !sp.has('per_page')) {
    sp.set('per_page', sp.get('limit')!)
    sp.delete('limit')
  }
  if (sp.has('public')) {
    sp.delete('public')
  }
  const q = sp.toString()
  const path = q ? `/api/research/notes?${q}` : '/api/research/notes'
  return proxyToRailway(req, path, 'GET')
}
