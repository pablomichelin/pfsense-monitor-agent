FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN addgroup -S monitor && adduser -S monitor -G monitor
USER monitor
EXPOSE 3000
CMD ["node", "server.js"]
