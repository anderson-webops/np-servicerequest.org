ARG SOURCE_DATE_EPOCH=0

FROM node:26.5.0-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS build-stage

ARG NP_RELEASE_VERSION
ARG SOURCE_DATE_EPOCH
ARG SOURCE_REVISION

WORKDIR /app

ENV NP_RELEASE_VERSION=$NP_RELEASE_VERSION \
    PUPPETEER_SKIP_DOWNLOAD=true \
    SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH \
    SOURCE_REVISION=$SOURCE_REVISION

RUN npm install --global npm@12.0.2 \
    && test "$(node --version)" = "v24.18.1" \
    && test "$(npm --version)" = "12.0.2"

COPY .npmrc package.json package-lock.json ./
COPY front-end/package.json ./front-end/package.json
COPY back-end/package.json ./back-end/package.json
RUN npm ci --include=optional --strict-allow-scripts

COPY . .
RUN node -e ' \
      const [declaredVersion, revision] = process.argv.slice(1); \
      const packageVersion = require("./package.json").version; \
      if (declaredVersion.replace(/^v/, "") !== packageVersion \
        || !/^[0-9a-f]{40}$/.test(revision)) process.exit(1); \
    ' "$NP_RELEASE_VERSION" "$SOURCE_REVISION" \
    && npm run build \
    && test -f /app/back-end/dist/server.js \
    && test -f /app/front-end/.output/public/release.json

FROM build-stage AS production-dependencies

RUN npm prune --omit=dev --workspaces --ignore-scripts

FROM node:26.5.0-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS production-stage

ARG NP_RELEASE_VERSION
ARG SOURCE_REVISION

WORKDIR /app

ENV NODE_ENV=production \
    NP_RELEASE_VERSION=$NP_RELEASE_VERSION \
    PORT=8080 \
    SOURCE_REVISION=$SOURCE_REVISION \
    STATIC_SITE_DIR=/app/front-end/public \
    SUBMISSIONS_DATA_DIR=/app/data

RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx \
    && install -d -m 0700 -o node -g node /app/data

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build-stage --chown=node:node /app/back-end/dist ./back-end/dist
COPY --from=build-stage --chown=node:node /app/front-end/.output/public ./front-end/public

USER node

VOLUME ["/app/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "back-end/dist/server.js"]
