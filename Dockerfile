# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3051 \
    DATA_DIR=/app/data \
    CONFIG_PATH=/app/config/config.yml \
    LOG_FORMAT=json \
    LOG_CONSOLE_ENABLED=true \
    LOG_FILE_ENABLED=false
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node config ./config
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY --chown=node:node scripts/docker-healthcheck.js ./scripts/docker-healthcheck.js
RUN mkdir -p /app/data /tmp \
  && chown -R node:node /app /tmp
USER node
EXPOSE 3051 3052
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s CMD ["node", "scripts/docker-healthcheck.js"]
CMD ["node", "server/index.js"]
