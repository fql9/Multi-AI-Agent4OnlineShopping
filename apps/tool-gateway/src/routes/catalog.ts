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

// Short-lived in-memory cache for XOOBAY goods_url lookups.
const GOODS_URL_TTL_MS = 10 * 60 * 1000;
const goodsUrlCache = new Map<string, { url: string; expiresAt: number }>();

function cacheGoodsUrl(offerId: string, url?: string | null): void {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return;
  goodsUrlCache.set(offerId, { url: trimmed, expiresAt: Date.now() + GOODS_URL_TTL_MS });
}

function getCachedGoodsUrl(offerId: string): string | undefined {
  const entry = goodsUrlCache.get(offerId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    goodsUrlCache.delete(offerId);
    return undefined;
  }
  return entry.url;
}

// Product type definitions (Enhanced for AROC v0.2)
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
  // Enhanced fields from 003 migration
  version_hash: string | null;
  update_source: string | null;
  risk_profile: unknown;
  brand_id_ref: string | null;
  merchant_id_ref: string | null;
}

interface SkuRow {
  id: string;
  offer_id: string;
  options: unknown;
  price: number;
  currency: string;
  stock: number;
}

interface BrandRow {
  id: string;
  name: string;
  normalized_name: string | null;
  logo_url: string | null;
  country_of_origin: string | null;
  confidence: string;
}

interface MerchantRow {
  id: string;
  name: string;
  store_url: string | null;
  rating: number;
  total_products: number;
  country: string | null;
  verified: boolean;
  risk_level: string;
}

interface CategoryRow {
  id: string;
  name_en: string;
  name_zh: string | null;
  path: string[];
  full_path_en: string | null;
  product_count: number;
  level: number;
  parent_id: string | null;
}

interface KgRelationRow {
  id: string;
  from_type: string;
  from_id: string;
  relation_type: string;
  to_type: string;
  to_id: string;
  confidence: number;
  metadata: unknown;
}

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  /**
   * catalog.search_offers
   * 
   * Search products directly via XOOBAY /api-geo/product-search API
   * Supports bilingual search: query_original (Chinese) is preferred for XOOBAY
   */
  app.post('/search_offers', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: Record<string, unknown> };
    const params = body.params ?? {};

    // Support two parameter formats:
    // 1. Flat format: {query, query_original, category_id, price_min, price_max, limit}
    // 2. Nested format: {query, query_original, filters: {category_id, price_range: {min, max}}, limit}
    const filters = params.filters as Record<string, unknown> | undefined;
    const priceRange = filters?.price_range as { min?: number; max?: number } | undefined;

    const searchQuery = (params.query as string) ?? '';
    const queryOriginal = (params.query_original as string) ?? '';  // 原始语言查询（如中文）
    const priceMin = (params.price_min as number | undefined) ?? priceRange?.min;
    const priceMax = (params.price_max as number | undefined) ?? priceRange?.max;
    const limit = Math.min((params.limit as number) ?? 50, 100);
    const offset = (params.offset as number) ?? 0;
    const pageNo = Math.floor(offset / limit) + 1;

    logger.info({ 
      query: searchQuery, 
      query_original: queryOriginal,
      limit, 
      offset,
      pageNo,
      price_min: priceMin,
      price_max: priceMax,
    }, 'Searching offers via XOOBAY API');

    try {
      const xoobayClient = getXOOBAYClient();
      
      // XOOBAY 是中文电商平台，优先使用原始语言（中文）查询
      // 如果没有 query_original，再使用 query（英文）
      const xoobayResult = await xoobayClient.searchProductsBilingual({
        queryOriginal: queryOriginal || '',
        queryEn: searchQuery || '',
        pageNo,
        pageSize: limit,
      });
      
      logger.info({ 
        xoobay_total: xoobayResult.total,
        xoobay_list_count: xoobayResult.list.length,
        page: xoobayResult.page,
        limit: xoobayResult.limit
      }, 'XOOBAY product-search API response received');
      
      // Convert XOOBAY products to offer format
      let offers = xoobayResult.list.map(product => {
        // Parse price from string (e.g., "$29.99" -> 29.99)
        const priceStr = product.money?.replace(/[^\d.-]/g, '') || '0';
        const price = parseFloat(priceStr) || 0;
        
        return {
          id: `xoobay_${product.goods_id}`,
          // Calculate score based on sold_cnt (popularity)
          score: Math.min(4.0 + (product.sold_cnt > 100 ? 0.5 : product.sold_cnt > 10 ? 0.3 : 0), 5.0),
          sold_cnt: product.sold_cnt,
          price,
          goods_url: product.goods_url,
        };
      });

      // Apply price filter if specified (XOOBAY API doesn't support price filtering)
      if (priceMin !== undefined || priceMax !== undefined) {
        offers = offers.filter(o => {
          if (priceMin !== undefined && o.price < priceMin) return false;
          if (priceMax !== undefined && o.price > priceMax) return false;
          return true;
        });
        logger.info({
          before_filter: xoobayResult.list.length,
          after_filter: offers.length,
          price_min: priceMin,
          price_max: priceMax,
        }, 'Price filter applied');
      }

      // Cache goods_url for offer_id to avoid guessing product URLs later.
      for (const offer of offers) {
        if (offer.goods_url) {
          cacheGoodsUrl(offer.id, offer.goods_url);
        }
      }

      const totalCount = xoobayResult.total;
      const hasMore = pageNo * limit < totalCount;

      logger.info({ 
        query: searchQuery, 
        total_results: offers.length, 
        total_count: totalCount,
        has_more: hasMore,
      }, 'Search completed');

      return reply.send(
        createSuccessResponse({
          offer_ids: offers.map(o => o.id),
          scores: offers.map(o => o.score / 5), // Normalize to 0-1
          total: totalCount,
          total_count: totalCount,
          has_more: hasMore,
        }, {
          ttl_seconds: 60,
        })
      );
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, 'XOOBAY search failed');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to search offers from XOOBAY')
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
      let offer: OfferRow | null = null;
      let fetchedFromXoobay = false;

      // For XOOBAY products (id starts with "xoobay_"), always fetch from XOOBAY API
      if (offerId.startsWith('xoobay_')) {
        logger.info({ offer_id: offerId }, 'Fetching XOOBAY product from API');
        try {
          const xoobayId = offerId.replace('xoobay_', '');
          logger.info({ xoobay_id: xoobayId }, 'Calling XOOBAY getProductInfo');
          const xoobayClient = getXOOBAYClient();
          const xoobayProduct = await xoobayClient.getProductInfo(xoobayId);
          logger.info({ product_name: xoobayProduct.name }, 'XOOBAY product fetched successfully');
          fetchedFromXoobay = true;

          // Convert to database format
          // Fix price parsing: ensure correct conversion to number
          let basePrice = 0
          if (xoobayProduct.price) {
            const priceStr = String(xoobayProduct.price).replace(/[^\d.-]/g, '') // Remove currency symbols etc
            const priceNum = parseFloat(priceStr)
            basePrice = isNaN(priceNum) ? 0 : Math.round(priceNum * 100) / 100 // Keep 2 decimal places
          }
          
          // Prefer real goods_url from search cache; fall back to slug-based URL.
          const cachedGoodsUrl = getCachedGoodsUrl(offerId);
          const productSlug = xoobayProduct.name
            .toLowerCase()
            .normalize('NFKD')
            .replace(/['"]/g, '')
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 180);
          const fallbackUrl = productSlug ? `https://www.xoobay.com/products/${productSlug}` : undefined;
          const productUrl = cachedGoodsUrl ?? fallbackUrl;
          
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
              product_url: productUrl,  // Add product URL for frontend
            },
            weight_g: 0,
            dimensions_mm: { l: 0, w: 0, h: 0 },
            risk_tags: [],
            certifications: [],
            return_policy: {},
            warranty_months: 0,
            rating: 0,
            reviews_count: 0,
            // Enhanced fields (defaults for XOOBAY products)
            version_hash: null,
            update_source: 'xoobay_api',
            risk_profile: {},
            brand_id_ref: null,
            merchant_id_ref: null,
          } as OfferRow;

          logger.info({ offer_id: offerId }, 'Fetched from XOOBAY API');
        } catch (error) {
          logger.error({ 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            offer_id: offerId 
          }, 'Failed to fetch from XOOBAY API');
        }
      } else {
        // Non-XOOBAY products: query from database
        offer = await queryOne<OfferRow>(
          `SELECT * FROM agent.offers WHERE id = $1`,
          [offerId]
        );
      }

      if (!offer) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', `Offer ${offerId} not found`)
        );
      }

      if (fetchedFromXoobay) {
        try {
          await query(
            `INSERT INTO agent.categories (id, name_en, name_zh, level)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO NOTHING`,
            ['cat_other', 'Other', '其他', 0]
          );

          const basePrice = typeof offer.base_price === 'number'
            ? offer.base_price
            : parseFloat(String(offer.base_price || 0));

          await query(
            `INSERT INTO agent.offers (
              id, spu_id, merchant_id, category_id,
              title_en, title_zh, brand_name, brand_id,
              base_price, currency, attributes,
              weight_g, dimensions_mm, risk_tags, certifications,
              return_policy, warranty_months, rating, reviews_count
            ) VALUES (
              $1, $2, $3, $4,
              $5, $6, $7, $8,
              $9, $10, $11,
              $12, $13, $14, $15,
              $16, $17, $18, $19
            )
            ON CONFLICT (id) DO UPDATE SET
              title_en = EXCLUDED.title_en,
              title_zh = EXCLUDED.title_zh,
              brand_name = EXCLUDED.brand_name,
              brand_id = EXCLUDED.brand_id,
              base_price = EXCLUDED.base_price,
              currency = EXCLUDED.currency,
              attributes = EXCLUDED.attributes,
              updated_at = NOW()`,
            [
              offer.id,
              offer.spu_id,
              offer.merchant_id,
              offer.category_id,
              offer.title_en,
              offer.title_zh,
              offer.brand_name,
              offer.brand_id,
              basePrice,
              offer.currency,
              offer.attributes ?? {},
              offer.weight_g ?? 0,
              offer.dimensions_mm ?? {},
              offer.risk_tags ?? [],
              offer.certifications ?? [],
              offer.return_policy ?? {},
              offer.warranty_months ?? 0,
              offer.rating ?? 0,
              offer.reviews_count ?? 0,
            ]
          );

          const xoobayId = offer.id.replace('xoobay_', '');
          await query(
            `INSERT INTO agent.skus (id, offer_id, options, price, currency, stock)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE SET
               price = EXCLUDED.price,
               currency = EXCLUDED.currency,
               stock = EXCLUDED.stock,
               updated_at = NOW()`,
            [
              `sku_${xoobayId}`,
              offer.id,
              JSON.stringify({}),
              basePrice,
              offer.currency,
              100,
            ]
          );
        } catch (error) {
          logger.warn({ error, offer_id: offer.id }, 'Failed to persist XOOBAY offer in database');
        }
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

      // Query category with enhanced fields
      const category = await queryOne<CategoryRow>(
        `SELECT id, name_en, name_zh, path, full_path_en, product_count, level, parent_id 
         FROM agent.categories WHERE id = $1`,
        [offer.category_id]
      );

      // Get brand details from KG if available
      let brandInfo: BrandRow | null = null;
      if (offer.brand_id_ref) {
        brandInfo = await queryOne<BrandRow>(
          `SELECT id, name, normalized_name, logo_url, country_of_origin, confidence 
           FROM agent.brands WHERE id = $1`,
          [offer.brand_id_ref]
        );
      }

      // Get merchant details from KG if available  
      let merchantInfo: MerchantRow | null = null;
      if (offer.merchant_id_ref) {
        merchantInfo = await queryOne<MerchantRow>(
          `SELECT id, name, store_url, rating, total_products, country, verified, risk_level 
           FROM agent.merchants WHERE id = $1`,
          [offer.merchant_id_ref]
        );
      }

      // Get KG relations
      const kgRelations = await query<KgRelationRow>(
        `SELECT id, from_type, from_id, relation_type, to_type, to_id, confidence, metadata
         FROM agent.kg_relations 
         WHERE (from_type = 'offer' AND from_id = $1) 
            OR (to_type = 'offer' AND to_id = $1)
         LIMIT 20`,
        [offerId]
      );

      // Build AROC v0.2 response
      const aroc = {
        aroc_version: '0.2',
        offer_id: offer.id,
        spu_id: offer.spu_id,
        merchant_id: offer.merchant_id,
        category: {
          cat_id: offer.category_id,
          name: category?.name_en,
          name_zh: category?.name_zh,
          path: category?.path ?? [],
          full_path: category?.full_path_en,
          level: category?.level,
          product_count: category?.product_count,
        },
        titles: [
          { locale: 'en', lang: 'en', text: offer.title_en },
          { locale: 'zh', lang: 'zh', text: offer.title_zh },
        ],
        brand: {
          name: offer.brand_name,
          normalized_id: offer.brand_id,
          confidence: brandInfo?.confidence ?? 'medium',
          logo_url: brandInfo?.logo_url,
          country_of_origin: brandInfo?.country_of_origin,
        },
        merchant: merchantInfo ? {
          id: merchantInfo.id,
          name: merchantInfo.name,
          store_url: merchantInfo.store_url,
          rating: parseFloat(String(merchantInfo.rating)),
          verified: merchantInfo.verified,
          risk_level: merchantInfo.risk_level,
        } : null,
        price: {
          amount: typeof offer.base_price === 'number' ? Math.round(offer.base_price * 100) / 100 : parseFloat(String(offer.base_price || 0)),
          currency: offer.currency,
        },
        // Ensure attributes is an object with expected fields for frontend
        attributes: (() => {
          const attrs = offer.attributes as Record<string, unknown> | null | undefined;
          if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
            return {
              image_url: attrs.image_url as string | undefined,
              gallery_images: attrs.gallery_images as string[] | undefined,
              description: attrs.description as string | undefined,
              short_description: attrs.short_description as string | undefined,
              store_name: attrs.store_name as string | undefined,
              source: (attrs.source as string) || (offer.id?.startsWith('xoobay_') ? 'xoobay' : 'database'),
              product_url: attrs.product_url as string | undefined,
            };
          }
          return {
            source: offer.id?.startsWith('xoobay_') ? 'xoobay' : 'database',
          };
        })(),
        // Add product_url at top level for easier frontend access
        product_url: (() => {
          const attrs = offer.attributes as Record<string, unknown> | null | undefined;
          if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
            return attrs.product_url as string | undefined;
          }
          return undefined;
        })(),
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
        risk_tags: offer.risk_tags ?? [],
        risk_profile: offer.risk_profile ?? {
          fragile: false,
          sizing_uncertainty: 'low',
          has_battery: offer.risk_tags?.includes('battery_included') ?? false,
          has_liquid: offer.risk_tags?.includes('liquid') ?? false,
        },
        weight_g: offer.weight_g,
        dimensions_mm: offer.dimensions_mm,
        certifications: offer.certifications ?? [],
        rating: parseFloat(String(offer.rating)),
        reviews_count: offer.reviews_count,
        // Version tracking for AROC
        version: {
          hash: offer.version_hash,
          source: offer.update_source,
        },
        // KG relationships
        kg_relations: kgRelations.map(r => ({
          id: r.id,
          type: r.relation_type,
          from: { type: r.from_type, id: r.from_id },
          to: { type: r.to_type, id: r.to_id },
          confidence: parseFloat(String(r.confidence)),
        })),
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

  /**
   * catalog.get_brand
   * 
   * Get brand details from KG
   */
  app.post('/get_brand', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: { brand_id?: string } };
    const brandId = body.params?.brand_id;

    if (!brandId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'brand_id is required')
      );
    }

    try {
      const brand = await queryOne<BrandRow>(
        `SELECT * FROM agent.brands WHERE id = $1`,
        [brandId]
      );

      if (!brand) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', `Brand ${brandId} not found`)
        );
      }

      const offerCount = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM agent.offers WHERE brand_id_ref = $1`,
        [brandId]
      );

      return reply.send(
        createSuccessResponse({
          brand_id: brand.id,
          name: brand.name,
          normalized_name: brand.normalized_name,
          logo_url: brand.logo_url,
          country_of_origin: brand.country_of_origin,
          confidence: brand.confidence,
          offer_count: parseInt(offerCount?.count ?? '0'),
        })
      );
    } catch (error) {
      logger.error({ error, brand_id: brandId }, 'Failed to get brand');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get brand')
      );
    }
  });

  /**
   * catalog.get_merchant
   * 
   * Get merchant details and risk assessment from KG
   */
  app.post('/get_merchant', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: { merchant_id?: string } };
    const merchantId = body.params?.merchant_id;

    if (!merchantId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'merchant_id is required')
      );
    }

    try {
      const merchant = await queryOne<MerchantRow>(
        `SELECT * FROM agent.merchants WHERE id = $1`,
        [merchantId]
      );

      if (!merchant) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', `Merchant ${merchantId} not found`)
        );
      }

      return reply.send(
        createSuccessResponse({
          merchant_id: merchant.id,
          name: merchant.name,
          store_url: merchant.store_url,
          rating: parseFloat(String(merchant.rating)),
          total_products: merchant.total_products,
          country: merchant.country,
          verified: merchant.verified,
          risk_level: merchant.risk_level,
        })
      );
    } catch (error) {
      logger.error({ error, merchant_id: merchantId }, 'Failed to get merchant');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get merchant')
      );
    }
  });

  /**
   * catalog.get_category_tree
   * 
   * Get category hierarchy with product counts
   */
  app.post('/get_category_tree', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: { parent_id?: string; depth?: number } };
    const parentId = body.params?.parent_id;
    const depth = Math.min(body.params?.depth ?? 2, 5);

    try {
      let categories: CategoryRow[];
      
      if (parentId) {
        categories = await query<CategoryRow>(
          `SELECT id, name_en, name_zh, path, full_path_en, product_count, level, parent_id
           FROM agent.categories 
           WHERE parent_id = $1
           ORDER BY product_count DESC`,
          [parentId]
        );
      } else {
        categories = await query<CategoryRow>(
          `SELECT id, name_en, name_zh, path, full_path_en, product_count, level, parent_id
           FROM agent.categories 
           WHERE level <= $1
           ORDER BY level, product_count DESC
           LIMIT 200`,
          [depth]
        );
      }

      return reply.send(
        createSuccessResponse({
          parent_id: parentId ?? null,
          max_depth: depth,
          categories: categories.map(c => ({
            id: c.id,
            name: c.name_en,
            name_zh: c.name_zh,
            path: c.full_path_en ?? (c.path?.join(' > ') || ''),
            product_count: c.product_count,
            level: c.level,
            has_children: true,
          })),
          total_count: categories.length,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get category tree');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get category tree')
      );
    }
  });

  /**
   * catalog.get_kg_relations
   * 
   * Get KG relationships for an entity
   */
  app.post('/get_kg_relations', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { 
      params?: { 
        entity_type?: string; 
        entity_id?: string;
        relation_types?: string[];
        direction?: string;
      } 
    };
    const entityType = body.params?.entity_type;
    const entityId = body.params?.entity_id;
    const relationTypes = body.params?.relation_types;
    const direction = body.params?.direction ?? 'both';

    if (!entityType || !entityId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'entity_type and entity_id are required')
      );
    }

    try {
      const conditions: string[] = [];
      const sqlParams: unknown[] = [];
      let paramIndex = 1;

      if (direction === 'outgoing') {
        conditions.push(`(from_type = $${paramIndex} AND from_id = $${paramIndex + 1})`);
        sqlParams.push(entityType, entityId);
        paramIndex += 2;
      } else if (direction === 'incoming') {
        conditions.push(`(to_type = $${paramIndex} AND to_id = $${paramIndex + 1})`);
        sqlParams.push(entityType, entityId);
        paramIndex += 2;
      } else {
        conditions.push(`((from_type = $${paramIndex} AND from_id = $${paramIndex + 1}) OR (to_type = $${paramIndex} AND to_id = $${paramIndex + 1}))`);
        sqlParams.push(entityType, entityId);
        paramIndex += 2;
      }

      if (relationTypes && relationTypes.length > 0) {
        conditions.push(`relation_type = ANY($${paramIndex})`);
        sqlParams.push(relationTypes);
        paramIndex++;
      }

      const relations = await query<KgRelationRow>(
        `SELECT id, from_type, from_id, relation_type, to_type, to_id, confidence, metadata
         FROM agent.kg_relations 
         WHERE ${conditions.join(' AND ')}
         ORDER BY confidence DESC
         LIMIT 100`,
        sqlParams
      );

      return reply.send(
        createSuccessResponse({
          entity: { type: entityType, id: entityId },
          direction,
          relations: relations.map(r => ({
            id: r.id,
            type: r.relation_type,
            from: { type: r.from_type, id: r.from_id },
            to: { type: r.to_type, id: r.to_id },
            confidence: parseFloat(String(r.confidence)),
            metadata: r.metadata,
          })),
          total_count: relations.length,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get KG relations');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get KG relations')
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
