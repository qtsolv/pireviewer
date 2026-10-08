FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json prompt.md ./
COPY src/ ./src/

RUN bun run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist/gha.js ./dist/gha.js

ENTRYPOINT ["node", "/app/dist/gha.js"]
