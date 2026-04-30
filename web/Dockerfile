# syntax=docker/dockerfile:1.7
#
# Vidway web container.
#
# Multi-stage:
#   1. `builder` runs `pnpm --filter @vidway/web build`, which produces
#      static files in /app/web/dist.
#   2. `runtime` is plain nginx:alpine serving those files. Tiny image,
#      no Node at runtime.
#
# Build context is the repo ROOT so we can see pnpm-workspace.yaml.

# ---------- builder ----------
FROM node:22-slim AS builder
WORKDIR /app

# The API URL the browser will use to talk to the catalog. Baked into
# the bundle at build time because Vite resolves `import.meta.env.*`
# during `vite build`. Override at build time:
#
#   docker build --build-arg VITE_VIDWAY_API_URL=https://api.example.com .
#
# The default points at the host-exposed port from docker-compose so
# the canonical local-compose flow works out of the box.
ARG VITE_VIDWAY_API_URL=http://localhost:8787
ENV VITE_VIDWAY_API_URL=$VITE_VIDWAY_API_URL

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Workspace manifests first for caching. Same reason as the api Dockerfile.
COPY pnpm-workspace.yaml package.json ./
COPY api/package.json ./api/
COPY web/package.json ./web/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --filter @vidway/web

# Source + build.
COPY web ./web/
RUN pnpm --filter @vidway/web build

# ---------- runtime ----------
FROM nginx:alpine

# Custom config: SPA routing (try_files), gzip, asset caching.
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

# Static bundle.
COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80
