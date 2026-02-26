FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY frontend/package.json frontend/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY frontend/ ./

RUN pnpm build

CMD ["sh", "-c", "pnpm preview --host 0.0.0.0 --port ${PORT:-4173}"]