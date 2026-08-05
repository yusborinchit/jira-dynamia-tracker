# better-sqlite3 es un módulo nativo: necesita toolchain para compilarse.
FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production

# node_modules ya compilados (incluye drizzle-kit y tsx, que corren en el
# arranque para aplicar el esquema y el mapeo de estados).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json drizzle.config.ts tsconfig.json ./
COPY src ./src

RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV DATABASE_PATH=/data/jira-tracker.sqlite
EXPOSE 3000

# Ambos pasos son idempotentes, así que se corren en cada arranque.
CMD ["sh", "-c", "pnpm db:push && pnpm db:mapping && node dist/server.js"]
