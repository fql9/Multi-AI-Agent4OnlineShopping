/**
 * Catalog Tool Routes
 * 
 * Implements:
 * - catalog.search_offers: Search products
 * - catalog.get_offer_card: Get product details (AROC)
 * - catalog.get_availability: Get stock status
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, createLogger, query, queryOne } from '@shopping-agent/common';
import { getXOOBAYClient } from '../services/xoobay.js';

const logger = createLogger('catalog');

// Product type definitions
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
   * Search products with keyword, category, price range filters
   */
  app.post('/search_offers', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: Record<string, unknown> };
    const params = body.params ?? {};

    // Support two parameter formats:
    // 1. Flat format: {query, category_id, price_min, price_max, limit}
    // 2. Nested format: {query, filters: {category_id, price_range: {min, max}}, limit}
    const filters = params.filters as Record<string, unknown> | undefined;
    const priceRange = filters?.price_range as { min?: number; max?: number } | undefined;

    const searchQuery = (params.query as string) ?? '';
    const categoryId = (params.category_id as string | undefined) ?? (filters?.category_id as string | undefined);
    const priceMin = (params.price_min as number | undefined) ?? priceRange?.min;
    const priceMax = (params.price_max as number | undefined) ?? priceRange?.max;
    const limit = Math.min((params.limit as number) ?? 50, 100);
    const offset = (params.offset as number) ?? 0;

    logger.info({ query: searchQuery, category_id: categoryId, limit }, 'Searching offers');

    try {
      // Build SQL query
      const conditions: string[] = [];
      const sqlParams: unknown[] = [];
      let paramIndex = 1;

      // Keyword search (title)
      if (searchQuery) {
        conditions.push(`(title_en ILIKE $${paramIndex} OR title_zh ILIKE $${paramIndex} OR brand_name ILIKE $${paramIndex})`);
        sqlParams.push(`%${searchQuery}%`);
        paramIndex++;
      }

      // Category filter
      if (categoryId) {
        conditions.push(`category_id = $${paramIndex}`);
        sqlParams.push(categoryId);
        paramIndex++;
      }

      // Price range
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

      // Query total count
      const countSql = `SELECT COUNT(*) as total FROM agent.offers ${whereClause}`;
      const countResult = await queryOne<{ total: string }>(countSql, sqlParams);
      const totalCount = parseInt(countResult?.total ?? '0', 10);

      // Query product IDs and scores
      const searchSql = `
        SELECT id, rating as score
        FROM agent.offers
        ${whereClause}
        ORDER BY rating DESC, reviews_count DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      sqlParams.push(limit, offset);

      const offers = await query<{ id: string; score: number }>(searchSql, sqlParams);

      // XOOBAY API integration: supplement data if results are insufficient or XOOBAY is enabled
      let xoobayOffers: Array<{ id: string; score: number }> = [];
      const xoobayEnabled = process.env.XOOBAY_ENABLED === 'true';
      const minResults = Math.max(limit, 10); // Minimum required results

      logger.info({ 
        xoobay_enabled: xoobayEnabled,
        offers_count: offers.length,
        min_results: minResults,
        has_query: !!searchQuery,
        search_query: searchQuery
      }, 'XOOBAY integration check');

      // Call XOOBAY API if enabled and has search query, or if results are insufficient
      if (xoobayEnabled && (offers.length < minResults || searchQuery)) {
        logger.info({ searchQuery, offers_count: offers.length }, 'Attempting to fetch from XOOBAY API');
        try {
          const xoobayClient = getXOOBAYClient();
          logger.info({ searchQuery }, 'Calling XOOBAY searchProducts');
          const xoobayResult = await xoobayClient.searchProducts(searchQuery || '', 1);
          
          logger.info({ 
            xoobay_total: xoobayResult.list.length,
            pager: xoobayResult.pager
          }, 'XOOBAY API response received');
          
          // Convert XOOBAY products to offer format
          xoobayOffers = xoobayResult.list
            .slice(0, Math.max(limit - offers.length, 0)) // Only take needed quantity
            .map(product => ({
              id: `xoobay_${product.id}`,
              score: 4.0, // Default rating
            }));

          logger.info({ 
            xoobay_results: xoobayOffers.length,
            sample_ids: xoobayOffers.slice(0, 3).map(o => o.id)
          }, 'XOOBAY API results added');
        } catch (error) {
          logger.error({ 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          }, 'XOOBAY API call failed, using database results only');
        }
      } else {
        logger.info({ 
          reason: !xoobayEnabled ? 'XOOBAY disabled' : 
                  offers.length >= minResults && !searchQuery ? 'Enough DB results and no query' : 
                  'Unknown reason'
        }, 'Skipping XOOBAY API call');
      }

      // Merge results, remove duplicates
      const allOfferIds = new Set(offers.map(o => o.id));
      const mergedOffers = [...offers];
      
      for (const xoobayOffer of xoobayOffers) {
        if (!allOfferIds.has(xoobayOffer.id)) {
          mergedOffers.push(xoobayOffer);
          allOfferIds.add(xoobayOffer.id);
        }
      }

      const finalTotal = totalCount + (xoobayEnabled ? xoobayOffers.length : 0);

      logger.info({ 
        query: searchQuery, 
        db_results: offers.length,
        xoobay_results: xoobayOffers.length,
        total_results: mergedOffers.length, 
        total_count: finalTotal 
      }, 'Search completed');

      return reply.send(
        createSuccessResponse({
          offer_ids: mergedOffers.map(o => o.id),
          scores: mergedOffers.map(o => o.score / 5), // 归一化到 0-1
          total_count: finalTotal,
          has_more: offset + mergedOffers.length < finalTotal,
        }, {
          ttl_seconds: 60, // Cache search results for 60 seconds
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
   * Get product details (AROC - AI-Ready Offer Card)
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
      // Query product details
      let offer = await queryOne<OfferRow>(
        `SELECT * FROM agent.offers WHERE id = $1`,
        [offerId]
      );

      // If not in database and is XOOBAY product, fetch from API
      if (!offer && offerId.startsWith('xoobay_') && process.env.XOOBAY_ENABLED === 'true') {
        logger.info({ offer_id: offerId, xoobay_enabled: true }, 'Fetching from XOOBAY API');
        try {
          const xoobayId = offerId.replace('xoobay_', '');
          logger.info({ xoobay_id: xoobayId }, 'Calling XOOBAY getProductInfo');
          const xoobayClient = getXOOBAYClient();
          const xoobayProduct = await xoobayClient.getProductInfo(xoobayId);
          logger.info({ product_name: xoobayProduct.name }, 'XOOBAY product fetched successfully');

          // Convert to database format
          // Fix price parsing: ensure correct conversion to number
          let basePrice = 0
          if (xoobayProduct.price) {
            const priceStr = String(xoobayProduct.price).replace(/[^\d.-]/g, '') // Remove currency symbols etc
            const priceNum = parseFloat(priceStr)
            basePrice = isNaN(priceNum) ? 0 : Math.round(priceNum * 100) / 100 // Keep 2 decimal places
          }
          
          offer = {
            id: offerId,
            spu_id: `spu_${xoobayProduct.id}`,
            merchant_id: `merchant_${xoobayProduct.store_id}`,
            category_id: 'cat_other', // Default category
            title_en: xoobayProduct.name,
            title_zh: xoobayProduct.name,
            brand_name: xoobayProduct.brand_name || 'XOOBAY',
            brand_id: `brand_${(xoobayProduct.brand_name || 'xoobay').toLowerCase().replace(/\s+/g, '_')}`,
            base_price: basePrice,
            currency: 'USD',
            attributes: {
              description: xoobayProduct.description,
              short_description: xoobayProduct.short_description,
              image_url: xoobayProduct.image_url,
              gallery_images: xoobayProduct.gallery_images,
              category: xoobayProduct.category,
              store_name: xoobayProduct.store_name,
              source: 'xoobay',
            },
            weight_g: 0,
            dimensions_mm: { l: 0, w: 0, h: 0 },
            risk_tags: [],
            certifications: [],
            return_policy: {},
            warranty_months: 0,
            rating: 0,
            reviews_count: 0,
          } as OfferRow;

          logger.info({ offer_id: offerId }, 'Fetched from XOOBAY API');
        } catch (error) {
          logger.error({ 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            offer_id: offerId 
          }, 'Failed to fetch from XOOBAY API');
        }
      } else if (!offer && offerId.startsWith('xoobay_')) {
        logger.warn({ 
          offer_id: offerId, 
          xoobay_enabled: process.env.XOOBAY_ENABLED 
        }, 'XOOBAY product requested but XOOBAY is disabled');
      }

      if (!offer) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', `Offer ${offerId} not found`)
        );
      }

      // Query SKU variants
      let skus = await query<SkuRow>(
        `SELECT * FROM agent.skus WHERE offer_id = $1`,
        [offerId]
      );

      // If product from XOOBAY API has no SKU, create default SKU
      if (skus.length === 0 && offerId.startsWith('xoobay_')) {
        const xoobayId = offerId.replace('xoobay_', '');
        skus = [{
          id: `sku_${xoobayId}`,
          offer_id: offerId,
          options: {},
          price: offer.base_price,
          currency: offer.currency,
          stock: 100, // Default stock
        }];
      }

      // Query category path
      const category = await queryOne<{ path: string[] }>(
        `SELECT path FROM agent.categories WHERE id = $1`,
        [offer.category_id]
      );

      // Build AROC response
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
          amount: typeof offer.base_price === 'number' ? Math.round(offer.base_price * 100) / 100 : parseFloat(String(offer.base_price || 0)),
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
          ttl_seconds: 300, // Cache AROC for 5 minutes
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
   * Get product stock status
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
          ttl_seconds: 30, // Cache stock status for 30 seconds
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
 * Extract variant axes from SKU list
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
