# ── Stage 1: test ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS test

WORKDIR /app
COPY package.json ./
COPY src/ ./src/
COPY test/ ./test/

# Run the native test suite — build fails if any test fails
RUN node --test test/broker.test.js

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

LABEL maintainer="BikeStore Team"
LABEL description="BikeStore Async v1.0 — Native Node.js, no external deps"

WORKDIR /app

# Copy only what's needed at runtime
COPY package.json ./
COPY src/ ./src/
COPY public/ ./public/

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "src/app.js"]
