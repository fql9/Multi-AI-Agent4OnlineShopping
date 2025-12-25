/**
 * Catalog Tools - 商品目录工具
 * 
 * 提供商品搜索、详情、变体、库存查询
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { query, queryOne } from '../db.js';

// ============================================================
// Tool Definitions
// ============================================================

export const catalogTools: Tool[] = [
  {
    name: 'catalog.search_offers',
    description: 'Search for product offers based on query and filters',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        destination_country: { type: 'string', description: 'ISO 2-letter country code' },
        category_id: { type: 'string' },
        price_min: { type: 'number' },
        price_max: { type: 'number' },
        brand: { type: 'string' },
        must_in_stock: { type: 'boolean', default: true },
        sort: { type: 'string', enum: ['relevance', 'price', 'rating', 'reviews'] },
        limit: { type: 'integer', default: 50 },
        offset: { type: 'integer', default: 0 },
      },
      required: ['query'],
    },
  },
  {
    name: 'catalog.get_offer_card',
    description: 'Get AI-Ready Offer Card (AROC) for a specific offer',
    inputSchema: {
      type: 'object',
      properties: {
        offer_id: { type: 'string', description: 'Offer ID' },
      },
      required: ['offer_id'],
    },
  },
  {
    name: 'catalog.get_offer_variants',
    description: 'Get variant matrix (SKUs) for an offer',
    inputSchema: {
      type: 'object',
      properties: {
        offer_id: { type: 'string' },
      },
      required: ['offer_id'],
    },
  },
  {
    name: 'catalog.get_availability',
    description: 'Check stock availability for a SKU',
    inputSchema: {
      type: 'object',
      properties: {
        sku_id: { type: 'string' },
        destination_country: { type: 'string' },
      },
      required: ['sku_id'],
    },
  },
];

// ============================================================
// Types
// ============================================================

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
  attributes: Record<string, unknown>;
  weight_g: number;
  dimensions_mm: { l: number; w: number; h: number };
  risk_tags: string[];
  certifications: string[];
  return_policy: Record<string, unknown>;
  warranty_months: number;
  rating: number;
  reviews_count: number;
}

interface SkuRow {
  id: string;
  offer_id: string;
  options: Record<string, string>;
  price: number;
  currency: string;
  stock: number;
}

// ============================================================
// Tool Handlers
// ============================================================

/**
 * 搜索商品
 */
async function searchOffers(params: Record<string, unknown>): Promise<unknown> {
  const searchQuery = (params.query as string) ?? '';
  const categoryId = params.category_id as string | undefined;
  const priceMin = params.price_min as number | undefined;
  const priceMax = params.price_max as number | undefined;
  const brand = params.brand as string | undefined;
  const sort = (params.sort as string) ?? 'relevance';
  const limit = Math.min((params.limit as number) ?? 50, 100);
  const offset = (params.offset as number) ?? 0;

  // 构建查询
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  // 文本搜索（标题匹配）
  if (searchQuery) {
    conditions.push(`(title_en ILIKE $${paramIndex} OR title_zh ILIKE $${paramIndex})`);
    values.push(`%${searchQuery}%`);
    paramIndex++;
  }

  // 类目过滤
  if (categoryId) {
    conditions.push(`category_id = $${paramIndex}`);
    values.push(categoryId);
    paramIndex++;
  }

  // 价格范围
  if (priceMin !== undefined) {
    conditions.push(`base_price >= $${paramIndex}`);
    values.push(priceMin);
    paramIndex++;
  }
  if (priceMax !== undefined) {
    conditions.push(`base_price <= $${paramIndex}`);
    values.push(priceMax);
    paramIndex++;
  }

  // 品牌过滤
  if (brand) {
    conditions.push(`brand_name ILIKE $${paramIndex}`);
    values.push(`%${brand}%`);
    paramIndex++;
  }

  // 排序
  let orderBy = 'rating DESC';
  switch (sort) {
    case 'price':
      orderBy = 'base_price ASC';
      break;
    case 'rating':
      orderBy = 'rating DESC';
      break;
    case 'reviews':
      orderBy = 'reviews_count DESC';
      break;
    default:
      // relevance: 按评分和评价数综合排序
      orderBy = 'rating DESC, reviews_count DESC';
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 查询总数
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM agent.offers ${whereClause}`,
    values
  );
  const totalCount = parseInt(countResult?.count ?? '0');

  // 查询结果
  values.push(limit, offset);
  const rows = await query<OfferRow>(
    `SELECT id, title_en, title_zh, brand_name, base_price, currency, rating, reviews_count, category_id
     FROM agent.offers 
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    values
  );

  return {
    offer_ids: rows.map((r) => r.id),
    offers: rows.map((r) => ({
      offer_id: r.id,
      title: r.title_en,
      brand: r.brand_name,
      price: { amount: parseFloat(String(r.base_price)), currency: r.currency },
      rating: parseFloat(String(r.rating)),
      reviews_count: r.reviews_count,
      category_id: r.category_id,
    })),
    total_count: totalCount,
    has_more: offset + rows.length < totalCount,
    search_query: searchQuery,
  };
}

/**
 * 获取商品详情 (AROC)
 */
async function getOfferCard(params: Record<string, unknown>): Promise<unknown> {
  const offerId = params.offer_id as string;

  const offer = await queryOne<OfferRow>(
    `SELECT * FROM agent.offers WHERE id = $1`,
    [offerId]
  );

  if (!offer) {
    return { error: { code: 'NOT_FOUND', message: `Offer ${offerId} not found` } };
  }

  // 获取 SKU 变体
  const skus = await query<SkuRow>(
    `SELECT * FROM agent.skus WHERE offer_id = $1`,
    [offerId]
  );

  // 获取类目信息
  const category = await queryOne<{ id: string; name_en: string; path: string[] }>(
    `SELECT id, name_en, path FROM agent.categories WHERE id = $1`,
    [offer.category_id]
  );

  return {
    aroc_version: '0.1',
    offer_id: offer.id,
    spu_id: offer.spu_id,
    merchant_id: offer.merchant_id,
    category: {
      id: category?.id,
      name: category?.name_en,
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
    attributes: offer.attributes,
    variants: {
      skus: skus.map((s) => ({
        sku_id: s.id,
        options: s.options,
        price: parseFloat(String(s.price)),
        currency: s.currency,
        stock: s.stock,
        in_stock: s.stock > 0,
      })),
    },
    packaging: {
      weight_g: offer.weight_g,
      dimensions_mm: offer.dimensions_mm,
    },
    risk_tags: offer.risk_tags ?? [],
    certifications: offer.certifications ?? [],
    policies: {
      return_policy: offer.return_policy,
      warranty_months: offer.warranty_months,
    },
    metrics: {
      rating: parseFloat(String(offer.rating)),
      reviews_count: offer.reviews_count,
    },
  };
}

/**
 * 获取商品变体
 */
async function getOfferVariants(params: Record<string, unknown>): Promise<unknown> {
  const offerId = params.offer_id as string;

  const skus = await query<SkuRow>(
    `SELECT * FROM agent.skus WHERE offer_id = $1`,
    [offerId]
  );

  if (skus.length === 0) {
    return { error: { code: 'NOT_FOUND', message: `No SKUs found for offer ${offerId}` } };
  }

  // 提取变体轴
  const axes: Record<string, Set<string>> = {};
  for (const sku of skus) {
    if (sku.options) {
      for (const [key, value] of Object.entries(sku.options)) {
        if (!axes[key]) axes[key] = new Set();
        axes[key].add(value);
      }
    }
  }

  return {
    offer_id: offerId,
    axes: Object.entries(axes).map(([axis, values]) => ({
      axis,
      values: Array.from(values),
    })),
    skus: skus.map((s) => ({
      sku_id: s.id,
      options: s.options,
      price: parseFloat(String(s.price)),
      currency: s.currency,
      stock: s.stock,
      in_stock: s.stock > 0,
    })),
  };
}

/**
 * 检查库存
 */
async function getAvailability(params: Record<string, unknown>): Promise<unknown> {
  const skuId = params.sku_id as string;
  const destCountry = (params.destination_country as string) ?? 'US';

  const sku = await queryOne<SkuRow>(
    `SELECT * FROM agent.skus WHERE id = $1`,
    [skuId]
  );

  if (!sku) {
    return { error: { code: 'NOT_FOUND', message: `SKU ${skuId} not found` } };
  }

  const inStock = sku.stock > 0;
  let stockStatus = 'out_of_stock';
  if (sku.stock > 100) stockStatus = 'in_stock';
  else if (sku.stock > 10) stockStatus = 'low_stock';
  else if (sku.stock > 0) stockStatus = 'limited';

  return {
    sku_id: skuId,
    destination_country: destCountry,
    is_sellable: inStock,
    stock_status: stockStatus,
    stock_quantity: sku.stock,
    warehouse_candidates: inStock ? ['WH_CN_SZ', 'WH_CN_GZ'] : [],
    estimated_ship_days: inStock ? (destCountry === 'CN' ? 3 : 7) : null,
  };
}

// ============================================================
// Main Handler
// ============================================================

export function handleCatalogTool(tool: string) {
  return async (params: unknown): Promise<unknown> => {
    const p = params as Record<string, unknown>;

    switch (tool) {
      case 'search_offers':
        return searchOffers(p);

      case 'get_offer_card':
        return getOfferCard(p);

      case 'get_offer_variants':
        return getOfferVariants(p);

      case 'get_availability':
        return getAvailability(p);

      default:
        throw new Error(`Unknown catalog tool: ${tool}`);
    }
  };
}
