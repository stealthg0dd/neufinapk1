import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://neufin-web.vercel.app'
  
  // Static pages
  const staticPages = [
    '', '/about', '/pricing', '/research', '/upload',
    '/market', '/leaderboard', '/blog', '/features',
    '/privacy', '/contact-sales', '/referrals',
  ].map(path => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1.0 : 0.8,
  }))
  
  // Research articles (dynamic)
  let researchPages: MetadataRoute.Sitemap = []
  try {
    const res = await fetch(`${baseUrl}/api/research/blog?limit=50`, 
      { next: { revalidate: 3600 } })
    if (res.ok) {
      const notes = await res.json()
      researchPages = notes.map((note: { slug: string, created_at: string }) => ({
        url: `${baseUrl}/research/${note.slug}`,
        lastModified: new Date(note.created_at),
        changeFrequency: 'never' as const,
        priority: 0.7,
      }))
    }
  } catch { /* silently skip */ }
  
  return [...staticPages, ...researchPages]
}
