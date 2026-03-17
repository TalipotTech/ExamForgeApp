FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ── Install dependencies ──
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile --prod=false

# ── Build ──
FROM deps AS builder
COPY . .
RUN pnpm --filter @examforge/shared build
RUN pnpm --filter @examforge/api build

# ── Production ──
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=builder --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=app:app /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=app:app /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=app:app /app/packages/shared/drizzle ./packages/shared/drizzle
COPY --from=builder --chown=app:app /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=app:app /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./

ENV HUSKY=0
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

USER app
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["sh", "-c", "node apps/api/dist/scripts/migrate.js && node apps/api/dist/index.js"]
