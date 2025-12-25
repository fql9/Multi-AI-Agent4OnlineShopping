/**
 * Catalog Tool Routes - 商品目录工具
 * 
 * 实现:
 * - catalog.search_offers: 搜索商品
 * - catalog.get_offer_card: 获取商品详情 (AROC)
 * - catalog.get_availability: 获取库存状态
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, createLogger, query, queryOne } from '@shopping-agent/common';

const logger = createLogger('catalog');

// 商品类型定义
interface OfferRow {
  id: string;
  spu_id: string;
  merchant_id: string;
  category_id: string;
  title_en: string;
  title_zh: string;
  brand_name: string;
  brand_id: string;
  base_price: number;
  currency: string;
  attributes: unknown;
  weight_g: number;
  dimensions_mm: unknown;
  risk_tags: string[];
  certifications: string[];
  return_policy: unknown;
  warranty_months: number;
  rating: number;
  reviews_count: number;
}

interface SkuRow {
  id: string;
  offer_id: string;
  options: unknown;
  price: number;
  currency: string;
  stock: number;
}

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  /**
   * catalog.search_offers
   * 
   * 搜索商品，支持关键词、类目、价格范围等过滤
   */
  app.post('/search_offers', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: Record<string, unknown> };
    const params = body.params ?? {};

    const searchQuery = (params.query as string) ?? '';
    const categoryId = params.category_id as string | undefined;
    const priceMin = params.price_min as number | undefined;
    const priceMax = params.price_max as number | undefined;
    const limit = Math.min((params.limit as number) ?? 50, 100);
    const offset = (params.offset as number) ?? 0;

    logger.info({ query: searchQuery, category_id: categoryId, limit }, 'Searching offers');

    try {
      // 构建 SQL 查询
      const conditions: string[] = [];
      const sqlParams: unknown[] = [];
      let paramIndex = 1;

      // 关键词搜索（标题）
      if (searchQuery) {
        conditions.push(`(title_en ILIKE $${paramIndex} OR title_zh ILIKE $${paramIndex} OR brand_name ILIKE $${paramIndex})`);
        sqlParams.push(`%${searchQuery}%`);
        paramIndex++;
      }

      // 类目过滤
      if (categoryId) {
        conditions.push(`category_id = $${paramIndex}`);
        sqlParams.push(categoryId);
        paramIndex++;
      }

      // 价格范围
      if (priceMin !== undefined) {
        conditions.push(`base_price >= $${paramIndex}`);
        sqlParams.push(priceMin);
        paramIndex++;
      }
      if (priceMax !== undefined) {
        conditions.push(`base_price <= $${paramIndex}`);
        sqlParams.push(priceMax);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // 查询总数
      const countSql = `SELECT COUNT(*) as total FROM agent.offers ${whereClause}`;
      const countResult = await queryOne<{ total: string }>(countSql, sqlParams);
      const totalCount = parseInt(countResult?.total ?? '0', 10);

      // 查询商品 ID 和分数
      const searchSql = `
        SELECT id, rating as score
        FROM agent.offers
        ${whereClause}
        ORDER BY rating DESC, reviews_count DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      sqlParams.push(limit, offset);

      const offers = await query<{ id: string; score: number }>(searchSql, sqlParams);

      logger.info({ 
        query: searchQuery, 
        results_count: offers.length, 
        total_count: totalCount 
      }, 'Search completed');

      return reply.send(
        createSuccessResponse({
          offer_ids: offers.map(o => o.id),
          scores: offers.map(o => o.score / 5), // 归一化到 0-1
          total_count: totalCount,
          has_more: offset + offers.length < totalCount,
        }, {
          ttl_seconds: 60, // 搜索结果缓存 60 秒
        })
      );
    } catch (error) {
      logger.error({ error }, 'Search failed');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to search offers')
      );
    }
  });

  /**
   * catalog.get_offer_card
   * 
   * 获取商品详情 (AROC - AI-Ready Offer Card)
   */
  app.post('/get_offer_card', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: { offer_id?: string } };
    const offerId = body.params?.offer_id;

    if (!offerId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'offer_id is required')
      );
    }

    logger.info({ offer_id: offerId }, 'Getting offer card');

    try {
      // 查询商品详情
      const offer = await queryOne<OfferRow>(
        `SELECT * FROM agent.offers WHERE id = $1`,
        [offerId]
      );

      if (!offer) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', `Offer ${offerId} not found`)
        );
      }

      // 查询 SKU 变体
      const skus = await query<SkuRow>(
        `SELECT * FROM agent.skus WHERE offer_id = $1`,
        [offerId]
      );

      // 查询类目路径
      const category = await queryOne<{ path: string[] }>(
        `SELECT path FROM agent.categories WHERE id = $1`,
        [offer.category_id]
      );

      // 构建 AROC 响应
      const aroc = {
        aroc_version: '0.1',
        offer_id: offer.id,
        spu_id: offer.spu_id,
        merchant_id: offer.merchant_id,
        category: {
          cat_id: offer.category_id,
          path: category?.path ?? [],
        },
        titles: [
          { lang: 'en', text: offer.title_en },
          { lang: 'zh', text: offer.title_zh },
        ],
        brand: {
          name: offer.brand_name,
          normalized_id: offer.brand_id,
          confidence: 'high',
        },
        price: {
          amount: parseFloat(String(offer.base_price)),
          currency: offer.currency,
        },
        attributes: offer.attributes ?? [],
        variants: {
          axes: extractVariantAxes(skus),
          skus: skus.map(sku => ({
            sku_id: sku.id,
            options: sku.options,
            price: parseFloat(String(sku.price)),
            stock: sku.stock,
            risk_tags: offer.risk_tags ?? [],
          })),
        },
        policies: {
          return_policy: offer.return_policy,
          warranty_months: offer.warranty_months,
        },
        risk_profile: {
          fragile: false,
          sizing_uncertainty: 'low',
          has_battery: offer.risk_tags?.includes('battery_included') ?? false,
          has_liquid: offer.risk_tags?.includes('contains_liquid') ?? false,
        },
        weight_g: offer.weight_g,
        dimensions_mm: offer.dimensions_mm,
        certifications: offer.certifications ?? [],
        rating: parseFloat(String(offer.rating)),
        reviews_count: offer.reviews_count,
      };

      return reply.send(
        createSuccessResponse(aroc, {
          ttl_seconds: 300, // AROC 缓存 5 分钟
        })
      );
    } catch (error) {
      logger.error({ error, offer_id: offerId }, 'Failed to get offer card');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get offer card')
      );
    }
  });

  /**
   * catalog.get_availability
   * 
   * 获取商品库存状态
   */
  app.post('/get_availability', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: { sku_id?: string; offer_id?: string } };
    const skuId = body.params?.sku_id;
    const offerId = body.params?.offer_id;

    if (!skuId && !offerId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'sku_id or offer_id is required')
      );
    }

    try {
      let skus: SkuRow[];

      if (skuId) {
        const sku = await queryOne<SkuRow>(
          `SELECT * FROM agent.skus WHERE id = $1`,
          [skuId]
        );
        skus = sku ? [sku] : [];
      } else {
        skus = await query<SkuRow>(
          `SELECT * FROM agent.skus WHERE offer_id = $1`,
          [offerId]
        );
      }

      if (skus.length === 0) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'SKU not found')
        );
      }

      const availability = skus.map(sku => ({
        sku_id: sku.id,
        stock: sku.stock,
        is_available: sku.stock > 0,
        stock_status: sku.stock > 10 ? 'in_stock' : sku.stock > 0 ? 'low_stock' : 'out_of_stock',
      }));

      return reply.send(
        createSuccessResponse({
          items: availability,
        }, {
          ttl_seconds: 30, // 库存状态缓存 30 秒
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get availability');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get availability')
      );
    }
  });
}

/**
 * 从 SKU 列表提取变体轴
 */
function extractVariantAxes(skus: SkuRow[]): Array<{ axis: string; values: string[] }> {
  const axesMap = new Map<string, Set<string>>();

  for (const sku of skus) {
    const options = sku.options as Record<string, string> | null;
    if (options) {
      for (const [axis, value] of Object.entries(options)) {
        if (!axesMap.has(axis)) {
          axesMap.set(axis, new Set());
        }
        axesMap.get(axis)!.add(value);
      }
    }
  }

  return Array.from(axesMap.entries()).map(([axis, values]) => ({
    axis,
    values: Array.from(values),
  }));
}
