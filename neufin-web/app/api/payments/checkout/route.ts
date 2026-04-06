import { NextRequest, NextResponse } from 'next/server'

const backend =
  process.env.RAILWAY_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

/**
 * Proxies subscription checkout to the Railway backend.
 * Backend exposes POST /api/reports/checkout with plan: "single" | "unlimited".
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON body' }, { status: 400 })
  }

  const token =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.cookies.get('neufin-auth')?.value

  const plan = typeof body.plan === 'string' ? body.plan : 'unlimited'
  if (plan !== 'single' && plan !== 'unlimited') {
    return NextResponse.json({ detail: 'plan must be single or unlimited' }, { status: 400 })
  }

  const payload = {
    plan,
    portfolio_id: body.portfolio_id,
    positions: body.positions,
    advisor_id: body.advisor_id ?? 'anonymous',
    ref_token: body.ref_token,
    success_url:
      body.success_url ?? `${req.nextUrl.origin}/pricing/success`,
    cancel_url: body.cancel_url ?? `${req.nextUrl.origin}/pricing`,
  }

  const res = await fetch(`${backend}/api/reports/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })

  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = { detail: text || res.statusText }
  }

  return NextResponse.json(data, { status: res.status })
}
