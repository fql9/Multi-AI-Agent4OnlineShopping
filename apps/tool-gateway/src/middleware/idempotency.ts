/**
 * Idempotency Middleware
 *
 * 保证写操作的幂等性
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { createErrorResponse, createLogger } from '@shopping-agent/common';

const logger = createLogger('idempotency');

// In-memory store for development
// TODO: Replace with Redis or PostgreSQL in production
const idempotencyStore = new Map<
  string,
  {
    response: unknown;
    status: 'processing' | 'completed';
    expiresAt: Date;
  }
>();

/**
 * 检查幂等性
 */
export async function checkIdempotency(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const envelope = request.envelope;
  if (!envelope?.idempotency_key) {
    return false; // No idempotency key, continue normally
  }

  const key = `${envelope.user_id ?? 'anon'}:${request.url}:${envelope.idempotency_key}`;
  const existing = idempotencyStore.get(key);

  if (existing) {
    if (existing.status === 'processing') {
      // Request is still processing
      await reply.status(409).send(
        createErrorResponse(
          'IDEMPOTENCY_CONFLICT',
          'Request is still being processed'
        )
      );
      return true;
    }

    if (existing.expiresAt > new Date()) {
      // Return cached response
      logger.info({ key }, 'Returning cached idempotent response');
      await reply.send(existing.response);
      return true;
    }

    // Expired, remove and continue
    idempotencyStore.delete(key);
  }

  // Mark as processing
  idempotencyStore.set(key, {
    response: null,
    status: 'processing',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  });

  return false;
}

/**
 * 保存幂等响应
 */
export function saveIdempotentResponse(
  request: FastifyRequest,
  response: unknown
): void {
  const envelope = request.envelope;
  if (!envelope?.idempotency_key) {
    return;
  }

  const key = `${envelope.user_id ?? 'anon'}:${request.url}:${envelope.idempotency_key}`;
  idempotencyStore.set(key, {
    response,
    status: 'completed',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
}

