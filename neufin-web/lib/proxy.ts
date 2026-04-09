import { NextRequest, NextResponse } from 'next/server'

const RAILWAY_BASE = process.env.RAILWAY_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'https://neufin101-production.up.railway.app'

export async function proxyToRailway(
  req: NextRequest,
  backendPath: string,
  method?: string
): Promise<NextResponse> {
  const url = `${RAILWAY_BASE}${backendPath}`
  const m = method || req.method

  // Extract auth token — try cookie first, then Authorization header
  const cookie = req.cookies.get('neufin-auth')?.value
  const authHeader = req.headers.get('authorization')
  let bearerToken: string | null = null

  if (cookie) {
    try {
      const parsed = JSON.parse(cookie)
      bearerToken = parsed?.access_token || parsed?.token || cookie
    } catch {
      bearerToken = cookie
    }
  } else if (authHeader) {
    bearerToken = authHeader.replace('Bearer ', '')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`

  let body: string | undefined
  if (m !== 'GET' && m !== 'HEAD') {
    try { body = await req.text() } catch { body = undefined }
  }

  try {
    const upstream = await fetch(url, {
      method: m,
      headers,
      body,
      signal: AbortSignal.timeout(90000), // 90s for swarm
    })

    const text = await upstream.text()
    let data: unknown
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    console.error(`[proxy] ${m} ${url} failed:`, err)
    return NextResponse.json(
      { error: 'Upstream service unavailable', detail: String(err) },
      { status: 502 }
    )
  }
}
