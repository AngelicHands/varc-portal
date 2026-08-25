# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS deps-prod
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS web-runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3099
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3099
CMD ["node", "server.js"]

# Node worker image with ffmpeg for HLS poster backfill.
# Build: docker build --target hls-poster-worker -t varc-portal-hls-poster .
FROM node:22-alpine AS hls-poster-worker
RUN apk add --no-cache ffmpeg tini \
  && corepack enable \
  && corepack prepare pnpm@latest --activate
WORKDIR /app
ENV NODE_ENV=production
ENV HLS_POSTER_WORKER_ENABLED=1

COPY package.json pnpm-lock.yaml ./
# Full install so tsx (devDependency) is available to run the TypeScript worker.
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY scripts/run-hls-poster-worker.ts scripts/backfill-hls-posters.ts ./scripts/

RUN addgroup -S worker && adduser -S worker -G worker \
  && chown -R worker:worker /app
USER worker

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "exec", "tsx", "scripts/run-hls-poster-worker.ts"]
