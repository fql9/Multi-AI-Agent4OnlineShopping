/**
 * Catalog Tools
 * 
 * Provides product search, details, variants, and stock queries
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
    description: 'Get AI-Ready Offer Card (AROC) for a specific offer with full KG relationships',
    inputSchema: {
      type: 'object',
      properties: {
        offer_id: { type: 'string', description: 'Offer ID' },
        include_kg_relations: { type: 'boolean', default: true, description: 'Include KG relationship data' },
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
  {
    name: 'catalog.get_brand',
    description: 'Get brand details from KG',
    inputSchema: {
      type: 'object',
      properties: {
        brand_id: { type: 'string', description: 'Brand ID' },
      },
      required: ['brand_id'],
    },
  },
  {
    name: 'catalog.get_merchant',
    description: 'Get merchant details and risk assessment from KG',
    inputSchema: {
      type: 'object',
      properties: {
        merchant_id: { type: 'string', description: 'Merchant ID' },
      },
      required: ['merchant_id'],
    },
  },
  {
    name: 'catalog.get_category_tree',
    description: 'Get category hierarchy with product counts',
    inputSchema: {
      type: 'object',
      properties: {
        parent_id: { type: 'string', description: 'Parent category ID (null for root)' },
        depth: { type: 'integer', default: 2, description: 'How many levels deep to return' },
      },
    },
  },
  {
    name: 'catalog.get_kg_relations',
    description: 'Get KG relationships for an entity',
    inputSchema: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', enum: ['offer', 'sku', 'brand', 'category', 'merchant'], description: 'Entity type' },
        entity_id: { type: 'string', description: 'Entity ID' },
        relation_types: { type: 'array', items: { type: 'string' }, description: 'Filter by relation types' },
        direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'], default: 'both' },
      },
      required: ['entity_type', 'entity_id'],
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
  // Enhanced fields from 003 migration
  version_hash: string | null;
  update_source: string | null;
  risk_profile: Record<string, unknown> | null;
  brand_id_ref: string | null;
  merchant_id_ref: string | null;
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
  metadata: Record<string, unknown>;
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
 * Search products - Priority: XOOBAY API, fallback to local database
 */
async function searchOffers(params: Record<string, unknown>): Promise<unknown> {
  // Ensure query is always a string, even if LLM didn't parse correctly
  const searchQuery = String(params.query || '').trim();
  if (!searchQuery) {
    console.log('[searchOffers] Empty query, returning empty result');
    return { 
      offer_ids: [], 
      offers: [], 
      total_count: 0, 
      has_more: false,
      search_query: '' 
    };
  }

  // Support both flat and nested parameter formats
  const filters = params.filters as Record<string, unknown> | undefined;
  const priceRange = filters?.price_range as { min?: number; max?: number } | undefined;
  
  const categoryId = (params.category_id as string | undefined) ?? (filters?.category_id as string | undefined);
  const priceMin = (params.price_min as number | undefined) ?? priceRange?.min;
  const priceMax = (params.price_max as number | undefined) ?? priceRange?.max;
  const brand = (params.brand as string | undefined) ?? (filters?.brand as string | undefined);
  const sort = (params.sort as string) ?? 'relevance';
  const limit = Math.min((params.limit as number) ?? 50, 100);
  const offset = (params.offset as number) ?? 0;

  // Try XOOBAY API first if we have a search query
  if (searchQuery) {
    try {
      const apiKey = process.env.XOOBAY_API_KEY || 'xoobay_api_ai_geo';
      const lang = process.env.XOOBAY_LANG || 'zh_cn';
      const baseUrl = process.env.XOOBAY_BASE_URL || 'https://www.xoobay.com';
      
      const url = `${baseUrl}/api-geo/product-list?name=${encodeURIComponent(searchQuery)}&apiKey=${apiKey}&lang=${lang}&pageNo=1`;
      
      // Log the full request URL for debugging
      console.log('[searchOffers] Calling XOOBAY API:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json() as {
        code: number;
        msg?: string;
        data?: {
          list?: Array<{
            id: number;
            name: string;
            money: string;
            img_logo: string;
          }>;
          pager?: {
            page: number;
            count: number;
            pageCount: number;
          };
        };
      };

      console.log('[searchOffers] XOOBAY API response:', {
        code: result.code,
        listCount: result.data?.list?.length ?? 0,
        totalCount: result.data?.pager?.count ?? 0
      });

      if (result.code === 200 && result.data?.list && result.data.list.length > 0) {
        const rows = result.data.list;
        const pager = result.data.pager || { page: 1, count: rows.length, pageCount: 1 };
        
        // Apply limit and offset
        const startIndex = offset;
        const endIndex = Math.min(offset + limit, rows.length);
        const paginatedRows = rows.slice(startIndex, endIndex);

        // Map XOOBAY fields to expected format
        const mappedOffers = paginatedRows.map((r) => {
          // Parse price: remove currency symbols and convert to number
          const priceStr = String(r.money || '0').replace(/[^\d.-]/g, '');
          const priceAmount = parseFloat(priceStr) || 0;
          
          return {
            offer_id: `xoobay_${r.id}`,
            title: String(r.name || ''),
            brand: 'XOOBAY',
            price: { 
              amount: Math.round(priceAmount * 100) / 100, // Round to 2 decimal places
              currency: 'USD' 
            },
            rating: 5.0,
            reviews_count: 10,
            image_url: String(r.img_logo || ''),
          };
        });

        console.log('[searchOffers] XOOBAY API success, returning', mappedOffers.length, 'products');
        
        // Calculate scores (normalized to 0-1 range, based on position)
        const scores = mappedOffers.map((_, index) => {
          // Higher score for earlier results
          return Math.max(0, 1 - (index * 0.05));
        });
        
        return {
          offer_ids: mappedOffers.map((o) => o.offer_id),
          scores: scores,
          offers: mappedOffers,
          total_count: pager.count,
          has_more: endIndex < rows.length || pager.page < pager.pageCount,
          search_query: searchQuery,
        };
      } else {
        console.log('[searchOffers] XOOBAY API returned no results, code:', result.code, 'msg:', result.msg);
      }
    } catch (error) {
      // Detailed error logging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('[searchOffers] XOOBAY API call failed, falling back to local database...', {
        error: errorMessage,
        stack: errorStack,
        searchQuery,
        url: `${process.env.XOOBAY_BASE_URL || 'https://www.xoobay.com'}/api-geo/product-list?name=${encodeURIComponent(searchQuery)}&apiKey=${process.env.XOOBAY_API_KEY || 'xoobay_api_ai_geo'}&lang=${process.env.XOOBAY_LANG || 'zh_cn'}&pageNo=1`
      });
    }
  }

  // Fallback to local database query
  // Build query conditions
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  // Text search (title matching)
  if (searchQuery) {
    conditions.push(`(title_en ILIKE $${paramIndex} OR title_zh ILIKE $${paramIndex})`);
    values.push(`%${searchQuery}%`);
    paramIndex++;
  }

  // Category filter
  if (categoryId) {
    conditions.push(`category_id = $${paramIndex}`);
    values.push(categoryId);
    paramIndex++;
  }

  // Price range
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

  // Brand filter
  if (brand) {
    conditions.push(`brand_name ILIKE $${paramIndex}`);
    values.push(`%${brand}%`);
    paramIndex++;
  }

  // Sorting
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
      // relevance: sort by rating and review count
      orderBy = 'rating DESC, reviews_count DESC';
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Query total count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM agent.offers ${whereClause}`,
    values
  );
  const totalCount = parseInt(countResult?.count ?? '0');

  // Query results
  values.push(limit, offset);
  const rows = await query<OfferRow>(
    `SELECT id, title_en, title_zh, brand_name, base_price, currency, rating, reviews_count, category_id
     FROM agent.offers 
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    values
  );

  // Calculate scores based on rating (normalized to 0-1)
  const scores = rows.map((r) => {
    const rating = parseFloat(String(r.rating)) || 0;
    return Math.min(1, rating / 5.0); // Normalize 0-5 rating to 0-1
  });

  return {
    offer_ids: rows.map((r) => r.id),
    scores: scores,
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
 * Get product details (AROC) - Priority: XOOBAY API for XOOBAY products, fallback to local database
 */
async function getOfferCard(params: Record<string, unknown>): Promise<unknown> {
  // Ensure offer_id is always a string
  const offerId = String(params.offer_id || '').trim();
  
  if (!offerId) {
    console.error('[getOfferCard] Empty offer_id provided');
    return { error: { code: 'INVALID_ARGUMENT', message: 'offer_id is required' } };
  }

  // If it's a XOOBAY product, try to fetch from API first
  if (offerId.startsWith('xoobay_')) {
    try {
      const xoobayId = offerId.replace('xoobay_', '');
      const apiKey = process.env.XOOBAY_API_KEY || 'xoobay_api_ai_geo';
      const lang = process.env.XOOBAY_LANG || 'zh_cn';
      const baseUrl = process.env.XOOBAY_BASE_URL || 'https://www.xoobay.com';
      
      const url = `${baseUrl}/api-geo/product-info?id=${encodeURIComponent(xoobayId)}&apiKey=${apiKey}&lang=${lang}`;
      
      // Log the full request URL for debugging
      console.log('[getOfferCard] Calling XOOBAY API for product details:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json() as {
        code: number;
        msg?: string;
        data?: {
          id: string;
          name: string;
          description?: string;
          short_description?: string;
          price: string;
          image_url?: string;
          gallery_images?: string[];
          brand_name?: string;
          category?: string;
          store_name?: string;
        };
      };

      console.log('[getOfferCard] XOOBAY API response:', {
        code: result.code,
        hasData: !!result.data
      });

      if (result.code === 200 && result.data) {
        const product = result.data;
        
        // Parse price
        const priceStr = String(product.price || '0').replace(/[^\d.-]/g, '');
        const priceAmount = parseFloat(priceStr) || 0;
        
        // Build AROC format
        const aroc = {
          aroc_version: '0.1',
          offer_id: offerId,
          spu_id: `spu_xoobay_${xoobayId}`,
          merchant_id: `merchant_xoobay`,
          category: {
            id: 'cat_other',
            name: product.category || 'Other',
            path: product.category ? [product.category] : [],
          },
          titles: [
            { lang: 'en', text: String(product.name || '') },
            { lang: 'zh', text: String(product.name || '') },
          ],
          brand: {
            name: String(product.brand_name || 'XOOBAY'),
            normalized_id: `brand_${(product.brand_name || 'xoobay').toLowerCase().replace(/\s+/g, '_')}`,
            confidence: 'high',
          },
          price: {
            amount: Math.round(priceAmount * 100) / 100,
            currency: 'USD',
          },
          attributes: {
            description: product.description || product.short_description || '',
            image_url: product.image_url || '',
            gallery_images: product.gallery_images || [],
            store_name: product.store_name || '',
            source: 'xoobay',
          },
          variants: {
            skus: [{
              sku_id: `sku_xoobay_${xoobayId}`,
              options: {},
              price: Math.round(priceAmount * 100) / 100,
              currency: 'USD',
              stock: 100, // Default stock for XOOBAY products
              in_stock: true,
            }],
          },
          packaging: {
            weight_g: 0,
            dimensions_mm: { l: 0, w: 0, h: 0 },
          },
          risk_tags: [],
          certifications: [],
          policies: {
            return_policy: {},
            warranty_months: 0,
          },
          metrics: {
            rating: 5.0,
            reviews_count: 10,
          },
        };

        console.log('[getOfferCard] XOOBAY API success, returning AROC for', offerId);
        return aroc;
      } else {
        console.log('[getOfferCard] XOOBAY API returned no data, code:', result.code, 'msg:', result.msg);
      }
    } catch (error) {
      // Detailed error logging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('[getOfferCard] XOOBAY API call failed, falling back to local database...', {
        error: errorMessage,
        stack: errorStack,
        offerId,
        url: `${process.env.XOOBAY_BASE_URL || 'https://www.xoobay.com'}/api-geo/product-info?id=${offerId.replace('xoobay_', '')}&apiKey=${process.env.XOOBAY_API_KEY || 'xoobay_api_ai_geo'}&lang=${process.env.XOOBAY_LANG || 'zh_cn'}`
      });
    }
  }

  // Fallback to local database query - using enhanced v_aroc_full view when possible
  const offer = await queryOne<OfferRow>(
    `SELECT * FROM agent.offers WHERE id = $1`,
    [offerId]
  );

  if (!offer) {
    console.error('[getOfferCard] Offer not found in database:', offerId);
    return { error: { code: 'NOT_FOUND', message: `Offer ${offerId} not found` } };
  }

  // Get SKU variants
  const skus = await query<SkuRow>(
    `SELECT * FROM agent.skus WHERE offer_id = $1`,
    [offerId]
  );

  // Get category information with enhanced fields
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

  // Get KG relations if requested
  const includeKg = params.include_kg_relations !== false;
  let kgRelations: KgRelationRow[] = [];
  if (includeKg) {
    kgRelations = await query<KgRelationRow>(
      `SELECT id, from_type, from_id, relation_type, to_type, to_id, confidence, metadata
       FROM agent.kg_relations 
       WHERE (from_type = 'offer' AND from_id = $1) 
          OR (to_type = 'offer' AND to_id = $1)
       LIMIT 50`,
      [offerId]
    );
  }

  return {
    aroc_version: '0.2',
    offer_id: offer.id,
    spu_id: offer.spu_id,
    merchant_id: offer.merchant_id,
    category: {
      id: category?.id,
      name: category?.name_en,
      name_zh: category?.name_zh,
      path: category?.path ?? [],
      full_path: category?.full_path_en,
      level: category?.level,
      product_count: category?.product_count,
    },
    titles: [
      { lang: 'en', text: offer.title_en },
      { lang: 'zh', text: offer.title_zh },
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
    risk_profile: offer.risk_profile ?? {},
    certifications: offer.certifications ?? [],
    policies: {
      return_policy: offer.return_policy,
      warranty_months: offer.warranty_months,
    },
    metrics: {
      rating: parseFloat(String(offer.rating)),
      reviews_count: offer.reviews_count,
    },
    // Version tracking for AROC
    version: {
      hash: offer.version_hash,
      source: offer.update_source,
    },
    // KG relationships
    kg_relations: includeKg ? kgRelations.map(r => ({
      id: r.id,
      type: r.relation_type,
      from: { type: r.from_type, id: r.from_id },
      to: { type: r.to_type, id: r.to_id },
      confidence: parseFloat(String(r.confidence)),
      metadata: r.metadata,
    })) : undefined,
  };
}

/**
 * Get product variants
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

  // Extract variant axes
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
 * Check stock availability
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

/**
 * Get brand details
 */
async function getBrand(params: Record<string, unknown>): Promise<unknown> {
  const brandId = String(params.brand_id || '').trim();
  
  if (!brandId) {
    return { error: { code: 'INVALID_ARGUMENT', message: 'brand_id is required' } };
  }

  const brand = await queryOne<BrandRow>(
    `SELECT * FROM agent.brands WHERE id = $1`,
    [brandId]
  );

  if (!brand) {
    return { error: { code: 'NOT_FOUND', message: `Brand ${brandId} not found` } };
  }

  // Get related offers count
  const offerCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM agent.offers WHERE brand_id_ref = $1`,
    [brandId]
  );

  return {
    brand_id: brand.id,
    name: brand.name,
    normalized_name: brand.normalized_name,
    logo_url: brand.logo_url,
    country_of_origin: brand.country_of_origin,
    confidence: brand.confidence,
    offer_count: parseInt(offerCount?.count ?? '0'),
  };
}

/**
 * Get merchant details
 */
async function getMerchant(params: Record<string, unknown>): Promise<unknown> {
  const merchantId = String(params.merchant_id || '').trim();
  
  if (!merchantId) {
    return { error: { code: 'INVALID_ARGUMENT', message: 'merchant_id is required' } };
  }

  const merchant = await queryOne<MerchantRow>(
    `SELECT * FROM agent.merchants WHERE id = $1`,
    [merchantId]
  );

  if (!merchant) {
    return { error: { code: 'NOT_FOUND', message: `Merchant ${merchantId} not found` } };
  }

  return {
    merchant_id: merchant.id,
    name: merchant.name,
    store_url: merchant.store_url,
    rating: parseFloat(String(merchant.rating)),
    total_products: merchant.total_products,
    country: merchant.country,
    verified: merchant.verified,
    risk_level: merchant.risk_level,
  };
}

/**
 * Get category tree
 */
async function getCategoryTree(params: Record<string, unknown>): Promise<unknown> {
  const parentId = params.parent_id as string | null;
  const maxDepth = Math.min((params.depth as number) ?? 2, 5);

  let categories: CategoryRow[];
  
  if (parentId) {
    // Get children of specific category up to specified depth
    categories = await query<CategoryRow>(
      `SELECT id, name_en, name_zh, path, full_path_en, product_count, level, parent_id
       FROM agent.categories 
       WHERE parent_id = $1 OR (level <= $2 AND path @> (SELECT path FROM agent.categories WHERE id = $1))
       ORDER BY level, product_count DESC
       LIMIT 200`,
      [parentId, maxDepth]
    );
  } else {
    // Get root categories (level = 1) and their children up to depth
    categories = await query<CategoryRow>(
      `SELECT id, name_en, name_zh, path, full_path_en, product_count, level, parent_id
       FROM agent.categories 
       WHERE level <= $1
       ORDER BY level, product_count DESC
       LIMIT 200`,
      [maxDepth]
    );
  }

  return {
    parent_id: parentId,
    max_depth: maxDepth,
    categories: categories.map(c => ({
      id: c.id,
      name: c.name_en,
      name_zh: c.name_zh,
      path: c.full_path_en ?? c.path?.join(' > '),
      product_count: c.product_count,
      level: c.level,
      has_children: true, // TODO: Check actual children
    })),
    total_count: categories.length,
  };
}

/**
 * Get KG relations for an entity
 */
async function getKgRelations(params: Record<string, unknown>): Promise<unknown> {
  const entityType = String(params.entity_type || '').trim();
  const entityId = String(params.entity_id || '').trim();
  const relationTypes = params.relation_types as string[] | undefined;
  const direction = (params.direction as string) ?? 'both';

  if (!entityType || !entityId) {
    return { error: { code: 'INVALID_ARGUMENT', message: 'entity_type and entity_id are required' } };
  }

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  // Direction filtering
  if (direction === 'outgoing') {
    conditions.push(`(from_type = $${paramIndex} AND from_id = $${paramIndex + 1})`);
    values.push(entityType, entityId);
    paramIndex += 2;
  } else if (direction === 'incoming') {
    conditions.push(`(to_type = $${paramIndex} AND to_id = $${paramIndex + 1})`);
    values.push(entityType, entityId);
    paramIndex += 2;
  } else {
    conditions.push(`((from_type = $${paramIndex} AND from_id = $${paramIndex + 1}) OR (to_type = $${paramIndex} AND to_id = $${paramIndex + 1}))`);
    values.push(entityType, entityId);
    paramIndex += 2;
  }

  // Relation type filter
  if (relationTypes && relationTypes.length > 0) {
    conditions.push(`relation_type = ANY($${paramIndex})`);
    values.push(relationTypes);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');
  
  const relations = await query<KgRelationRow>(
    `SELECT id, from_type, from_id, relation_type, to_type, to_id, confidence, metadata
     FROM agent.kg_relations 
     WHERE ${whereClause}
     ORDER BY confidence DESC
     LIMIT 100`,
    values
  );

  return {
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

      case 'get_brand':
        return getBrand(p);

      case 'get_merchant':
        return getMerchant(p);

      case 'get_category_tree':
        return getCategoryTree(p);

      case 'get_kg_relations':
        return getKgRelations(p);

      default:
        throw new Error(`Unknown catalog tool: ${tool}`);
    }
  };
}
