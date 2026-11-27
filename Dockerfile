# Stage 1: Compile TypeScript + Vite production frontend bundle
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig*.json vite.config.ts ./
COPY public ./public
COPY server ./server
COPY src ./src
RUN npm run build

# Stage 2: Sleep-friendly production BFF + static SPA runtime (Render / Railway / Cloud Run)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    SERVE_STATIC=1 \
    PUBLIC_READONLY_MODE=1 \
    CONTAINER_RUNTIME=1 \
    GITHUB_CRON_MANAGED=1 \
    PORT=8080 \
    CACHE_TTL_HOURS=24

COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --from=builder --chown=node:node /app/dist ./dist

RUN mkdir -p /app/server/cache /app/server/data && chown -R node:node /app/server/cache /app/server/data

USER node
EXPOSE 8080

CMD ["node", "./server/index.mjs"]
