import { NextRequest } from 'next/server'
import { proxyToRailway } from '@/lib/proxy'

export async function GET(
  req: NextRequest,
  { params }: { params: { job_id: string } },
) {
  return proxyToRailway(req, `/api/swarm/status/${params.job_id}`, 'GET')
}
