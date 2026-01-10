# Web App (Next.js) Dockerfile
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Build-time public envs for Next.js (fallback to high ports)
ARG NEXT_PUBLIC_AGENT_API_URL=http://localhost:28003
ARG NEXT_PUBLIC_TOOL_GATEWAY_URL=http://localhost:28000
ENV NEXT_PUBLIC_AGENT_API_URL=${NEXT_PUBLIC_AGENT_API_URL}
ENV NEXT_PUBLIC_TOOL_GATEWAY_URL=${NEXT_PUBLIC_TOOL_GATEWAY_URL}

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/web-app ./apps/web-app

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build Next.js app
WORKDIR /app/apps/web-app
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Keep public envs available at runtime for clarity
ARG NEXT_PUBLIC_AGENT_API_URL=http://localhost:28003
ARG NEXT_PUBLIC_TOOL_GATEWAY_URL=http://localhost:28000
ENV NEXT_PUBLIC_AGENT_API_URL=${NEXT_PUBLIC_AGENT_API_URL}
ENV NEXT_PUBLIC_TOOL_GATEWAY_URL=${NEXT_PUBLIC_TOOL_GATEWAY_URL}

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/web-app ./apps/web-app

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=base /app/apps/web-app/.next ./apps/web-app/.next
COPY --from=base /app/apps/web-app/package.json ./apps/web-app/package.json

WORKDIR /app/apps/web-app

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["pnpm", "start"]
