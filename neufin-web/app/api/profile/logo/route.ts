import { NextRequest, NextResponse } from 'next/server'

const RAILWAY_BASE =
  process.env.RAILWAY_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://neufin101-production.up.railway.app'

/**
 * Multipart proxy for logo upload.
 * We cannot use proxyToRailway() because it re-serialises the body as JSON,
 * stripping the multipart boundary. Instead we forward the raw body and
 * Content-Type header directly so FastAPI's UploadFile parser works.
 */
export async function POST(req: NextRequest) {
  const url = `${RAILWAY_BASE}/api/profile/logo`

  let bearerToken: string | null = null
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    bearerToken = authHeader.slice(7).trim() || null
  }
  if (!bearerToken) {
    const cookie = req.cookies.get('neufin-auth')?.value
    if (cookie) {
      try {
        const parsed = JSON.parse(cookie) as { access_token?: string }
        bearerToken = parsed.access_token ?? cookie
      } catch {
        bearerToken = cookie
      }
    }
  }

  const headers: Record<string, string> = {}
  const contentType = req.headers.get('content-type')
  if (contentType) headers['Content-Type'] = contentType
  if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`

  try {
    const body = await req.arrayBuffer()
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body,
    })
    const text = await upstream.text()
    let data: unknown
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    console.error('[profile/logo] upload proxy failed:', err)
    return NextResponse.json(
      { error: 'Logo upload failed', detail: String(err) },
      { status: 502 }
    )
  }
}
