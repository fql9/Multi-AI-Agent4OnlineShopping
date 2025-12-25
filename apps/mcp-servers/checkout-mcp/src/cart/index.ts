/**
 * Cart Tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const cartTools: Tool[] = [
  {
    name: 'cart.create',
    description: 'Create a new shopping cart',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        session_id: { type: 'string' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'cart.add_item',
    description: 'Add item to cart',
    inputSchema: {
      type: 'object',
      properties: {
        cart_id: { type: 'string' },
        sku_id: { type: 'string' },
        quantity: { type: 'integer', default: 1 },
        selected_options: { type: 'object' },
      },
      required: ['cart_id', 'sku_id'],
    },
  },
  {
    name: 'cart.remove_item',
    description: 'Remove item from cart',
    inputSchema: {
      type: 'object',
      properties: {
        cart_id: { type: 'string' },
        sku_id: { type: 'string' },
      },
      required: ['cart_id', 'sku_id'],
    },
  },
  {
    name: 'cart.update_quantity',
    description: 'Update item quantity in cart',
    inputSchema: {
      type: 'object',
      properties: {
        cart_id: { type: 'string' },
        sku_id: { type: 'string' },
        quantity: { type: 'integer' },
      },
      required: ['cart_id', 'sku_id', 'quantity'],
    },
  },
];

export function handleCartTool(tool: string) {
  return async (params: unknown): Promise<unknown> => {
    const p = params as Record<string, unknown>;

    switch (tool) {
      case 'create':
        const cartId = `cart_${crypto.randomUUID().slice(0, 12)}`;
        return {
          cart_id: cartId,
          status: 'active',
          items: [],
          created_at: new Date().toISOString(),
        };

      case 'add_item':
        return {
          cart_id: p.cart_id,
          items: [
            {
              sku_id: p.sku_id,
              quantity: p.quantity ?? 1,
              selected_options: p.selected_options ?? {},
            },
          ],
          updated_at: new Date().toISOString(),
        };

      case 'remove_item':
        return {
          cart_id: p.cart_id,
          items: [],
          updated_at: new Date().toISOString(),
        };

      case 'update_quantity':
        return {
          cart_id: p.cart_id,
          items: [{ sku_id: p.sku_id, quantity: p.quantity }],
          updated_at: new Date().toISOString(),
        };

      default:
        throw new Error(`Unknown cart tool: ${tool}`);
    }
  };
}

