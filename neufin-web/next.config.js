/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  // Required for the production Docker image (copies only what node server.js needs).
  // Has no effect on `next dev` — safe to leave on at all times.
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },

  // Explicit turbopack config — required in Next.js 16+ when a webpack config is also present.
  // Turbopack handles OpenTelemetry's dynamic requires natively; no ignoreWarnings needed.
  turbopack: {},

  // Sentry pulls @opentelemetry/instrumentation; webpack warns on dynamic requires (harmless).
  // Only applies to webpack builds (not Turbopack).
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /@opentelemetry\/instrumentation/,
        message:
          /Critical dependency: the request of a dependency is an expression/,
      },
    ];
    return config;
  },

  // Proxy /api/* to Railway only when no local App Router handler exists.
  // IMPORTANT: use `fallback` so /api/stripe/webhook (and every app/api/**/route.ts)
  // is never proxied — `afterFiles`-style rewrites can run before some API matches and
  // break Stripe signature verification (wrong host + wrong STRIPE_WEBHOOK_SECRET).
  //
  // RAILWAY_API_URL or NEXT_PUBLIC_API_URL must be set explicitly — no hardcoded fallback.
  async rewrites() {
    const railwayBase =
      process.env.RAILWAY_API_URL || process.env.NEXT_PUBLIC_API_URL || "";
    if (!railwayBase) {
      // No proxy target configured — all /api/* requests must be App Router handlers.
      return { fallback: [] };
    }
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${railwayBase}/api/:path*`,
        },
      ],
    };
  },

  // Security & CORS response headers for direct cross-origin calls
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          // HSTS: enforce HTTPS for 1 year, include subdomains
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // CSP: allow self + Supabase + Sentry + PostHog + Stripe + Google (OAuth/fonts)
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://apis.google.com https://us.posthog.com https://vercel.live",
              "script-src-elem 'self' 'unsafe-inline' https://js.stripe.com https://www.googletagmanager.com https://apis.google.com https://us.posthog.com https://vercel.live",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.railway.app https://api.stripe.com https://us.i.posthog.com https://*.sentry.io https://polygon.io https://finnhub.io https://financialmodelingprep.com https://api.twelvedata.com https://www.google-analytics.com https://google-analytics.com https://www.google.com https://google.com",
              "frame-src https://js.stripe.com https://hooks.stripe.com https://accounts.google.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Wrap with Sentry only when SENTRY_DSN is set — avoids build failures in
// environments that haven't configured Sentry yet.
if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const { withSentryConfig } = require("@sentry/nextjs");
  module.exports = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,

    // Upload source maps only in CI to keep local builds fast.
    silent: !process.env.CI,

    // Automatically tree-shake Sentry logger statements in production.
    disableLogger: true,

    // Tunnel Sentry requests through /monitoring to bypass ad-blockers.
    tunnelRoute: "/monitoring",

    // Route browser profiling to the Sentry CDN for better performance.
    automaticVercelMonitors: true,
  });
} else {
  module.exports = nextConfig;
}
