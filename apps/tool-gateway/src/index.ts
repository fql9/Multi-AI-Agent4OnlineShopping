/**
 * Tool Gateway - 统一工具网关
 *
 * 职责:
 * - 请求 Envelope 校验
 * - 身份验证与授权
 * - 幂等性保证
 * - 限流
 * - 审计日志
 * - 路由到 MCP Servers
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createLogger } from '@shopping-agent/common';
import { config } from './config.js';
import { envelopePlugin } from './middleware/envelope.js';
import { auditPlugin } from './middleware/audit.js';
import { registerRoutes } from './routes/index.js';

const logger = createLogger('tool-gateway');

async function main() {
  const app = Fastify({
    logger: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Security plugins
  await app.register(helmet);
  await app.register(cors, {
    origin: config.corsOrigins,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  });

  // Custom plugins
  await app.register(envelopePlugin);
  await app.register(auditPlugin);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register tool routes
  await registerRoutes(app);

  // Start server
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Tool Gateway listening on port ${config.port}`);
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main();

