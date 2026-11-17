# syntax=docker/dockerfile:1

# ---------- Stage 1: semua dependency (termasuk jest/supertest) ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Stage 2: test ----------
# Dijalankan lewat compose.test.yaml (butuh database PostgreSQL),
# bukan lewat `docker build`.
FROM deps AS test
COPY jest.config.js ./
COPY src ./src
COPY migrations ./migrations
COPY tests ./tests
ENV NODE_ENV=test
CMD ["npm", "test"]

# ---------- Stage 3: dependency production saja ----------
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Stage 4: runtime (image yang di-push ke Docker Hub) ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
USER node
EXPOSE 8000
CMD ["node", "src/server.js"]
