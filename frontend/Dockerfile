# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
COPY . .

# Reconstruct the approved Doctor/Professor artwork from repository-safe base64
# chunks before Next.js builds/copies public assets. Validate exact bytes so a
# truncated or corrupted image can never silently reach production again.
RUN cat public/media/.hero-dark.b64.* | tr -d '\n\r ' | base64 -d > public/media/hero-doctor-professor.webp \
 && cat public/media/.hero-light.b64.* | tr -d '\n\r ' | base64 -d > public/media/hero-doctor-professor-light.webp \
 && echo "f2917a22776ad636e03aa4d3d478ee0ba05e09cb1c8592d31761a869bd3cf225  public/media/hero-doctor-professor.webp" | sha256sum -c - \
 && echo "2e75e342d276478707c20e4b3cf255e7295becb1ae146a5613633ecbc22ebe5e  public/media/hero-doctor-professor-light.webp" | sha256sum -c - \
 && test "$(dd if=public/media/hero-doctor-professor.webp bs=1 count=4 2>/dev/null)" = "RIFF" \
 && test "$(dd if=public/media/hero-doctor-professor-light.webp bs=1 count=4 2>/dev/null)" = "RIFF" \
 && rm -f public/media/.hero-dark.b64.* public/media/.hero-light.b64.*

RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]
