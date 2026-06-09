# RM07 API — production image (pnpm monorepo).
# Build from the REPO ROOT as context:
#   docker build -f apps/api/Dockerfile -t rm07-api .
# On Railway/Render/Fly: set the Dockerfile path to apps/api/Dockerfile and the build context to the
# repo root (".").

# ----------------------------------------------------------------------------
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

# ----------------------------------------------------------------------------
# Build: install the whole workspace, build @rm07/api and its workspace deps.
# ----------------------------------------------------------------------------
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# `@rm07/api...` builds the api AND its workspace dependencies (core, db, broker-adapters) in
# dependency order.
RUN pnpm --filter "@rm07/api..." build
# Produce a self-contained deployable in /app (api files + prod node_modules, workspace deps
# dereferenced from workspace:* to real copies).
RUN pnpm --filter @rm07/api --prod deploy /app

# ----------------------------------------------------------------------------
# Runtime: small image with only the deployed app.
# ----------------------------------------------------------------------------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 8080
# The app reads PORT/API_PORT from the environment (defaults to 8080). Most hosts inject $PORT —
# set API_PORT to it (see DEPLOY.md). Health check: GET /healthz.
CMD ["node", "dist/main.js"]
