# RM07 market-data fan-out — AWS Fargate (ap-south-1).
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm --filter @rm07/md-svc build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/md-svc/dist ./dist
COPY --from=build /app/apps/md-svc/package.json ./package.json
EXPOSE 8100
CMD ["node", "dist/index.js"]
