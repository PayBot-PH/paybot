FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

WORKDIR /app/backend

EXPOSE 8000

ENV MGX_IGNORE_INIT_DB=true

ENV MGX_IGNORE_INIT_DATA=true

ENV MGX_IGNORE_INIT_ADMIN=true

CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]