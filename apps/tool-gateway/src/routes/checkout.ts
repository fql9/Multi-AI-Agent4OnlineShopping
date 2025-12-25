/**
 * Checkout Tool Routes - 结算工具
 * 
 * 实现:
 * - checkout.create_cart: 创建购物车
 * - checkout.add_to_cart: 添加商品到购物车
 * - checkout.compute_total: 计算总价
 * - checkout.create_draft_order: 创建草稿订单
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, createLogger, query, queryOne, transaction } from '@shopping-agent/common';
import { randomUUID } from 'crypto';

const logger = createLogger('checkout');

interface CartRow {
  id: string;
  user_id: string;
  status: string;
  items: unknown;
  created_at: Date;
  updated_at: Date;
}

interface CartItem {
  sku_id: string;
  offer_id: string;
  quantity: number;
  unit_price: number;
  currency: string;
}

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  /**
   * checkout.create_cart
   * 
   * 创建新的购物车
   */
  app.post('/create_cart', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        user_id?: string;
      }
    };

    const userId = body.params?.user_id ?? 'anonymous';
    const cartId = `cart_${randomUUID().slice(0, 8)}`;

    logger.info({ cart_id: cartId, user_id: userId }, 'Creating cart');

    try {
      await query(
        `INSERT INTO agent.carts (id, user_id, status, items, created_at, updated_at)
         VALUES ($1, $2, 'active', '[]'::jsonb, NOW(), NOW())`,
        [cartId, userId]
      );

      return reply.send(
        createSuccessResponse({
          cart_id: cartId,
          user_id: userId,
          status: 'active',
          items: [],
          created_at: new Date().toISOString(),
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to create cart');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to create cart')
      );
    }
  });

  /**
   * checkout.add_to_cart
   * 
   * 添加商品到购物车
   */
  app.post('/add_to_cart', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        cart_id?: string;
        sku_id?: string;
        offer_id?: string;
        quantity?: number;
      }
    };

    const cartId = body.params?.cart_id;
    const skuId = body.params?.sku_id;
    const offerId = body.params?.offer_id;
    const quantity = body.params?.quantity ?? 1;

    if (!cartId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'cart_id is required')
      );
    }

    if (!skuId && !offerId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'sku_id or offer_id is required')
      );
    }

    logger.info({ cart_id: cartId, sku_id: skuId, quantity }, 'Adding to cart');

    try {
      // 获取购物车
      const cart = await queryOne<CartRow>(
        `SELECT * FROM agent.carts WHERE id = $1 AND status = 'active'`,
        [cartId]
      );

      if (!cart) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'Cart not found or not active')
        );
      }

      // 获取 SKU 信息
      const sku = await queryOne<{ id: string; offer_id: string; price: number; currency: string; stock: number }>(
        `SELECT id, offer_id, price, currency, stock FROM agent.skus WHERE id = $1`,
        [skuId ?? `${offerId}_default`]
      );

      if (!sku) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'SKU not found')
        );
      }

      if (sku.stock < quantity) {
        return reply.status(409).send(
          createErrorResponse('OUT_OF_STOCK', `Insufficient stock. Available: ${sku.stock}`)
        );
      }

      // 更新购物车
      const items = (cart.items as CartItem[]) ?? [];
      const existingIndex = items.findIndex(item => item.sku_id === sku.id);

      if (existingIndex >= 0) {
        items[existingIndex].quantity += quantity;
      } else {
        items.push({
          sku_id: sku.id,
          offer_id: sku.offer_id,
          quantity,
          unit_price: parseFloat(String(sku.price)),
          currency: sku.currency,
        });
      }

      await query(
        `UPDATE agent.carts SET items = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(items), cartId]
      );

      return reply.send(
        createSuccessResponse({
          cart_id: cartId,
          items,
          item_count: items.reduce((sum, item) => sum + item.quantity, 0),
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to add to cart');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to add to cart')
      );
    }
  });

  /**
   * checkout.compute_total
   * 
   * 计算购物车总价
   */
  app.post('/compute_total', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        cart_id?: string;
        destination_country?: string;
        shipping_option_id?: string;
      }
    };

    const cartId = body.params?.cart_id;
    const destinationCountry = body.params?.destination_country ?? 'US';

    if (!cartId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'cart_id is required')
      );
    }

    try {
      const cart = await queryOne<CartRow>(
        `SELECT * FROM agent.carts WHERE id = $1`,
        [cartId]
      );

      if (!cart) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'Cart not found')
        );
      }

      const items = (cart.items as CartItem[]) ?? [];

      // 计算小计
      const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

      // 估算运费（简化）
      const shippingEstimate = subtotal > 50 ? 0 : 9.99; // 满 $50 免运费

      // 估算税费（简化：美国 8%）
      const taxRate = destinationCountry === 'US' ? 0.08 : 0.15;
      const taxEstimate = subtotal * taxRate;

      // 总计
      const total = subtotal + shippingEstimate + taxEstimate;

      return reply.send(
        createSuccessResponse({
          cart_id: cartId,
          destination_country: destinationCountry,
          currency: 'USD',
          breakdown: [
            { type: 'subtotal', amount: Math.round(subtotal * 100) / 100, label: 'Subtotal' },
            { type: 'shipping', amount: Math.round(shippingEstimate * 100) / 100, label: shippingEstimate === 0 ? 'Free Shipping' : 'Shipping' },
            { type: 'tax', amount: Math.round(taxEstimate * 100) / 100, label: `Tax (${(taxRate * 100).toFixed(0)}%)` },
          ],
          total: Math.round(total * 100) / 100,
          items_count: items.reduce((sum, item) => sum + item.quantity, 0),
          computed_at: new Date().toISOString(),
        }, {
          ttl_seconds: 60,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to compute total');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to compute total')
      );
    }
  });

  /**
   * checkout.create_draft_order
   * 
   * 创建草稿订单（核心 - 不扣款）
   * 
   * 必须包含:
   * - consents: 用户确认项
   * - idempotency_key: 幂等键
   */
  app.post('/create_draft_order', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      request_id?: string;
      idempotency_key?: string;
      params?: {
        cart_id?: string;
        address_id?: string;
        shipping_option_id?: string;
        destination_country?: string;
        consents?: {
          tax_estimate_ack?: boolean;
          return_policy_ack?: boolean;
          compliance_ack?: boolean;
        };
      }
    };

    const idempotencyKey = body.idempotency_key ?? body.request_id ?? randomUUID();
    const cartId = body.params?.cart_id;
    const addressId = body.params?.address_id ?? 'addr_default';
    const shippingOptionId = body.params?.shipping_option_id ?? 'ship_standard';
    const destinationCountry = body.params?.destination_country ?? 'US';
    const consents = body.params?.consents ?? {};

    if (!cartId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'cart_id is required')
      );
    }

    // 检查 consents
    if (!consents.tax_estimate_ack || !consents.return_policy_ack) {
      return reply.status(400).send(
        createErrorResponse('NEEDS_USER_CONFIRMATION', 'User must acknowledge tax estimate and return policy')
      );
    }

    logger.info({ 
      cart_id: cartId, 
      idempotency_key: idempotencyKey,
      destination_country: destinationCountry 
    }, 'Creating draft order');

    try {
      // 检查幂等性 - 是否已存在相同的草稿订单
      const existingOrder = await queryOne<{ id: string }>(
        `SELECT id FROM agent.draft_orders WHERE idempotency_key = $1`,
        [idempotencyKey]
      );

      if (existingOrder) {
        // 返回已存在的订单
        const order = await queryOne<{ id: string; payable_amount: number; expires_at: Date }>(
          `SELECT id, payable_amount, expires_at FROM agent.draft_orders WHERE id = $1`,
          [existingOrder.id]
        );
        return reply.send(
          createSuccessResponse({
            draft_order_id: order?.id,
            payable_amount: order?.payable_amount,
            currency: 'USD',
            expires_at: order?.expires_at,
            is_duplicate: true,
          })
        );
      }

      // 获取购物车
      const cart = await queryOne<CartRow>(
        `SELECT * FROM agent.carts WHERE id = $1 AND status = 'active'`,
        [cartId]
      );

      if (!cart) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'Cart not found or not active')
        );
      }

      const items = (cart.items as CartItem[]) ?? [];
      if (items.length === 0) {
        return reply.status(400).send(
          createErrorResponse('INVALID_ARGUMENT', 'Cart is empty')
        );
      }

      // 计算总价
      const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
      const shippingCost = subtotal > 50 ? 0 : 9.99;
      const taxRate = destinationCountry === 'US' ? 0.08 : 0.15;
      const taxEstimate = subtotal * taxRate;
      const payableAmount = Math.round((subtotal + shippingCost + taxEstimate) * 100) / 100;

      // 创建草稿订单
      const draftOrderId = `do_${randomUUID().slice(0, 12)}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 分钟后过期

      await transaction(async (client) => {
        // 插入草稿订单
        await client.query(
          `INSERT INTO agent.draft_orders (
            id, user_id, cart_id, address_id, shipping_option_id,
            destination_country, items, subtotal, shipping_cost, tax_estimate,
            payable_amount, currency, consents, idempotency_key,
            status, expires_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())`,
          [
            draftOrderId,
            cart.user_id,
            cartId,
            addressId,
            shippingOptionId,
            destinationCountry,
            JSON.stringify(items),
            subtotal,
            shippingCost,
            taxEstimate,
            payableAmount,
            'USD',
            JSON.stringify(consents),
            idempotencyKey,
            'pending',
            expiresAt,
          ]
        );

        // 更新购物车状态
        await client.query(
          `UPDATE agent.carts SET status = 'checkout', updated_at = NOW() WHERE id = $1`,
          [cartId]
        );
      });

      logger.info({ 
        draft_order_id: draftOrderId, 
        payable_amount: payableAmount 
      }, 'Draft order created');

      return reply.send(
        createSuccessResponse({
          draft_order_id: draftOrderId,
          payable_amount: payableAmount,
          currency: 'USD',
          expires_at: expiresAt.toISOString(),
          confirmation_items: [
            { type: 'tax_estimate', acknowledged: consents.tax_estimate_ack },
            { type: 'return_policy', acknowledged: consents.return_policy_ack },
            { type: 'compliance', acknowledged: consents.compliance_ack ?? false },
          ],
          requires_user_action: true, // 支付必须由用户确认
        }, {
          evidence: {
            snapshot_id: `draft_${draftOrderId}`,
            sources: [
              { type: 'tool', name: 'checkout.create_draft_order', ts: new Date().toISOString() }
            ]
          }
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to create draft order');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to create draft order')
      );
    }
  });

  /**
   * checkout.get_draft_order_summary
   * 
   * 获取草稿订单摘要（用于支付前展示）
   */
  app.post('/get_draft_order_summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        draft_order_id?: string;
      }
    };

    const draftOrderId = body.params?.draft_order_id;

    if (!draftOrderId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'draft_order_id is required')
      );
    }

    try {
      const order = await queryOne<{
        id: string;
        items: unknown;
        subtotal: number;
        shipping_cost: number;
        tax_estimate: number;
        payable_amount: number;
        currency: string;
        destination_country: string;
        expires_at: Date;
        status: string;
      }>(
        `SELECT * FROM agent.draft_orders WHERE id = $1`,
        [draftOrderId]
      );

      if (!order) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'Draft order not found')
        );
      }

      // 检查是否过期
      if (new Date(order.expires_at) < new Date()) {
        return reply.status(410).send(
          createErrorResponse('EXPIRED', 'Draft order has expired')
        );
      }

      return reply.send(
        createSuccessResponse({
          draft_order_id: order.id,
          status: order.status,
          destination_country: order.destination_country,
          items: order.items,
          breakdown: [
            { type: 'subtotal', amount: parseFloat(String(order.subtotal)) },
            { type: 'shipping', amount: parseFloat(String(order.shipping_cost)) },
            { type: 'tax', amount: parseFloat(String(order.tax_estimate)) },
          ],
          payable_amount: parseFloat(String(order.payable_amount)),
          currency: order.currency,
          expires_at: order.expires_at,
          requires_user_action: true,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get draft order summary');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get draft order summary')
      );
    }
  });
}
