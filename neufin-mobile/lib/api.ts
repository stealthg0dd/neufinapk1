const API = 'https://neufin-api.railway.app'

export interface DNAResult {
  dna_score: number
  investor_type: string
  strengths: string[]
  weaknesses: string[]
  recommendation: string
  total_value: number
  num_positions: number
  max_position_pct: number
  positions: Array<{
    symbol: string
    shares: number
    price: number
    value: number
    weight: number
  }>
}

export async function analyzeDNA(fileUri: string, fileName: string): Promise<DNAResult> {
  const form = new FormData()
  form.append('file', {
    uri: fileUri,
    name: fileName,
    type: 'text/csv',
  } as unknown as Blob)

  // Do NOT set Content-Type manually — React Native's fetch will set it
  // automatically with the correct multipart boundary when body is FormData.
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
