import { MetadataRoute } from 'next'

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://neufin.com').replace(/\/$/, '')

const BLOG_POSTS = [
  'behavioral-finance-sea-sme',
  'plaid-portfolio-analysis',
  'mas-compliant-fintech',
  'disposition-effect-singapore',
  'sea-wealth-management-ai',
]

async function fetchResearchSlugs(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/api/research/blog?page=1&limit=200`, {
      next: { revalidate: 3600 },
      cache: 'force-cache',
    })
    if (!res.ok) return []
    const data = (await res.json()) as Array<{ slug?: string }>
    return data.map((n) => n.slug).filter((s): s is string => Boolean(s))
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const researchSlugs = await fetchResearchSlugs()
  return [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1.0,
    },
    {
      url: `${BASE}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE}/features`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE}/research`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    ...BLOG_POSTS.map((slug) => ({
      url: `${BASE}/blog/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...researchSlugs.map((slug) => ({
      url: `${BASE}/research/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.75,
    })),
    {
      url: `${BASE}/contact-sales`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE}/developer`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE}/developer/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]
}
