/**
 * Pricing Tool Routes - 价格工具
 * 
 * 实现:
 * - pricing.get_realtime_quote: 获取实时报价
 * - pricing.get_price_history: 获取价格历史（可选）
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, createLogger, queryOne } from '@shopping-agent/common';

const logger = createLogger('pricing');

interface SkuPriceRow {
  id: string;
  offer_id: string;
  price: number;
  currency: string;
  stock: number;
}

interface OfferRow {
  base_price: number;
  currency: string;
}

export async function pricingRoutes(app: FastifyInstance): Promise<void> {
  /**
   * pricing.get_realtime_quote
   * 
   * 获取 SKU 的实时报价
   * 
   * 输入:
   * - sku_id: SKU ID
   * - quantity: 数量（影响批量折扣）
   * - destination_country: 目的国（影响税费）
   * 
   * 输出:
   * - unit_price: 单价
   * - total_price: 总价
   * - price_components: 价格组成
   * - quote_expire_at: 报价过期时间
   */
  app.post('/get_realtime_quote', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { 
      params?: { 
        sku_id?: string;
        offer_id?: string;
        quantity?: number;
        destination_country?: string;
      } 
    };
    
    const skuId = body.params?.sku_id;
    const offerId = body.params?.offer_id;
    const quantity = body.params?.quantity ?? 1;
    const destinationCountry = body.params?.destination_country ?? 'US';

    if (!skuId && !offerId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'sku_id or offer_id is required')
      );
    }

    logger.info({ sku_id: skuId, offer_id: offerId, quantity, destination_country: destinationCountry }, 'Getting realtime quote');

    try {
      let price: number;
      let currency: string;
      let stock: number;
      let actualSkuId: string;

      if (skuId) {
        // 查询 SKU 价格
        const sku = await queryOne<SkuPriceRow>(
          `SELECT id, offer_id, price, currency, stock FROM agent.skus WHERE id = $1`,
          [skuId]
        );

        if (!sku) {
          return reply.status(404).send(
            createErrorResponse('NOT_FOUND', `SKU ${skuId} not found`)
          );
        }

        price = parseFloat(String(sku.price));
        currency = sku.currency;
        stock = sku.stock;
        actualSkuId = sku.id;
      } else {
        // 查询 Offer 基础价格（取第一个 SKU）
        const offer = await queryOne<OfferRow>(
          `SELECT base_price, currency FROM agent.offers WHERE id = $1`,
          [offerId]
        );

        if (!offer) {
          return reply.status(404).send(
            createErrorResponse('NOT_FOUND', `Offer ${offerId} not found`)
          );
        }

        price = parseFloat(String(offer.base_price));
        currency = offer.currency;
        stock = 100; // 默认库存
        actualSkuId = `${offerId}_default`;
      }

      // 检查库存
      if (stock < quantity) {
        return reply.status(409).send(
          createErrorResponse('OUT_OF_STOCK', `Insufficient stock. Available: ${stock}, Requested: ${quantity}`)
        );
      }

      // 计算价格组成
      const unitPrice = price;
      const subtotal = unitPrice * quantity;
      
      // 批量折扣（简化逻辑）
      let discount = 0;
      if (quantity >= 10) {
        discount = subtotal * 0.05; // 10+ 件 5% 折扣
      } else if (quantity >= 5) {
        discount = subtotal * 0.02; // 5+ 件 2% 折扣
      }

      const totalPrice = subtotal - discount;

      // 报价有效期（5 分钟）
      const quoteExpireAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const quote = {
        sku_id: actualSkuId,
        quantity,
        unit_price: unitPrice,
        currency,
        price_components: [
          { type: 'base_price', amount: subtotal, label: 'Subtotal' },
          ...(discount > 0 ? [{ type: 'bulk_discount', amount: -discount, label: `Bulk Discount (${quantity >= 10 ? '5%' : '2%'})` }] : []),
        ],
        total_price: Math.round(totalPrice * 100) / 100,
        stock_available: stock,
        quote_expire_at: quoteExpireAt,
        destination_country: destinationCountry,
      };

      logger.info({ 
        sku_id: actualSkuId, 
        unit_price: unitPrice, 
        total_price: quote.total_price 
      }, 'Quote generated');

      return reply.send(
        createSuccessResponse(quote, {
          ttl_seconds: 300, // 报价缓存 5 分钟
          evidence: {
            snapshot_id: `quote_${Date.now()}`,
            sources: [
              { type: 'tool', name: 'pricing.get_realtime_quote', ts: new Date().toISOString() }
            ]
          }
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get realtime quote');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get realtime quote')
      );
    }
  });

  /**
   * pricing.check_price_change
   * 
   * 检查价格是否变动（用于核验）
   */
  app.post('/check_price_change', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { 
      params?: { 
        sku_id?: string;
        expected_price?: number;
      } 
    };

    const skuId = body.params?.sku_id;
    const expectedPrice = body.params?.expected_price;

    if (!skuId || expectedPrice === undefined) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'sku_id and expected_price are required')
      );
    }

    try {
      const sku = await queryOne<SkuPriceRow>(
        `SELECT price FROM agent.skus WHERE id = $1`,
        [skuId]
      );

      if (!sku) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', `SKU ${skuId} not found`)
        );
      }

      const currentPrice = parseFloat(String(sku.price));
      const priceChanged = Math.abs(currentPrice - expectedPrice) > 0.01;

      return reply.send(
        createSuccessResponse({
          sku_id: skuId,
          expected_price: expectedPrice,
          current_price: currentPrice,
          price_changed: priceChanged,
          price_difference: currentPrice - expectedPrice,
          checked_at: new Date().toISOString(),
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to check price change');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to check price change')
      );
    }
  });
}
