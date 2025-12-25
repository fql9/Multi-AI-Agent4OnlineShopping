/**
 * Tax Tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const taxTools: Tool[] = [
  {
    name: 'tax.estimate_duties_and_taxes',
    description: 'Estimate import duties and taxes for items',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku_id: { type: 'string' },
              declared_value: { type: 'number' },
              hs_code: { type: 'string' },
            },
          },
        },
        shipping_cost: { type: 'number' },
        destination_country: { type: 'string' },
        incoterms: { type: 'string', enum: ['DDP', 'DDU', 'DAP'] },
      },
      required: ['items', 'destination_country'],
    },
  },
  {
    name: 'tax.get_hs_code_suggestion',
    description: 'Get HS code suggestions for a product',
    inputSchema: {
      type: 'object',
      properties: {
        sku_id: { type: 'string' },
        description: { type: 'string' },
        category_path: { type: 'array', items: { type: 'string' } },
      },
      required: ['description'],
    },
  },
];

export function handleTaxTool(tool: string) {
  return async (_params: unknown): Promise<unknown> => {
    switch (tool) {
      case 'estimate_duties_and_taxes':
        return {
          tax_total_estimate: 4.5,
          breakdown: [
            { type: 'VAT', amount: 3.5 },
            { type: 'import_duty', amount: 1.0 },
          ],
          currency: 'USD',
          method: 'rule_based',
          confidence: 'medium',
          required_customs_fields: ['recipient_id_number'],
        };

      case 'get_hs_code_suggestion':
        return {
          hs_candidates: [
            { code: '8504.40', description: 'Static converters', confidence: 0.85 },
            { code: '8504.50', description: 'Other inductors', confidence: 0.6 },
          ],
          requires_human_review: true,
        };

      default:
        throw new Error(`Unknown tax tool: ${tool}`);
    }
  };
}

