/** @type {import('next').NextConfig} */
const RAILWAY_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const nextConfig = {
  reactStrictMode: true,

  // Proxy /api/* to Railway backend — avoids CORS entirely for same-origin calls
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${RAILWAY_API}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${RAILWAY_API}/health`,
      },
    ]
  },

  // Security & CORS response headers for direct cross-origin calls
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
