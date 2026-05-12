# syntax=docker/dockerfile:1
# Production image for Railway (or any host that sets PORT at runtime).
# Railway overrides PORT; keep a default for local `docker run`.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Railway injects PORT; this default is for local runs without -e PORT=...
ENV PORT=3001

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs \
  && apk add --no-cache wget

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
USER nodejs

EXPOSE 3001

# Shell form so ${PORT} is read at check time (matches Railway’s PORT).
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["node", "dist/server.js"]
