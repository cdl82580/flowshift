FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /data

EXPOSE 8080

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/flowshift.db

CMD ["node", "dist/index.js"]
