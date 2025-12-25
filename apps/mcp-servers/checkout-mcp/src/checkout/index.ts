/**
 * Checkout Tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const checkoutTools: Tool[] = [
  {
    name: 'checkout.compute_total',
    description: 'Compute total payable amount',
    inputSchema: {
      type: 'object',
      properties: {
        cart_id: { type: 'string' },
        address_id: { type: 'string' },
        shipping_option_id: { type: 'string' },
      },
      required: ['cart_id', 'address_id', 'shipping_option_id'],
    },
  },
  {
    name: 'checkout.create_draft_order',
    description: 'Create draft order (does NOT capture payment)',
    inputSchema: {
      type: 'object',
      properties: {
        cart_id: { type: 'string' },
        address_id: { type: 'string' },
        shipping_option_id: { type: 'string' },
        consents: {
          type: 'object',
          properties: {
            tax_estimate_ack: { type: 'boolean' },
            return_policy_ack: { type: 'boolean' },
            compliance_ack: { type: 'boolean' },
          },
        },
      },
      required: ['cart_id', 'address_id', 'shipping_option_id'],
    },
  },
  {
    name: 'checkout.get_draft_order_summary',
    description: 'Get draft order summary for user confirmation',
    inputSchema: {
      type: 'object',
      properties: {
        draft_order_id: { type: 'string' },
      },
      required: ['draft_order_id'],
    },
  },
];

export function handleCheckoutTool(tool: string) {
  return async (params: unknown): Promise<unknown> => {
    const p = params as Record<string, unknown>;

    switch (tool) {
      case 'compute_total':
        return {
          cart_id: p.cart_id,
          subtotal: 49.99,
          shipping: 5.99,
          tax_estimate: 4.5,
          total: 60.48,
          currency: 'USD',
          breakdown: [
            { type: 'item_subtotal', amount: 49.99 },
            { type: 'shipping', amount: 5.99 },
            { type: 'tax', amount: 4.5 },
          ],
          assumptions: ['Tax estimate based on destination ZIP code'],
        };

      case 'create_draft_order':
        const draftOrderId = `do_${crypto.randomUUID().slice(0, 12)}`;
        return {
          draft_order_id: draftOrderId,
          status: 'pending_confirmation',
          payable_amount: { amount: 60.48, currency: 'USD' },
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          confirmation_items: [
            {
              type: 'tax_estimate_uncertainty',
              title: 'Tax Estimate',
              description: 'Final tax may vary based on actual import declaration',
              requires_ack: true,
            },
          ],
          // ⚠️ 关键：标记需要用户确认
          requires_user_action: true,
        };

      case 'get_draft_order_summary':
        return {
          draft_order_id: p.draft_order_id,
          status: 'pending_confirmation',
          items: [{ sku_id: 'sku_001', title: 'Test Product', quantity: 1, price: 49.99 }],
          total: 60.48,
          currency: 'USD',
          shipping: { carrier: 'Standard', eta: '7-14 days' },
          confirmation_required: true,
        };

      default:
        throw new Error(`Unknown checkout tool: ${tool}`);
    }
  };
}

