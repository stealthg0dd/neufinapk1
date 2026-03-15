const API = 'https://neufin101-production.up.railway.app'

export interface Position {
  symbol: string
  shares: number
  price: number
  value: number
  weight: number
}

export interface DNAResult {
  dna_score: number
  investor_type: string
  strengths: string[]
  weaknesses: string[]
  recommendation: string
  total_value: number
  num_positions: number
  max_position_pct: number
  positions: Position[]
  share_token: string
  share_url: string
  record_id: string | null
}

export async function analyzeDNA(fileUri: string, fileName: string): Promise<DNAResult> {
  const form = new FormData()
  // React Native's fetch accepts this object shape for multipart file uploads.
  // Do NOT set Content-Type manually — the runtime adds the correct boundary.
  form.append('file', {
    uri: fileUri,
    name: fileName,
    type: 'text/csv',
  } as unknown as Blob)

  const res = await fetch(`${API}/api/analyze-dna`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Analysis failed')
  }
  return res.json()
}

export async function getLeaderboard(limit = 10) {
  const res = await fetch(`${API}/api/dna/leaderboard?limit=${limit}`)
  if (!res.ok) throw new Error('Leaderboard unavailable')
  return res.json()
}
