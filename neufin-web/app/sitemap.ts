import { MetadataRoute } from 'next'

const BASE = 'https://www.neufin.ai'
const NOW  = new Date().toISOString()

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    // Core
    { url: BASE,                              lastModified: NOW, changeFrequency: 'daily',   priority: 1.0  },
    { url: `${BASE}/upload`,                  lastModified: NOW, changeFrequency: 'daily',   priority: 0.9  },
    { url: `${BASE}/research`,                lastModified: NOW, changeFrequency: 'daily',   priority: 0.9  },
    { url: `${BASE}/partners`,                lastModified: NOW, changeFrequency: 'weekly',  priority: 0.9  },
    { url: `${BASE}/pricing`,                 lastModified: NOW, changeFrequency: 'weekly',  priority: 0.85 },
    { url: `${BASE}/features`,                lastModified: NOW, changeFrequency: 'weekly',  priority: 0.85 },
    { url: `${BASE}/blog`,                    lastModified: NOW, changeFrequency: 'weekly',  priority: 0.85 },
    // Supporting
    { url: `${BASE}/about`,                   lastModified: NOW, changeFrequency: 'monthly', priority: 0.8  },
    { url: `${BASE}/market`,                  lastModified: NOW, changeFrequency: 'daily',   priority: 0.8  },
    { url: `${BASE}/leaderboard`,             lastModified: NOW, changeFrequency: 'daily',   priority: 0.75 },
    // Legal + conversion
    { url: `${BASE}/contact-sales`,           lastModified: NOW, changeFrequency: 'monthly', priority: 0.7  },
    { url: `${BASE}/referrals`,               lastModified: NOW, changeFrequency: 'weekly',  priority: 0.7  },
    { url: `${BASE}/privacy`,                 lastModified: NOW, changeFrequency: 'monthly', priority: 0.6  },
    { url: `${BASE}/terms-and-conditions`,    lastModified: NOW, changeFrequency: 'monthly', priority: 0.5  },
  ]

  // Dynamic research/blog articles
  let researchPages: MetadataRoute.Sitemap = []
  try {
    const res = await fetch(`${BASE}/api/research/blog?limit=50`, {
      next: { revalidate: 3600 },
    })
    if (res.ok) {
      const notes = await res.json() as { slug: string; created_at: string }[]
      researchPages = notes.map((note) => ({
        url: `${BASE}/research/${note.slug}`,
        lastModified: new Date(note.created_at).toISOString(),
        changeFrequency: 'never' as const,
        priority: 0.7,
      }))
    }
  } catch {
    // Silently skip dynamic pages if the API is unavailable at build time.
  }

  return [...staticPages, ...researchPages]
}
