/**
 * Evidence Tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const evidenceTools: Tool[] = [
  {
    name: 'evidence.create_snapshot',
    description: 'Create evidence snapshot for audit trail',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'object',
          properties: {
            user_id: { type: 'string' },
            session_id: { type: 'string' },
            mission_id: { type: 'string' },
            objects: { type: 'object' },
          },
        },
        tool_calls: { type: 'array' },
        citations: { type: 'array' },
      },
    },
  },
  {
    name: 'evidence.attach_to_draft_order',
    description: 'Attach evidence snapshot to draft order',
    inputSchema: {
      type: 'object',
      properties: {
        draft_order_id: { type: 'string' },
        snapshot_id: { type: 'string' },
      },
      required: ['draft_order_id', 'snapshot_id'],
    },
  },
];

export function handleEvidenceTool(tool: string) {
  return async (params: unknown): Promise<unknown> => {
    const p = params as Record<string, unknown>;
    const context = p.context as Record<string, unknown> | undefined;

    switch (tool) {
      case 'create_snapshot':
        const snapshotId = `ev_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${crypto.randomUUID().slice(0, 8)}`;
        return {
          snapshot_id: snapshotId,
          user_id: context?.user_id,
          mission_id: context?.mission_id,
          objects: context?.objects ?? {},
          tool_calls_count: (p.tool_calls as unknown[] | undefined)?.length ?? 0,
          citations_count: (p.citations as unknown[] | undefined)?.length ?? 0,
          created_at: new Date().toISOString(),
        };

      case 'attach_to_draft_order':
        return {
          draft_order_id: p.draft_order_id,
          snapshot_id: p.snapshot_id,
          attached_at: new Date().toISOString(),
        };

      default:
        throw new Error(`Unknown evidence tool: ${tool}`);
    }
  };
}

