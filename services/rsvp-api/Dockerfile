# Build context is this directory, not the workspace root, so the image can be
# built from a copy of services/rsvp-api on its own:
#
#   cd services/rsvp-api
#   docker build -t rsvp-api .
#   docker run -d --name rsvp-api -p 4000:4000 \
#     -v rsvp-data:/data --env-file .env -e DATABASE_PATH=/data/rsvp.sqlite rsvp-api

# ---------------------------------------------------------------- build stage
FROM node:22-alpine AS build

WORKDIR /app
ENV CI=true

RUN corepack enable

# A lockfile is used when one is present next to the service; inside the
# monorepo it lives at the workspace root, so the glob simply matches nothing.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# Reinstall with dev dependencies pruned, to be copied into the runtime image.
RUN rm -rf node_modules && pnpm install --prod --no-frozen-lockfile

# -------------------------------------------------------------- runtime stage
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DATABASE_PATH=/data/rsvp.sqlite

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Migrations are applied on startup, so they have to be in the image.
COPY migrations ./migrations

# The database lives on a volume; everything else in the image is disposable.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 4000

# Uses the real endpoint, which only answers 200 once SQLite is readable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# No shell wrapper, so SIGTERM reaches Node directly and the graceful shutdown
# in server.ts gets to checkpoint the WAL before the process exits.
CMD ["node", "dist/server.js"]
