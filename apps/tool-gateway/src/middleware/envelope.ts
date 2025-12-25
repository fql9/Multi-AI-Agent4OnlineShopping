/**
 * Envelope Middleware
 *
 * - 校验请求 Envelope 格式
 * - 注入标准响应 Envelope
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import {
  RequestEnvelopeSchema,
  createSuccessResponse,
  createErrorResponse,
} from '@shopping-agent/common';

declare module 'fastify' {
  interface FastifyRequest {
    envelope?: {
      request_id: string;
      user_id?: string;
      actor: { type: string; id: string };
      idempotency_key?: string;
    };
  }
}

const envelopePluginImpl: FastifyPluginAsync = async (fastify) => {
  // Pre-handler hook to validate envelope
  fastify.addHook(
    'preHandler',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip for health check and other non-tool routes
      if (!request.url.startsWith('/tools/')) {
        return;
      }

      try {
        const body = request.body as Record<string, unknown>;

        // Validate envelope
        const result = RequestEnvelopeSchema.safeParse(body);
        if (!result.success) {
          return reply.status(400).send(
            createErrorResponse(
              'INVALID_ARGUMENT',
              'Invalid request envelope',
              { errors: result.error.flatten() }
            )
          );
        }

        // Attach envelope to request
        request.envelope = {
          request_id: result.data.request_id,
          user_id: result.data.user_id ?? undefined,
          actor: result.data.actor,
          idempotency_key: result.data.idempotency_key,
        };
      } catch (error) {
        return reply.status(400).send(
          createErrorResponse('INVALID_ARGUMENT', 'Failed to parse request body')
        );
      }
    }
  );

  // Decorate reply with envelope helpers
  fastify.decorateReply('sendSuccess', function <T>(this: FastifyReply, data: T) {
    return this.send(createSuccessResponse(data));
  });

  fastify.decorateReply(
    'sendError',
    function (this: FastifyReply, code: string, message: string) {
      return this.send(createErrorResponse(code, message));
    }
  );
};

export const envelopePlugin = fp(envelopePluginImpl, {
  name: 'envelope',
});

