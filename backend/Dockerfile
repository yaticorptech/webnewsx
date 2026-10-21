# WebNEWS API — minimal production image (deployment details come later; localhost is the priority).
# docker build -t webnews-api . && docker run --env-file .env -p 4000:4000 webnews-api
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
# City / town / village names for the City boxes (scripts/build-places.ts).
COPY --from=build /app/data ./data
# Local-storage fallback only (production should set the R2_* variables).
RUN mkdir -p .data/uploads && chown -R node:node .data
USER node
EXPOSE 4000
# Apply pending migrations, then serve.
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/src/index.js"]
