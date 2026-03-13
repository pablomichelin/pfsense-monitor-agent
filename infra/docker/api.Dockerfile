FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm install
COPY apps/api/prisma ./prisma
RUN npx prisma generate

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api ./
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY apps/api/package*.json ./
COPY apps/api/prisma ./prisma
RUN addgroup -S monitor && adduser -S monitor -G monitor
USER monitor
EXPOSE 8088
CMD ["sh", "-lc", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
