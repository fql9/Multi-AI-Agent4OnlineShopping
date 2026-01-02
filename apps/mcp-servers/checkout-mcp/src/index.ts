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
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@shopping-agent/common';
import express, { type Request, type Response } from 'express';

import { cartTools, handleCartTool } from './cart/index.js';
import { checkoutTools, handleCheckoutTool } from './checkout/index.js';
import { evidenceTools, handleEvidenceTool } from './evidence/index.js';

const logger = createLogger('checkout-mcp');

// Global error handlers
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error(
    {
      error: reason instanceof Error ? reason : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: String(promise),
    },
    'Unhandled Promise Rejection'
  );
});

process.on('uncaughtException', (error: Error) => {
  logger.error(
    {
      error: error.message,
      stack: error.stack,
      name: error.name,
    },
    'Uncaught Exception'
  );
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

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
  try {
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
      logger.debug({ toolCount: ALL_TOOLS.length }, 'List tools requested');
      return { tools: ALL_TOOLS };
    });

    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info({ 
        tool: name, 
        args: JSON.stringify(args).substring(0, 200)
      }, 'Tool called');

      const handler = toolHandlers[name];
      if (!handler) {
        const error = new Error(`Unknown tool: ${name}`);
        logger.error({ 
          tool: name, 
          availableTools: Object.keys(toolHandlers) 
        }, 'Unknown tool requested');
        throw error;
      }

      try {
        // TODO: Add policy enforcement
        // checkPolicy(name, args, CHECKOUT_POLICIES);

        const result = await handler(args);
        
        const mcpResult = {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };

        logger.debug({ 
          tool: name, 
          resultSize: JSON.stringify(result).length 
        }, 'Tool completed successfully');
        
        return mcpResult;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        logger.error(
          {
            tool: name,
            error: errorMessage,
            stack: errorStack,
          },
          'Tool execution failed'
        );
        
        throw error;
      }
    });

    // Initialize Express app for SSE transport
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    
    // Store transport instance
    let transport: SSEServerTransport | null = null;

    // SSE endpoint for establishing MCP connection
    app.get('/sse', async (_req: Request, res: Response) => {
      try {
        logger.info('SSE connection request received');
        
        transport = new SSEServerTransport('/messages', res);
        await transport.start();
        await server.connect(transport);
        
        logger.info({ 
          sessionId: transport.sessionId 
        }, 'MCP server connected via SSE');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        logger.error(
          {
            error: errorMessage,
            stack: errorStack,
          },
          'Failed to establish SSE connection'
        );
        
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Failed to establish SSE connection',
            message: errorMessage 
          });
        }
      }
    });

    // HTTP POST endpoint for MCP messages
    app.post('/messages', async (req: Request, res: Response): Promise<void> => {
      try {
        if (!transport) {
          logger.warn('POST /messages received but no active SSE transport');
          res.status(400).json({ 
            error: 'No active transport session',
            message: 'Please establish SSE connection at /sse first' 
          });
          return;
        }

        await transport.handlePostMessage(req, res, req.body);
        logger.debug('POST /messages handled successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        logger.error(
          {
            error: errorMessage,
            stack: errorStack,
            body: JSON.stringify(req.body).substring(0, 200),
          },
          'Error handling POST /messages'
        );
        
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Failed to handle message',
            message: errorMessage 
          });
        }
      }
    });

    // Health check endpoint
    app.get('/health', (_req: Request, res: Response) => {
      res.json({ 
        status: 'ok',
        service: 'checkout-mcp',
        transport: transport ? 'connected' : 'disconnected',
        sessionId: transport?.sessionId,
        toolsRegistered: ALL_TOOLS.length,
        timestamp: new Date().toISOString(),
      });
    });

    // Start Express server
    const port = parseInt(process.env.PORT ?? '3011', 10);
    app.listen(port, '0.0.0.0', () => {
      logger.info({
        port,
        endpoints: {
          sse: `http://0.0.0.0:${port}/sse`,
          messages: `http://0.0.0.0:${port}/messages`,
          health: `http://0.0.0.0:${port}/health`,
        },
        toolsCount: ALL_TOOLS.length,
      }, 'Checkout MCP Server started successfully');
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error(
      {
        error: errorMessage,
        stack: errorStack,
      },
      'Failed to start server'
    );
    
    process.exit(1);
  }
}

main().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  logger.error(
    {
      error: errorMessage,
      stack: errorStack,
    },
    'Fatal error in main()'
  );
  process.exit(1);
});
