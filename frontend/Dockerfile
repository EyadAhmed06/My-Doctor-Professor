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
# chunks before Next.js builds/copies public assets. The chunks themselves are
# the source of truth, so validate the decoded WebP structure and a sane size
# instead of pinning a checksum from an older encoding of the same artwork.
RUN cat public/media/.hero-dark.b64.* | tr -d '\n\r ' | base64 -d > public/media/hero-doctor-professor.webp \
 && cat public/media/.hero-light.b64.* | tr -d '\n\r ' | base64 -d > public/media/hero-doctor-professor-light.webp \
 && test "$(dd if=public/media/hero-doctor-professor.webp bs=1 count=4 2>/dev/null)" = "RIFF" \
 && test "$(dd if=public/media/hero-doctor-professor.webp bs=1 skip=8 count=4 2>/dev/null)" = "WEBP" \
 && test "$(dd if=public/media/hero-doctor-professor-light.webp bs=1 count=4 2>/dev/null)" = "RIFF" \
 && test "$(dd if=public/media/hero-doctor-professor-light.webp bs=1 skip=8 count=4 2>/dev/null)" = "WEBP" \
 && test "$(wc -c < public/media/hero-doctor-professor.webp)" -gt 30000 \
 && test "$(wc -c < public/media/hero-doctor-professor-light.webp)" -gt 30000 \
 && echo "Landing hero assets reconstructed:" \
 && sha256sum public/media/hero-doctor-professor.webp public/media/hero-doctor-professor-light.webp \
 && ls -lh public/media/hero-doctor-professor.webp public/media/hero-doctor-professor-light.webp \
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
