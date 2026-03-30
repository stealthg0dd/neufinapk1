FROM python:3.12-slim

WORKDIR /app
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install build tools required by C-extension packages (numpy, cryptography)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libssl-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Install only the neufin-backend dependencies
COPY neufin-backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy only the backend source
COPY neufin-backend/ ./

EXPOSE 8000

# gunicorn + UvicornWorker: real process isolation + graceful shutdown.
# timeout=300 required for LangGraph swarm (60-120 s per request).
# GUNICORN_WORKERS defaults to 4; override in Railway env vars.
CMD sh -c 'exec gunicorn main:app \
     --worker-class uvicorn.workers.UvicornWorker \
     --workers ${GUNICORN_WORKERS:-4} \
     --bind 0.0.0.0:${PORT:-8000} \
     --timeout 300 \
     --keep-alive 5 \
     --access-logfile - \
     --error-logfile -'
