# syntax=docker/dockerfile:1
FROM oven/bun:1.4 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.4 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# src/env.ts validates at import time. These throwaway values only satisfy the
# build (set inline so they aren't baked into the image); real ones come at runtime.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-0000000000000000 \
    STUDENT_ID_PEPPER=build \
    bun run build

FROM oven/bun:1.4-slim AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json next.config.ts ./
COPY drizzle ./drizzle
COPY src/db/migrate.ts ./src/db/migrate.ts
USER bun
EXPOSE 3000
# Apply pending migrations, then serve.
CMD ["sh", "-c", "bun src/db/migrate.ts && bun next start -p ${PORT}"]
