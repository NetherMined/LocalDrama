# Dramora image.
# The server listens on 0.0.0.0:8096.
# Mount /data for settings and the database.
# Set PUBLIC_URL (see docker-compose.yml) to the address other devices should use.

FROM node:22-bookworm-slim AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8096
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
# better-sqlite3 falls back to a source build when no prebuilt binary matches; the toolchain is purged in the same layer.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && cd server && npm ci --omit=dev \
 && apt-get purge -y python3 make g++ && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* /root/.npm
COPY server/ ./server/
COPY --from=web-build /app/web/dist ./web/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8096
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8096) + '/api/health', { signal: AbortSignal.timeout(4000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/src/index.js"]
