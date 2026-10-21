FROM node:24-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node database/migrations ./database/migrations
COPY --chown=node:node scripts ./scripts
USER node

FROM base AS test
COPY --chown=node:node tests ./tests
CMD ["npm", "test"]

FROM base AS production
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
