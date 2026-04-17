FROM node:20-alpine AS builder

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run db:generate
RUN npm run build --workspace @youtube-roulette/shared
RUN npm run build --workspace @youtube-roulette/realtime

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/realtime/package.json ./apps/realtime/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY prisma ./prisma

RUN npm ci --omit=dev --workspace @youtube-roulette/realtime --workspace @youtube-roulette/shared

COPY --from=builder /app/apps/realtime/dist ./apps/realtime/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 4000

CMD ["npm", "run", "start", "--workspace", "@youtube-roulette/realtime"]
