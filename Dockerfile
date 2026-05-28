# ── Build frontend ──────────────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Build API ────────────────────────────────────────────────
FROM node:20-slim AS api-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=api-builder  /app/dist       ./dist
COPY --from=frontend-builder /frontend/dist ./public

RUN mkdir -p /data

EXPOSE 8080
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/flowshift.db

CMD ["node", "dist/index.js"]
