/**
 * Checkout MCP Server
 *
 * ⚠️ 高敏感操作服务
 *
 * 包含:
 * - Cart: 购物车操作
 * - Checkout: 结算流程
 * - Payment: 支付意图（不直接扣款）
 * - Evidence: 证据快照
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@shopping-agent/common';

import { cartTools, handleCartTool } from './cart/index.js';
import { checkoutTools, handleCheckoutTool } from './checkout/index.js';
import { evidenceTools, handleEvidenceTool } from './evidence/index.js';

const logger = createLogger('checkout-mcp');

// 所有工具定义
const ALL_TOOLS = [...cartTools, ...checkoutTools, ...evidenceTools];

// 工具处理器映射
const toolHandlers: Record<string, (params: unknown) => Promise<unknown>> = {
  // Cart
  'cart.create': handleCartTool('create'),
  'cart.add_item': handleCartTool('add_item'),
  'cart.remove_item': handleCartTool('remove_item'),
  'cart.update_quantity': handleCartTool('update_quantity'),

  // Checkout
  'checkout.compute_total': handleCheckoutTool('compute_total'),
  'checkout.create_draft_order': handleCheckoutTool('create_draft_order'),
  'checkout.get_draft_order_summary': handleCheckoutTool('get_draft_order_summary'),

  // Evidence
  'evidence.create_snapshot': handleEvidenceTool('create_snapshot'),
  'evidence.attach_to_draft_order': handleEvidenceTool('attach_to_draft_order'),
};

// 策略检查
const CHECKOUT_POLICIES = {
  scopes_required: ['checkout:write'],
  requires_user: true,
  rate_limit: { per_user_per_min: 10 },
  audit: { log_request: true, log_response_hash: true },
};

async function main() {
  logger.info('Starting Checkout MCP Server...');
  logger.info({ policies: CHECKOUT_POLICIES }, 'Security policies loaded');

  const server = new Server(
    {
      name: 'checkout-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: ALL_TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info({ tool: name }, 'Tool called');

    const handler = toolHandlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      // TODO: Add policy enforcement
      // checkPolicy(name, args, CHECKOUT_POLICIES);

      const result = await handler(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error({ tool: name, error }, 'Tool error');
      throw error;
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Checkout MCP Server running');
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});

