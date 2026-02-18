FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

WORKDIR /app/backend

EXPOSE 8000

ENV MGX_IGNORE_INIT_DB=true
ENV MGX_IGNORE_INIT_DATA=true
ENV MGX_IGNORE_INIT_ADMIN=true

CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]