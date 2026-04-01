# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Build tools required by numpy, cryptography, and other C-extension packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libssl-dev \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt


# ── Stage 2: production ───────────────────────────────────────────────────────
FROM python:3.11-slim AS production

# curl is required for the built-in HEALTHCHECK command.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# PYTHONPATH=/app  — resolves top-level modules (main, routers, services …)
# PYTHONUNBUFFERED=1 — no stdout/stderr buffering so logs reach Docker immediately
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Copy only installed packages from builder — no build tools in production image.
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Non-root user for security.
RUN addgroup --system appgroup \
 && adduser  --system --ingroup appgroup --no-create-home appuser

# Copy application source (owned by appuser so it can write cache files).
COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 8000

# Docker-native liveness probe — runs every 30 s, starts checking after 30 s.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Production entry point: uvicorn with 2 workers.
# railway.toml startCommand overrides this for Railway deployments.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]