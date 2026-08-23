FROM oven/bun:canary-slim@sha256:dac90cc91f43a2535bbd32883c72c435377f15add75813393bd308e93e376d82

WORKDIR /app

RUN test "$(bun --version)" = "1.4.1"

# The container only runs the backend, so development-only Electron packages
# are excluded from the install.
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY scripts/prepare.ts ./scripts/prepare.ts
RUN apt-get update && \
    apt-get install --yes --no-install-recommends g++ make python3 && \
    bun install --frozen-lockfile --production --registry=https://registry.npmmirror.com && \
    apt-get purge --yes --auto-remove g++ make python3 && \
    rm -rf /var/lib/apt/lists/*

COPY . .

ENV NODE_ENV=prod
ENV PORT=10588

RUN bun scripts/build.ts

EXPOSE 10588

CMD ["bun", "data/serve/app.js"]
