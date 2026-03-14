FROM python:3.11-slim

WORKDIR /app

# Install only the neufin-backend dependencies — never touches the root requirements.txt
COPY neufin-backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy only the backend source
COPY neufin-backend/ ./

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
