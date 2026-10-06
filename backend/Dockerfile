# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl poppler-utils tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN npm run build \
    && npm test -- --runInBand \
      src/modules/questions/question-import.service.spec.ts \
      src/modules/bundle-access/bundle-access.predicate.spec.ts \
      src/modules/tests/mcq-practice.service.security.spec.ts

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json /app/tsconfig.build.json ./
RUN mkdir -p /app/uploads /app/backups && chown app:nodejs /app/uploads /app/backups
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
