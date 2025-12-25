/**
 * Gateway Configuration
 */

import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  env: process.env.NODE_ENV ?? 'development',

  // CORS
  corsOrigins: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3001'],

  // Rate limiting
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
  },

  // MCP Servers
  mcpServers: {
    core: process.env.MCP_CORE_URL ?? 'http://localhost:3010',
    checkout: process.env.MCP_CHECKOUT_URL ?? 'http://localhost:3011',
  },

  // Database (for idempotency)
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://agent:agent_dev_password@localhost:5432/agent_db',
  },

  // Auth
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  },
};

