import { MetadataRoute } from "next";

const BASE = "https://www.neufin.ai";
const NOW = new Date().toISOString();

/**
 * Synchronous sitemap — no external fetch so it never fails at build time
 * and always returns valid XML (not an HTML error page).
 *
 * Google Search Console requires the /sitemap.xml endpoint to return
 * application/xml. An async fetch that throws during Vercel's build
 * causes Next.js to fall back to an HTML error page, which GSC rejects.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // ── Core public pages ──────────────────────────────────────────────
    { url: BASE, lastModified: NOW, changeFrequency: "daily", priority: 1.0 },
    {
      url: `${BASE}/upload`,
      lastModified: NOW,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/research`,
      lastModified: NOW,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/partners`,
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE}/pricing`,
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${BASE}/features`,
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${BASE}/blog`,
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    // ── Supporting pages ──────────────────────────────────────────────
    {
      url: `${BASE}/about`,
      lastModified: NOW,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE}/market`,
      lastModified: NOW,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE}/leaderboard`,
      lastModified: NOW,
      changeFrequency: "daily",
      priority: 0.75,
    },
    // ── Legal + conversion ────────────────────────────────────────────
    {
      url: `${BASE}/contact-sales`,
      lastModified: NOW,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE}/referrals`,
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BASE}/privacy`,
      lastModified: NOW,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE}/terms-and-conditions`,
      lastModified: NOW,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
