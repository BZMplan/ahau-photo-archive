# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@12.10.1

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS admin-cli
COPY --chown=node:node . .
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups
USER node
CMD ["node", "--import", "tsx", "scripts/admin-init.ts"]

FROM dependencies AS builder
COPY . .
RUN pnpm db:compile && pnpm build
# The standalone trace serves the app; CLI tools need only their small runtime set.
RUN mkdir -p .output/migration-node-modules/@next \
    && cp -LR node_modules/@next/env .output/migration-node-modules/@next/env \
    && cp -LR node_modules/better-sqlite3 .output/migration-node-modules/better-sqlite3 \
    && cp -LR node_modules/drizzle-orm .output/migration-node-modules/drizzle-orm \
    && cp -LR node_modules/zod .output/migration-node-modules/zod

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/archive.sqlite
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.output/migrations ./migrations
COPY --from=builder --chown=node:node /app/.output/migration-node-modules ./migrations/node_modules
COPY --chown=node:node scripts/backup-db.mjs ./migrations/scripts/backup-db.mjs
COPY --chown=node:node scripts/restore-db.mjs ./migrations/scripts/restore-db.mjs
COPY --chown=node:node scripts/check-migrations.mjs ./migrations/scripts/check-migrations.mjs
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node migrations/scripts/check-migrations.mjs && exec node server.js"]
