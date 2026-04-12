import { NextRequest } from 'next/server'
import { proxyBackendJson } from '@/lib/admin-backend-proxy'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const qs = req.nextUrl.search
  return proxyBackendJson(
    req,
    `/api/admin/partners/${encodeURIComponent(id)}/usage${qs}`,
    { method: 'GET' },
  )
}
