/**
 * Evidence Tool Routes - 证据快照工具
 * 
 * 实现:
 * - evidence.create_snapshot: 创建证据快照
 * - evidence.attach_to_draft_order: 绑定证据到草稿订单
 * - evidence.get_snapshot: 获取证据快照详情
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, createLogger, query, queryOne } from '@shopping-agent/common';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

const logger = createLogger('evidence');

interface ToolCallRecord {
  tool_name: string;
  request: unknown;
  response: unknown;
  response_hash: string;
  called_at: string;
  latency_ms: number;
}

export async function evidenceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * evidence.create_snapshot
   * 
   * 创建证据快照，记录关键决策点的工具调用结果
   * 
   * 输入:
   * - mission_id: 任务 ID
   * - context: 上下文（包含工具调用结果）
   * - tool_calls: 工具调用记录
   */
  app.post('/create_snapshot', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        mission_id?: string;
        draft_order_id?: string;
        context?: {
          offer_ids?: string[];
          destination_country?: string;
          decision_type?: string;
        };
        tool_calls?: ToolCallRecord[];
        metadata?: Record<string, unknown>;
      }
    };

    const missionId = body.params?.mission_id;
    const draftOrderId = body.params?.draft_order_id;
    const context = body.params?.context ?? {};
    const toolCalls = body.params?.tool_calls ?? [];
    const metadata = body.params?.metadata ?? {};

    logger.info({ 
      mission_id: missionId,
      draft_order_id: draftOrderId,
      tool_calls_count: toolCalls.length 
    }, 'Creating evidence snapshot');

    try {
      const snapshotId = `ev_${randomUUID().slice(0, 12)}`;
      
      // 计算快照内容的哈希值
      const snapshotContent = {
        mission_id: missionId,
        context,
        tool_calls: toolCalls,
        metadata,
        created_at: new Date().toISOString(),
      };
      const contentHash = createHash('sha256')
        .update(JSON.stringify(snapshotContent))
        .digest('hex')
        .slice(0, 16);

      // 保存到数据库
      await query(
        `INSERT INTO agent.evidence_snapshots (
          id, mission_id, draft_order_id, context, tool_calls, 
          metadata, content_hash, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          snapshotId,
          missionId,
          draftOrderId,
          JSON.stringify(context),
          JSON.stringify(toolCalls),
          JSON.stringify(metadata),
          contentHash,
        ]
      );

      logger.info({ snapshot_id: snapshotId, content_hash: contentHash }, 'Snapshot created');

      return reply.send(
        createSuccessResponse({
          snapshot_id: snapshotId,
          content_hash: contentHash,
          mission_id: missionId,
          draft_order_id: draftOrderId,
          tool_calls_count: toolCalls.length,
          created_at: snapshotContent.created_at,
          sources: toolCalls.map(tc => ({
            type: 'tool' as const,
            name: tc.tool_name,
            hash: tc.response_hash,
            ts: tc.called_at,
          })),
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to create snapshot');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to create evidence snapshot')
      );
    }
  });

  /**
   * evidence.attach_to_draft_order
   * 
   * 将证据快照绑定到草稿订单
   */
  app.post('/attach_to_draft_order', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        snapshot_id?: string;
        draft_order_id?: string;
      }
    };

    const snapshotId = body.params?.snapshot_id;
    const draftOrderId = body.params?.draft_order_id;

    if (!snapshotId || !draftOrderId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'snapshot_id and draft_order_id are required')
      );
    }

    try {
      // 检查快照是否存在
      const snapshot = await queryOne<{ id: string }>(
        `SELECT id FROM agent.evidence_snapshots WHERE id = $1`,
        [snapshotId]
      );

      if (!snapshot) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'Snapshot not found')
        );
      }

      // 更新快照的 draft_order_id
      await query(
        `UPDATE agent.evidence_snapshots 
         SET draft_order_id = $1, updated_at = NOW() 
         WHERE id = $2`,
        [draftOrderId, snapshotId]
      );

      // 同时更新草稿订单的 evidence_snapshot_id
      await query(
        `UPDATE agent.draft_orders 
         SET evidence_snapshot_id = $1, updated_at = NOW() 
         WHERE id = $2`,
        [snapshotId, draftOrderId]
      );

      logger.info({ snapshot_id: snapshotId, draft_order_id: draftOrderId }, 'Snapshot attached');

      return reply.send(
        createSuccessResponse({
          snapshot_id: snapshotId,
          draft_order_id: draftOrderId,
          attached_at: new Date().toISOString(),
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to attach snapshot');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to attach snapshot')
      );
    }
  });

  /**
   * evidence.get_snapshot
   * 
   * 获取证据快照详情（用于审计和回放）
   */
  app.post('/get_snapshot', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        snapshot_id?: string;
        draft_order_id?: string;
      }
    };

    const snapshotId = body.params?.snapshot_id;
    const draftOrderId = body.params?.draft_order_id;

    if (!snapshotId && !draftOrderId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'snapshot_id or draft_order_id is required')
      );
    }

    try {
      let snapshot;

      if (snapshotId) {
        snapshot = await queryOne<{
          id: string;
          mission_id: string;
          draft_order_id: string;
          context: unknown;
          tool_calls: unknown;
          metadata: unknown;
          content_hash: string;
          created_at: Date;
        }>(
          `SELECT * FROM agent.evidence_snapshots WHERE id = $1`,
          [snapshotId]
        );
      } else {
        snapshot = await queryOne<{
          id: string;
          mission_id: string;
          draft_order_id: string;
          context: unknown;
          tool_calls: unknown;
          metadata: unknown;
          content_hash: string;
          created_at: Date;
        }>(
          `SELECT * FROM agent.evidence_snapshots WHERE draft_order_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [draftOrderId]
        );
      }

      if (!snapshot) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'Snapshot not found')
        );
      }

      return reply.send(
        createSuccessResponse({
          snapshot_id: snapshot.id,
          mission_id: snapshot.mission_id,
          draft_order_id: snapshot.draft_order_id,
          context: snapshot.context,
          tool_calls: snapshot.tool_calls,
          metadata: snapshot.metadata,
          content_hash: snapshot.content_hash,
          created_at: snapshot.created_at,
          // 用于 UI 回放
          replay_url: `/evidence/replay/${snapshot.id}`,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get snapshot');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get snapshot')
      );
    }
  });

  /**
   * evidence.list_snapshots
   * 
   * 列出某个任务/订单的所有证据快照
   */
  app.post('/list_snapshots', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        mission_id?: string;
        draft_order_id?: string;
        limit?: number;
      }
    };

    const missionId = body.params?.mission_id;
    const draftOrderId = body.params?.draft_order_id;
    const limit = Math.min(body.params?.limit ?? 20, 100);

    if (!missionId && !draftOrderId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'mission_id or draft_order_id is required')
      );
    }

    try {
      const condition = missionId ? 'mission_id = $1' : 'draft_order_id = $1';
      const snapshots = await query<{
        id: string;
        mission_id: string;
        draft_order_id: string;
        content_hash: string;
        created_at: Date;
      }>(
        `SELECT id, mission_id, draft_order_id, content_hash, created_at 
         FROM agent.evidence_snapshots 
         WHERE ${condition}
         ORDER BY created_at DESC
         LIMIT $2`,
        [missionId ?? draftOrderId, limit]
      );

      return reply.send(
        createSuccessResponse({
          snapshots: snapshots.map(s => ({
            snapshot_id: s.id,
            mission_id: s.mission_id,
            draft_order_id: s.draft_order_id,
            content_hash: s.content_hash,
            created_at: s.created_at,
          })),
          total: snapshots.length,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to list snapshots');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to list snapshots')
      );
    }
  });
}
