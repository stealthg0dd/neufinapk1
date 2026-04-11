import { NextRequest } from 'next/server'
import { proxyBackendJson } from '@/lib/admin-backend-proxy'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return proxyBackendJson(req, `/api/admin/partners/${encodeURIComponent(id)}/rotate-key`, {
    method: 'POST',
  })
}
