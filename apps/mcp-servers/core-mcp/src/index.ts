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
import express from 'express';

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

    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('List tools requested');
      return { tools: ALL_TOOLS };
    });

    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info({ tool: name, args: JSON.stringify(args) }, 'Tool called');

      const handler = toolHandlers[name];
      if (!handler) {
        const error = new Error(`Unknown tool: ${name}`);
        logger.error({ tool: name, availableTools: Object.keys(toolHandlers) }, 'Unknown tool');
        throw error;
      }

      try {
        const result = await handler(args);
        logger.debug({ tool: name, resultSize: JSON.stringify(result).length }, 'Tool completed');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.error(
          {
            tool: name,
            error: errorMessage,
            stack: errorStack,
          },
          'Tool execution error'
        );
        throw error;
      }
    });

    // Start server with SSE (HTTP) transport
    // This allows Tool Gateway to connect via HTTP
    const app = express();
    app.use(express.json());
    
    let transport: SSEServerTransport | null = null;

    // SSE endpoint for client connections
    app.get('/sse', async (req, res) => {
      try {
        logger.info('New SSE connection request');
        transport = new SSEServerTransport('/messages', res);
        await transport.start();
        await server.connect(transport);
        logger.info('MCP server connected via SSE');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, 'Failed to establish SSE connection');
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to establish SSE connection' });
        }
      }
    });

    // HTTP POST endpoint for client messages
    app.post('/messages', async (req, res) => {
      try {
        if (!transport) {
          logger.warn('Received message but no active transport session');
          return res.status(400).json({ error: 'No active transport session. Please connect to /sse first.' });
        }
        await transport.handlePostMessage(req, res, req.body);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, 'Error handling POST message');
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to handle message' });
        }
      }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        transport: transport ? 'connected' : 'disconnected',
        sessionId: transport?.sessionId 
      });
    });

    const port = parseInt(process.env.PORT ?? '3010', 10);
    app.listen(port, '0.0.0.0', () => {
      logger.info(`Core MCP Server listening on port ${port}`);
      logger.info(`SSE endpoint: http://0.0.0.0:${port}/sse`);
      logger.info(`Messages endpoint: http://0.0.0.0:${port}/messages`);
      logger.info(`Health check: http://0.0.0.0:${port}/health`);
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

