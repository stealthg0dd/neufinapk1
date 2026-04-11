import { NextRequest } from 'next/server'
import { proxyBackendJson } from '@/lib/admin-backend-proxy'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const { keyId } = await params
  const body = await req.text()
  return proxyBackendJson(req, `/api/admin/api-keys/${encodeURIComponent(keyId)}/rate-limit`, {
    method: 'PATCH',
    body,
  })
}
