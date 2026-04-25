FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont openssl

# Thai font support
RUN apk add --no-cache font-noto font-noto-cjk

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

FROM base AS deps
COPY backend/package*.json ./
RUN npm ci --omit=dev

FROM base AS builder
COPY backend/package*.json ./
RUN npm ci
# Copy prisma schema from project root (source of truth)
COPY prisma/ ./prisma/
# Copy backend source
COPY backend/ .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 etax
USER etax

EXPOSE 4000
CMD ["node", "dist/index.js"]
