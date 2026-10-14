FROM node:22-bookworm-slim AS base

# workerd requires the Debian C++ runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libc++1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV WRANGLER_SEND_METRICS=false \
    WRANGLER_WRITE_LOGS=false

FROM base AS build
COPY package.json package-lock.json ./
COPY vendor/braces ./vendor/braces
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
# Wrangler and its local SQLite runtime are installed with the development tools.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/vendor ./vendor
RUN mkdir -p /app/data /app/.wrangler && chown node:node /app /app/data /app/.wrangler
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/watches', { signal: AbortSignal.timeout(5000) }).then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"
CMD ["node", "node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--local", "--persist-to", "/app/data", "--ip", "0.0.0.0", "--port", "3000", "--show-interactive-dev-session=false"]
