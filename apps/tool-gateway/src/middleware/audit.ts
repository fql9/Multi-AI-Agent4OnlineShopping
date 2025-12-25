/**
 * Audit Middleware
 *
 * 记录所有工具调用到审计日志
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { createLogger } from '@shopping-agent/common';

const logger = createLogger('audit');

const auditPluginImpl: FastifyPluginAsync = async (fastify) => {
  fastify.addHook(
    'onResponse',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Only audit tool calls
      if (!request.url.startsWith('/tools/')) {
        return;
      }

      const envelope = request.envelope;
      const latency = reply.elapsedTime;

      // Log audit entry
      logger.info({
        request_id: envelope?.request_id ?? request.id,
        actor_type: envelope?.actor?.type,
        actor_id: envelope?.actor?.id,
        user_id: envelope?.user_id,
        tool_path: request.url,
        method: request.method,
        status_code: reply.statusCode,
        latency_ms: Math.round(latency),
      });

      // TODO: Write to database for persistent audit trail
      // await db.audit_logs.insert({...})
    }
  );
};

export const auditPlugin = fp(auditPluginImpl, {
  name: 'audit',
});

