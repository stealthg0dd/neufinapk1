# ── Stage 1: dependency builder ───────────────────────────────────────────────
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

# PYTHONPATH=/app ensures Python resolves top-level modules
# PYTHONUNBUFFERED=1 flushes stdout/stderr instantly into Docker logs.
# We set hard defaults here so gunicorn always has an integer if the ENV is missing.
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    GUNICORN_WORKERS=4 \
    PORT=8080

# Carry only the installed packages from the builder — no build tools.
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application source last
COPY . .

# Match the port shown in your Railway networking settings
EXPOSE 8080

# ── Production entry point ─────────────────────────────────────────────────────
# FIX: We remove the 'sh -c' and the braces from the CMD. 
# By using the "Shell Form" (no square brackets), Docker automatically 
# invokes /bin/sh -c, which correctly expands the environment variables 
# before passing them to gunicorn.
#
# Note: timeout 300 is kept to support the 7-agent AI swarm processing time.

CMD gunicorn main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers $GUNICORN_WORKERS \
    --bind 0.0.0.0:$PORT \
    --timeout 300 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile -