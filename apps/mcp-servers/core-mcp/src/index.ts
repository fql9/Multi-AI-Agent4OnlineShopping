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
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@shopping-agent/common';

import { catalogTools, handleCatalogTool } from './catalog/index.js';
import { pricingTools, handlePricingTool } from './pricing/index.js';
import { shippingTools, handleShippingTool } from './shipping/index.js';
import { taxTools, handleTaxTool } from './tax/index.js';
import { complianceTools, handleComplianceTool } from './compliance/index.js';

const logger = createLogger('core-mcp');

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
  logger.info('Starting Core MCP Server...');

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

  logger.info('Core MCP Server running');
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});

