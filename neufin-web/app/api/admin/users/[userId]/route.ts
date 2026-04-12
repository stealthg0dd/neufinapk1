/**
 * GET /api/admin/users/[userId] — admin user detail (backend).
 * DELETE /api/admin/users/[userId] — admin delete user (backend).
 */

import { NextRequest } from 'next/server'
import { proxyBackendJson } from '@/lib/admin-backend-proxy'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  return proxyBackendJson(req, `/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'GET',
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  return proxyBackendJson(req, `/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
}
