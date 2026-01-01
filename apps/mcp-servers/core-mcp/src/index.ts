/**
 * Core MCP Server
 *
 * 合并以下域的工具:
 * - Catalog: 商品搜索与检索
 * - Pricing: 实时价格查询
 * - Shipping: 物流与地址
 * - Tax: 税费估算
 * - Compliance: 合规检查
 * - Knowledge: RAG 检索
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@shopping-agent/common';
import express, { type Request, type Response } from 'express';

import { catalogTools, handleCatalogTool } from './catalog/index.js';
import { pricingTools, handlePricingTool } from './pricing/index.js';
import { shippingTools, handleShippingTool } from './shipping/index.js';
import { taxTools, handleTaxTool } from './tax/index.js';
import { complianceTools, handleComplianceTool } from './compliance/index.js';

const logger = createLogger('core-mcp');

// Global error handlers - must be set before any async operations
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error(
    {
      error: reason instanceof Error ? reason : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: String(promise),
    },
    'Unhandled Promise Rejection'
  );
  // Don't exit immediately, let the error be logged
  // The process will exit naturally if stdio closes
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
  // Exit after logging to prevent undefined behavior
  process.exit(1);
});

// Handle SIGTERM and SIGINT gracefully
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// 所有工具定义
const ALL_TOOLS = [
  ...catalogTools,
  ...pricingTools,
  ...shippingTools,
  ...taxTools,
  ...complianceTools,
];

// 工具处理器映射
const toolHandlers: Record<string, (params: unknown) => Promise<unknown>> = {
  // Catalog
  'catalog.search_offers': handleCatalogTool('search_offers'),
  'catalog.get_offer_card': handleCatalogTool('get_offer_card'),
  'catalog.get_offer_variants': handleCatalogTool('get_offer_variants'),
  'catalog.get_availability': handleCatalogTool('get_availability'),

  // Pricing
  'pricing.get_realtime_quote': handlePricingTool('get_realtime_quote'),

  // Shipping
  'shipping.validate_address': handleShippingTool('validate_address'),
  'shipping.quote_options': handleShippingTool('quote_options'),

  // Tax
  'tax.estimate_duties_and_taxes': handleTaxTool('estimate_duties_and_taxes'),
  'tax.get_hs_code_suggestion': handleTaxTool('get_hs_code_suggestion'),

  // Compliance
  'compliance.check_item': handleComplianceTool('check_item'),
  'compliance.policy_ruleset_version': handleComplianceTool('policy_ruleset_version'),
};

async function main() {
  try {
    logger.info('Starting Core MCP Server...');
    logger.info({
      nodeVersion: process.version,
      env: process.env.NODE_ENV,
      dbHost: process.env.DB_HOST,
      dbPort: process.env.DB_PORT,
      dbName: process.env.DB_NAME,
    }, 'Environment configuration');

    // Initialize MCP Server
    const server = new Server(
      {
        name: 'core-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register List Tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug({ toolCount: ALL_TOOLS.length }, 'List tools requested');
      return { tools: ALL_TOOLS };
    });

    // Register Call Tool handler - routes to appropriate tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info({ 
        tool: name, 
        args: JSON.stringify(args).substring(0, 200) // Truncate long args for logging
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
        // Execute tool handler
        const result = await handler(args);
        
        // Wrap result in MCP standard format
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
        
        // Re-throw to let MCP SDK handle error response
        throw error;
      }
    });

    // Initialize Express app for SSE transport
    const app = express();
    
    // CRITICAL: Must use express.json() middleware BEFORE routes
    // This ensures POST /messages can parse request body
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    
    // Store transport instance (will be set when SSE connection is established)
    let transport: SSEServerTransport | null = null;

    // SSE endpoint for establishing MCP connection
    app.get('/sse', async (_req: Request, res: Response) => {
      try {
        logger.info('SSE connection request received');
        
        // Create new SSE transport instance
        transport = new SSEServerTransport('/messages', res);
        
        // Start SSE stream (sends initial headers and endpoint info)
        await transport.start();
        
        // Connect MCP server to transport
        await server.connect(transport);
        
        logger.info({ 
          sessionId: transport.sessionId 
        }, 'MCP server connected via SSE');
        
        // Transport will keep connection alive until client disconnects
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

    // HTTP POST endpoint for MCP messages (tool calls, etc.)
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

        // Handle the MCP message via transport
        // This will route to appropriate server handler (e.g., CallToolRequestSchema)
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
        service: 'core-mcp',
        transport: transport ? 'connected' : 'disconnected',
        sessionId: transport?.sessionId,
        toolsRegistered: ALL_TOOLS.length,
        timestamp: new Date().toISOString(),
      });
    });

    // Start Express server
    const port = parseInt(process.env.PORT ?? '3010', 10);
    app.listen(port, '0.0.0.0', () => {
      logger.info({
        port,
        endpoints: {
          sse: `http://0.0.0.0:${port}/sse`,
          messages: `http://0.0.0.0:${port}/messages`,
          health: `http://0.0.0.0:${port}/health`,
        },
        toolsCount: ALL_TOOLS.length,
      }, 'Core MCP Server started successfully');
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

// Start the server
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

