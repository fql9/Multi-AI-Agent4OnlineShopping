/**
 * XOOBAY Product Database Sync Script
 * 
 * This script fetches all products from XOOBAY API and syncs them to:
 * 1. agent.offers - Main product catalog
 * 2. agent.skus - Product SKUs
 * 3. agent.evidence_chunks - RAG knowledge base
 * 4. agent.categories - Product categories
 * 
 * Usage:
 *   npx tsx scripts/sync-xoobay-products.ts [--pages=N] [--lang=en|zh]
 */

import { Pool } from 'pg';

// ============================================================
// Configuration
// ============================================================

const XOOBAY_BASE_URL = process.env.XOOBAY_BASE_URL || 'https://www.xoobay.com';
const XOOBAY_API_KEY = process.env.XOOBAY_API_KEY || 'xoobay_api_ai_geo';
const XOOBAY_LANG = process.env.XOOBAY_LANG || 'en';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  database: process.env.DB_NAME || 'shopping_agent',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

// ============================================================
// Types
// ============================================================

interface XOOBAYProduct {
  id: number;
  name: string;
  money: string;
  shop_id: number;
  img_logo: string;
}

interface XOOBAYProductDetail {
  id: string;
  name: string;
  description: string;
  short_description: string;
  category: string;
  sku: string;
  price: string;
  image_url: string;
  gallery_images: string[];
  brand_name: string;
  brand_url: string;
  status: number;
  store_id: number;
  store_name: string;
  store_description: string;
}

interface XOOBAYResponse<T> {
  code: number;
  msg: string;
  data: T;
}

interface XOOBAYProductListResponse {
  list: XOOBAYProduct[];
  pager: {
    page: number;
    count: number;
    pageCount: number;
  };
}

interface SyncStats {
  pages_processed: number;
  products_fetched: number;
  offers_inserted: number;
  offers_updated: number;
  skus_inserted: number;
  categories_created: number;
  chunks_indexed: number;
  errors: string[];
  start_time: Date;
  end_time?: Date;
}

// ============================================================
// Database Connection
// ============================================================

let pool: Pool;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool(DB_CONFIG);
  }
  return pool;
}

async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

// ============================================================
// XOOBAY API Functions
// ============================================================

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry<T>(url: string, retries = 3): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < retries - 1) {
        await sleep(1000 * (i + 1));
      }
    }
  }
  
  throw lastError;
}

async function getProductList(page: number, lang: string): Promise<XOOBAYProductListResponse | null> {
  const url = `${XOOBAY_BASE_URL}/api-geo/product-list?pageNo=${page}&apiKey=${XOOBAY_API_KEY}&lang=${lang}`;
  
  try {
    const response = await fetchWithRetry<XOOBAYResponse<XOOBAYProductListResponse>>(url);
    if (response.code !== 200) {
      console.error(`[getProductList] Page ${page}: API error - ${response.msg}`);
      return null;
    }
    return response.data;
  } catch (error) {
    console.error(`[getProductList] Page ${page}: ${error}`);
    return null;
  }
}

async function getProductDetail(id: number, lang: string): Promise<XOOBAYProductDetail | null> {
  const url = `${XOOBAY_BASE_URL}/api-geo/product-info?id=${id}&apiKey=${XOOBAY_API_KEY}&lang=${lang}`;
  
  try {
    const response = await fetchWithRetry<XOOBAYResponse<XOOBAYProductDetail>>(url);
    if (response.code !== 200) {
      return null;
    }
    return response.data;
  } catch (error) {
    console.error(`[getProductDetail] ID ${id}: ${error}`);
    return null;
  }
}

// ============================================================
// Database Sync Functions
// ============================================================

async function ensureCategory(categoryName: string): Promise<string> {
  if (!categoryName) {
    categoryName = 'Other';
  }
  
  const categoryId = `cat_${categoryName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  
  await query(
    `INSERT INTO agent.categories (id, name_en, name_zh, level)
     VALUES ($1, $2, $2, 0)
     ON CONFLICT (id) DO NOTHING`,
    [categoryId, categoryName]
  );
  
  return categoryId;
}

async function upsertOffer(product: XOOBAYProductDetail, categoryId: string): Promise<boolean> {
  const offerId = `xoobay_${product.id}`;
  
  // Parse price
  let price = 0;
  if (product.price) {
    const priceStr = String(product.price).replace(/[^\d.-]/g, '');
    price = parseFloat(priceStr) || 0;
  }
  
  // Build attributes JSON
  const attributes = {
    image_url: product.image_url,
    gallery_images: product.gallery_images || [],
    description: product.description,
    short_description: product.short_description,
    store_name: product.store_name,
    store_id: product.store_id,
    store_description: product.store_description,
    sku: product.sku,
    brand_url: product.brand_url,
    status: product.status,
    source: 'xoobay',
  };
  
  try {
    await query(
      `INSERT INTO agent.offers (
        id, category_id, title_en, title_zh, brand_name, 
        base_price, currency, attributes, rating, created_at, updated_at
      ) VALUES ($1, $2, $3, $3, $4, $5, 'USD', $6, 4.0, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         category_id = EXCLUDED.category_id,
         title_en = EXCLUDED.title_en,
         title_zh = EXCLUDED.title_zh,
         brand_name = EXCLUDED.brand_name,
         base_price = EXCLUDED.base_price,
         attributes = EXCLUDED.attributes,
         updated_at = NOW()`,
      [
        offerId,
        categoryId,
        product.name,
        product.brand_name || 'Unknown',
        price,
        JSON.stringify(attributes),
      ]
    );
    return true;
  } catch (error) {
    console.error(`[upsertOffer] ${offerId}: ${error}`);
    return false;
  }
}

async function upsertSku(product: XOOBAYProductDetail): Promise<boolean> {
  const offerId = `xoobay_${product.id}`;
  const skuId = `sku_xoobay_${product.id}`;
  
  // Parse price
  let price = 0;
  if (product.price) {
    const priceStr = String(product.price).replace(/[^\d.-]/g, '');
    price = parseFloat(priceStr) || 0;
  }
  
  try {
    await query(
      `INSERT INTO agent.skus (id, offer_id, price, currency, stock, created_at, updated_at)
       VALUES ($1, $2, $3, 'USD', 100, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         price = EXCLUDED.price,
         updated_at = NOW()`,
      [skuId, offerId, price]
    );
    return true;
  } catch (error) {
    console.error(`[upsertSku] ${skuId}: ${error}`);
    return false;
  }
}

function generateSimpleEmbedding(text: string): number[] {
  // Normalize and tokenize
  const tokens = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
  
  // Create a simple 1536-dimensional vector
  const embedding = new Array(1536).fill(0);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let hash = 0;
    for (let j = 0; j < token.length; j++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(j);
      hash = hash & hash;
    }
    
    for (let k = 0; k < 4; k++) {
      const idx = Math.abs((hash + k * 17) % 1536);
      embedding[idx] += 1.0 / (1 + i * 0.1);
    }
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

async function indexProductChunks(product: XOOBAYProductDetail): Promise<number> {
  const offerId = `xoobay_${product.id}`;
  let chunksCreated = 0;
  
  // Build full text content
  const fullText = [
    product.name,
    product.short_description,
    product.description,
    product.brand_name,
    product.category,
  ].filter(Boolean).join('\n\n');
  
  if (!fullText || fullText.length < 10) {
    return 0;
  }
  
  // Chunk the text (max 500 chars per chunk)
  const chunks: Array<{ text: string; start: number; end: number }> = [];
  const sentences = fullText.split(/(?<=[.!?。！？])\s+/);
  let currentChunk = '';
  let currentStart = 0;
  let position = 0;
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > 500 && currentChunk.length > 0) {
      chunks.push({ text: currentChunk.trim(), start: currentStart, end: position });
      currentChunk = sentence;
      currentStart = position;
    } else {
      if (currentChunk.length === 0) currentStart = position;
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
    }
    position += sentence.length + 1;
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push({ text: currentChunk.trim(), start: currentStart, end: position });
  }
  
  // Insert chunks with embeddings
  for (const chunk of chunks) {
    try {
      const embedding = generateSimpleEmbedding(chunk.text);
      const embeddingStr = `[${embedding.join(',')}]`;
      
      await query(
        `INSERT INTO agent.evidence_chunks (text, source_type, offer_id, category_id, language, offsets, embedding)
         VALUES ($1, 'product_description', $2, $3, 'en', $4, $5::vector)
         ON CONFLICT DO NOTHING`,
        [
          chunk.text,
          offerId,
          `cat_${(product.category || 'other').toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          JSON.stringify({ start: chunk.start, end: chunk.end }),
          embeddingStr,
        ]
      );
      chunksCreated++;
    } catch (error) {
      // Ignore duplicate/conflict errors
    }
  }
  
  return chunksCreated;
}

// ============================================================
// Main Sync Function
// ============================================================

async function syncXoobayProducts(options: {
  maxPages?: number;
  lang?: string;
  clearExisting?: boolean;
}): Promise<SyncStats> {
  const { maxPages = 100, lang = XOOBAY_LANG, clearExisting = false } = options;
  
  const stats: SyncStats = {
    pages_processed: 0,
    products_fetched: 0,
    offers_inserted: 0,
    offers_updated: 0,
    skus_inserted: 0,
    categories_created: 0,
    chunks_indexed: 0,
    errors: [],
    start_time: new Date(),
  };
  
  console.log('======================================================');
  console.log('XOOBAY Product Database Sync');
  console.log('======================================================');
  console.log(`API: ${XOOBAY_BASE_URL}`);
  console.log(`Language: ${lang}`);
  console.log(`Max Pages: ${maxPages}`);
  console.log(`Database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  console.log('------------------------------------------------------');
  
  // Clear existing XOOBAY data if requested
  if (clearExisting) {
    console.log('\n[Step 0] Clearing existing XOOBAY data...');
    await query(`DELETE FROM agent.evidence_chunks WHERE offer_id LIKE 'xoobay_%'`);
    await query(`DELETE FROM agent.skus WHERE offer_id LIKE 'xoobay_%'`);
    await query(`DELETE FROM agent.offers WHERE id LIKE 'xoobay_%'`);
    console.log('  ✓ Cleared existing data');
  }
  
  // First, get total page count
  console.log('\n[Step 1] Fetching product list metadata...');
  const firstPage = await getProductList(1, lang);
  if (!firstPage) {
    stats.errors.push('Failed to fetch first page');
    return stats;
  }
  
  const totalPages = Math.min(firstPage.pager.pageCount, maxPages);
  const totalProducts = firstPage.pager.count;
  console.log(`  ✓ Total products: ${totalProducts}`);
  console.log(`  ✓ Total pages: ${firstPage.pager.pageCount}`);
  console.log(`  ✓ Pages to process: ${totalPages}`);
  
  // Process pages
  console.log('\n[Step 2] Syncing products...');
  const categories = new Set<string>();
  
  for (let page = 1; page <= totalPages; page++) {
    process.stdout.write(`  Page ${page}/${totalPages}: `);
    
    const pageData = page === 1 ? firstPage : await getProductList(page, lang);
    if (!pageData || !pageData.list) {
      console.log('❌ Failed to fetch');
      stats.errors.push(`Page ${page}: Failed to fetch`);
      continue;
    }
    
    let pageSuccess = 0;
    let pageFailed = 0;
    
    for (const product of pageData.list) {
      stats.products_fetched++;
      
      // Fetch product details
      const detail = await getProductDetail(product.id, lang);
      if (!detail) {
        pageFailed++;
        continue;
      }
      
      // Ensure category exists
      const categoryId = await ensureCategory(detail.category);
      if (!categories.has(categoryId)) {
        categories.add(categoryId);
        stats.categories_created++;
      }
      
      // Upsert offer
      const offerOk = await upsertOffer(detail, categoryId);
      if (offerOk) stats.offers_inserted++;
      
      // Upsert SKU
      const skuOk = await upsertSku(detail);
      if (skuOk) stats.skus_inserted++;
      
      // Index for RAG
      const chunks = await indexProductChunks(detail);
      stats.chunks_indexed += chunks;
      
      if (offerOk && skuOk) {
        pageSuccess++;
      } else {
        pageFailed++;
      }
      
      // Rate limiting
      await sleep(100);
    }
    
    stats.pages_processed++;
    console.log(`✓ ${pageSuccess} synced, ${pageFailed} failed`);
    
    // Rate limiting between pages
    await sleep(200);
  }
  
  stats.end_time = new Date();
  
  // Print summary
  console.log('\n======================================================');
  console.log('SYNC COMPLETE');
  console.log('======================================================');
  console.log(`Duration: ${Math.round((stats.end_time.getTime() - stats.start_time.getTime()) / 1000)}s`);
  console.log(`Pages Processed: ${stats.pages_processed}`);
  console.log(`Products Fetched: ${stats.products_fetched}`);
  console.log(`Offers Inserted/Updated: ${stats.offers_inserted}`);
  console.log(`SKUs Inserted/Updated: ${stats.skus_inserted}`);
  console.log(`Categories Created: ${stats.categories_created}`);
  console.log(`RAG Chunks Indexed: ${stats.chunks_indexed}`);
  
  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    if (stats.errors.length > 10) {
      console.log(`  ... and ${stats.errors.length - 10} more`);
    }
  }
  
  return stats;
}

// ============================================================
// CLI Entry Point
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  
  let maxPages = 50; // Default to 50 pages
  let lang = XOOBAY_LANG;
  let clearExisting = true; // Default to clear existing
  
  for (const arg of args) {
    if (arg.startsWith('--pages=')) {
      maxPages = parseInt(arg.split('=')[1]) || 50;
    } else if (arg.startsWith('--lang=')) {
      lang = arg.split('=')[1] || 'en';
    } else if (arg === '--keep-existing') {
      clearExisting = false;
    } else if (arg === '--help') {
      console.log(`
XOOBAY Product Database Sync

Usage:
  npx tsx scripts/sync-xoobay-products.ts [options]

Options:
  --pages=N          Number of pages to sync (default: 50)
  --lang=LANG        Language (en or zh, default: en)
  --keep-existing    Don't clear existing XOOBAY data before sync
  --help             Show this help message

Environment Variables:
  XOOBAY_BASE_URL    XOOBAY API base URL
  XOOBAY_API_KEY     XOOBAY API key
  DB_HOST            PostgreSQL host (default: localhost)
  DB_PORT            PostgreSQL port (default: 5433)
  DB_NAME            Database name (default: shopping_agent)
  DB_USER            Database user (default: postgres)
  DB_PASSWORD        Database password (default: postgres)

Examples:
  # Sync 50 pages of products
  npx tsx scripts/sync-xoobay-products.ts --pages=50

  # Sync all products in Chinese
  npx tsx scripts/sync-xoobay-products.ts --pages=500 --lang=zh

  # Sync without clearing existing data
  npx tsx scripts/sync-xoobay-products.ts --pages=10 --keep-existing
`);
      process.exit(0);
    }
  }
  
  try {
    await syncXoobayProducts({ maxPages, lang, clearExisting });
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

main();
