FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
COPY web ./web
RUN pnpm build:web && pnpm build:server

FROM node:24-alpine AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY package.json pnpm-workspace.yaml drizzle.config.ts tsconfig.json ./
COPY src ./src

RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV DATABASE_PATH=/data/jira-tracker.sqlite
EXPOSE 3000

CMD ["sh", "-c", "pnpm db:push && pnpm db:mapping && node dist/server.js"]
