/**
 * Pricing Tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const pricingTools: Tool[] = [
  {
    name: 'pricing.get_realtime_quote',
    description: 'Get real-time price quote for a SKU',
    inputSchema: {
      type: 'object',
      properties: {
        sku_id: { type: 'string', description: 'SKU ID' },
        quantity: { type: 'integer', default: 1 },
        destination_country: { type: 'string' },
      },
      required: ['sku_id'],
    },
  },
];

export function handlePricingTool(tool: string) {
  return async (params: unknown): Promise<unknown> => {
    const p = params as Record<string, unknown>;

    switch (tool) {
      case 'get_realtime_quote':
        const basePrice = 20 + Math.random() * 80;
        return {
          sku_id: p.sku_id,
          quantity: p.quantity ?? 1,
          unit_price: Math.round(basePrice * 100) / 100,
          currency: 'USD',
          price_components: [
            { type: 'base_price', amount: Math.round(basePrice * 1.1 * 100) / 100 },
            { type: 'discount', amount: -Math.round(basePrice * 0.1 * 100) / 100 },
          ],
          stock: { status: 'in_stock', quantity_available: 50 },
          quote_expire_at: new Date(Date.now() + 60000).toISOString(),
        };

      default:
        throw new Error(`Unknown pricing tool: ${tool}`);
    }
  };
}

