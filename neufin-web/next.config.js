/** @type {import('next').NextConfig} */
const RAILWAY_API = process.env.RAILWAY_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

const nextConfig = {
  reactStrictMode: true,

  // Required for the production Docker image (copies only what node server.js needs).
  // Has no effect on `next dev` — safe to leave on at all times.
  output: 'standalone',

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
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control',    value: 'on' },
        ],
      },
    ]
  },
}

// Wrap with Sentry only when SENTRY_DSN is set — avoids build failures in
// environments that haven't configured Sentry yet.
if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const { withSentryConfig } = require('@sentry/nextjs')
  module.exports = withSentryConfig(nextConfig, {
    org:     process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,

    // Upload source maps only in CI to keep local builds fast.
    silent: !process.env.CI,

    // Automatically tree-shake Sentry logger statements in production.
    disableLogger: true,

    // Tunnel Sentry requests through /monitoring to bypass ad-blockers.
    tunnelRoute: '/monitoring',

    // Route browser profiling to the Sentry CDN for better performance.
    automaticVercelMonitors: true,
  })
} else {
  module.exports = nextConfig
}

