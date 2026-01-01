# Tool Gateway Dockerfile
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/common ./packages/common
COPY apps/tool-gateway ./apps/tool-gateway

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build common package first
WORKDIR /app/packages/common
RUN pnpm build

# Build tool-gateway
WORKDIR /app/apps/tool-gateway
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/common ./packages/common
COPY apps/tool-gateway ./apps/tool-gateway

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=base /app/packages/common/dist ./packages/common/dist
COPY --from=base /app/apps/tool-gateway/dist ./apps/tool-gateway/dist

WORKDIR /app/apps/tool-gateway

EXPOSE 3000

CMD ["node", "dist/index.js"]
