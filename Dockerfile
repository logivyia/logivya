FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:24-alpine AS builder
WORKDIR /app
ARG DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/logivya_build
ENV DATABASE_URL=$DATABASE_URL
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run postinstall
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S logivya && adduser -S logivya -G logivya
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
RUN chown -R logivya:logivya /app
USER logivya
EXPOSE 3000
CMD ["npm", "run", "start"]
