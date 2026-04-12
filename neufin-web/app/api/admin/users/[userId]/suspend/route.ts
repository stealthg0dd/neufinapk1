import { NextRequest } from 'next/server'
import { proxyBackendJson } from '@/lib/admin-backend-proxy'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  const body = await req.text()
  return proxyBackendJson(req, `/api/admin/users/${encodeURIComponent(userId)}/suspend`, {
    method: 'POST',
    body: body || '{}',
  })
}
