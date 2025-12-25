/**
 * 统一请求/响应 Envelope 定义
 *
 * 所有工具调用必须遵循此格式
 */

import { z } from 'zod';

// ============================================================
// Request Envelope
// ============================================================

export const ActorSchema = z.object({
  type: z.enum(['user', 'agent', 'system']),
  id: z.string(),
});

export const ClientSchema = z.object({
  app: z.enum(['web', 'ios', 'android', 'agent']),
  version: z.string(),
});

export const TraceSchema = z.object({
  span_id: z.string().optional(),
  parent_span_id: z.string().optional(),
});

export const RequestEnvelopeSchema = z.object({
  request_id: z.string().uuid(),
  actor: ActorSchema,
  user_id: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  locale: z.string().default('en-US'),
  currency: z.string().length(3).default('USD'),
  timezone: z.string().default('UTC'),
  client: ClientSchema,
  dry_run: z.boolean().default(false),
  idempotency_key: z.string().optional(),
  trace: TraceSchema.optional(),
});

export type RequestEnvelope = z.infer<typeof RequestEnvelopeSchema>;

// ============================================================
// Response Envelope
// ============================================================

export const EvidenceSourceSchema = z.object({
  type: z.enum(['tool', 'cache', 'chunk', 'rule']),
  name: z.string(),
  hash: z.string().optional(),
  ts: z.string().optional(),
});

export const EvidenceSchema = z.object({
  snapshot_id: z.string().optional(),
  sources: z.array(EvidenceSourceSchema).default([]),
});

export const ErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export const ResponseEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.boolean(),
    data: dataSchema.optional(),
    warnings: z.array(z.string()).default([]),
    error: ErrorDetailSchema.optional(),
    ttl_seconds: z.number().optional(),
    evidence: EvidenceSchema.optional(),
  });

export type ResponseEnvelope<T = unknown> = {
  ok: boolean;
  data?: T;
  warnings: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  ttl_seconds?: number;
  evidence?: {
    snapshot_id?: string;
    sources: Array<{
      type: 'tool' | 'cache' | 'chunk' | 'rule';
      name: string;
      hash?: string;
      ts?: string;
    }>;
  };
};

// ============================================================
// Helpers
// ============================================================

export function createSuccessResponse<T>(
  data: T,
  options?: {
    ttl_seconds?: number;
    evidence?: ResponseEnvelope['evidence'];
    warnings?: string[];
  }
): ResponseEnvelope<T> {
  const result: ResponseEnvelope<T> = {
    ok: true,
    data,
    warnings: options?.warnings ?? [],
  };
  if (options?.ttl_seconds !== undefined) {
    result.ttl_seconds = options.ttl_seconds;
  }
  if (options?.evidence !== undefined) {
    result.evidence = options.evidence;
  }
  return result;
}

export function createErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ResponseEnvelope<never> {
  const result: ResponseEnvelope<never> = {
    ok: false,
    warnings: [],
    error: {
      code,
      message,
    },
  };
  if (details !== undefined) {
    result.error!.details = details;
  }
  return result;
}

