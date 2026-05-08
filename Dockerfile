# LTMi-XT — runnable image.
#
#   docker build -t ltmi-xt:0.1 .
#   docker run -p 3030:3030 \
#     -e Q3M_API_KEY=$Q3M_API_KEY \
#     ltmi-xt:0.1
#
# Open http://localhost:3030 in a browser.

FROM node:22-alpine AS build

WORKDIR /app

# Install deps using workspaces — copy only manifests first for caching.
COPY package.json package-lock.json* ./
COPY reference/ts/package.json ./reference/ts/
COPY apps/cli/package.json ./apps/cli/

RUN npm install --include=dev --no-audit --no-fund

# Copy source.
COPY reference/ ./reference/
COPY apps/ ./apps/

# Build both workspaces.
RUN npm run build --workspaces

# ── runtime ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Production deps only.
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/reference/ts/package.json ./reference/ts/
COPY --from=build /app/apps/cli/package.json ./apps/cli/
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Built artifacts + runtime files.
COPY --from=build /app/reference/ts/dist ./reference/ts/dist
COPY --from=build /app/reference/prompts ./reference/prompts
COPY --from=build /app/apps/cli/dist ./apps/cli/dist
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/examples ./examples

ENV NODE_ENV=production
ENV LTMI_HOST=0.0.0.0
ENV LTMI_PORT=3030
EXPOSE 3030

# Run the local server. Provider env vars are passed in by the operator.
CMD ["node", "apps/cli/dist/main.js", "serve", "--host", "0.0.0.0", "--port", "3030"]
