# ── Stage 1: dependency builder ───────────────────────────────────────────────
# Isolated stage so build tools (gcc, make) never reach the runtime image.
FROM python:3.12-slim AS deps

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


# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# PYTHONPATH=/app ensures Python resolves top-level modules (main, config,
# database, routers/, services/) without a package install step.
# PYTHONUNBUFFERED=1 flushes stdout/stderr instantly into Docker logs.
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Carry only the installed packages from the builder — no build tools.
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application source last (invalidates cache only on code changes,
# not on dependency changes).
COPY . .

EXPOSE 8000

# ── Production entry point ─────────────────────────────────────────────────────
# gunicorn + UvicornWorker gives real pre-fork process isolation and graceful
# shutdown.  timeout=300 is required: the LangGraph swarm (7 AI agents) can
# legitimately take 60-120 s per request.
#
# Override this CMD in docker-compose for local dev:
#   command: ["uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
#
# Override for the Celery worker container:
#   command: ["celery", "-A", "services.celery_app", "worker", "--loglevel=info", "--queues=swarm,default"]
CMD ["gunicorn", "main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "2", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "300", \
     "--keep-alive", "5", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
