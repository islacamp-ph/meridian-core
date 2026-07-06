FROM node:20-alpine AS base
WORKDIR /app

FROM base AS build
COPY . .
RUN find . -name '*.tsbuildinfo' -delete
RUN npm ci
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/cli/package.json packages/cli/package.json
RUN npm ci --omit=dev
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/ai/dist ./packages/ai/dist
COPY --from=build /app/packages/api/dist ./packages/api/dist
EXPOSE 3000
CMD ["node", "packages/api/dist/index.js"]
