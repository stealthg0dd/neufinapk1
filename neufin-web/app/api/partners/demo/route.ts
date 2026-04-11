import { NextRequest, NextResponse } from 'next/server'
import { proxyToRailway } from '@/lib/proxy'

/** Simple in-memory rate limiter — resets on cold start, acceptable for demo. */
const rateLimits = new Map<string, { count: number; resetAt: number }>()

const DEMO_LIMIT = 10
const WINDOW_MS = 3_600_000 // 1 hour

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'

  const now = Date.now()
  const bucket = rateLimits.get(ip)

  if (bucket && now < bucket.resetAt) {
    if (bucket.count >= DEMO_LIMIT) {
      return NextResponse.json(
        {
          error: 'Demo rate limit reached.',
          message: `You've used all ${DEMO_LIMIT} free demo analyses. Sign up for full API access.`,
        },
        { status: 429 }
      )
    }
    bucket.count++
  } else {
    rateLimits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  }

  // Forward to Railway's analyze-dna (no auth required for guests on that endpoint)
  return proxyToRailway(req, '/api/analyze-dna', 'POST')
}
