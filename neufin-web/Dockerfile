# ── Stage 1: base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
# Copy manifests first — layer is only invalidated when dependencies change.
COPY package.json package-lock.json* ./


# ── Stage 2: development (used by docker-compose for hot-reload) ──────────────
# Mount the host source tree over /app; node_modules stays in the anonymous
# volume defined in docker-compose so the host tree doesn't shadow it.
FROM base AS development
RUN npm ci
EXPOSE 3000
CMD ["npm", "run", "dev"]


# ── Stage 3: production builder ───────────────────────────────────────────────
FROM base AS builder
RUN npm ci --frozen-lockfile
COPY . .

# NEXT_PUBLIC_* vars must be baked into the JS bundle at build time.
# Pass them from docker-compose build.args (which reads from .env at compose root).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
# RAILWAY_API_URL is server-side only — used by next.config.js rewrites() at
# build time and by the Next.js server at runtime.  Never reaches the browser.
ARG RAILWAY_API_URL=http://api-backend:8080

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    RAILWAY_API_URL=$RAILWAY_API_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ── Stage 4: production runtime ───────────────────────────────────────────────
# Only the standalone output and static assets are copied — no source, no
# node_modules.  Result is typically 80-90 % smaller than a full image.
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# standalone/server.js + static assets
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
