/**
 * Shipping Tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const shippingTools: Tool[] = [
  {
    name: 'shipping.validate_address',
    description: 'Validate and normalize shipping address',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string' },
        state: { type: 'string' },
        city: { type: 'string' },
        postal_code: { type: 'string' },
        address_line1: { type: 'string' },
      },
      required: ['country'],
    },
  },
  {
    name: 'shipping.quote_options',
    description: 'Get available shipping options and quotes',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku_id: { type: 'string' },
              qty: { type: 'integer' },
            },
          },
        },
        destination: {
          type: 'object',
          properties: {
            country: { type: 'string' },
            postal_code: { type: 'string' },
          },
        },
      },
      required: ['items'],
    },
  },
];

export function handleShippingTool(tool: string) {
  return async (params: unknown): Promise<unknown> => {
    const p = params as Record<string, unknown>;

    switch (tool) {
      case 'validate_address':
        return {
          normalized_address: {
            country: p.country ?? 'US',
            state: p.state ?? 'CA',
            city: p.city ?? 'Los Angeles',
            postal_code: p.postal_code ?? '90001',
            address_line1: p.address_line1 ?? '123 Main St',
          },
          is_deliverable: true,
          suggestions: [],
        };

      case 'quote_options':
        return {
          options: [
            {
              shipping_option_id: 'ship_standard',
              carrier: 'Standard Shipping',
              service_level: 'standard',
              price: 5.99,
              currency: 'USD',
              eta_min_days: 7,
              eta_max_days: 14,
              tracking_supported: true,
            },
            {
              shipping_option_id: 'ship_express',
              carrier: 'Express Shipping',
              service_level: 'express',
              price: 15.99,
              currency: 'USD',
              eta_min_days: 3,
              eta_max_days: 5,
              tracking_supported: true,
            },
          ],
          quote_expire_at: new Date(Date.now() + 300000).toISOString(),
        };

      default:
        throw new Error(`Unknown shipping tool: ${tool}`);
    }
  };
}

