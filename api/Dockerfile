# syntax=docker/dockerfile:1.7
#
# Vidway API container.
#
# Single-stage by design: the API runs TypeScript directly via `tsx`, so
# there's no compile step and no separate runtime stage to slim down to.
# The whole package + workspace deps add up to ~150 MB; if that ever
# matters, split into a deps-builder and a slimmer runtime stage.
#
# Build context is the repo ROOT, not api/ — needed so we can see
# pnpm-workspace.yaml and the web/package.json (pnpm wants every
# workspace package's manifest before it'll resolve anything).

FROM node:22-slim
WORKDIR /app

# pnpm via corepack — pinned to the same version as the rest of the repo.
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Workspace manifests first, so the deps layer caches across source edits.
# We copy both api/ and web/ package.jsons because pnpm needs the full
# workspace shape before it'll filter-install just the api deps.
COPY pnpm-workspace.yaml package.json ./
COPY api/package.json ./api/
COPY web/package.json ./web/

# Install only the api workspace's deps. The pnpm store is cached
# across builds via the BuildKit cache mount.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --filter @vidway/api

# Now the source. Editing source invalidates only this layer onward.
COPY api ./api/

ENV NODE_ENV=production
ENV PORT=8787
ENV DATABASE_PATH=/data/vidway.db

# Expose the data dir as a volume so the SQLite file persists across
# container rebuilds. docker-compose binds ./api/data here.
VOLUME ["/data"]

EXPOSE 8787

# Run the API workspace's start script, which boots `node --import tsx`.
CMD ["pnpm", "--filter", "@vidway/api", "start"]
