/**
 * XOOBAY Product Database Sync Script (Concurrent Version)
 * 
 * This script fetches all products from XOOBAY API and syncs them to:
 * 1. agent.offers - Main product catalog
 * 2. agent.skus - Product SKUs
 * 3. agent.evidence_chunks - RAG knowledge base
 * 4. agent.categories - Product categories
 * 
 * Usage:
 *   npx tsx scripts/sync-xoobay-products.ts [--pages=N] [--concurrency=N] [--start-page=N]
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
  max: 20, // 增加连接池大小以支持并发
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
  skus_inserted: number;
  categories_created: number;
  chunks_indexed: number;
  errors: string[];
  start_time: Date;
  end_time?: Date;
}

interface PageResult {
  page: number;
  success: number;
  failed: number;
  chunks: number;
  error?: string;
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
      return null;
    }
    return response.data;
  } catch (error) {
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
  
  let price = 0;
  if (product.price) {
    const priceStr = String(product.price).replace(/[^\d.-]/g, '');
    price = parseFloat(priceStr) || 0;
  }
  
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
      [offerId, categoryId, product.name, product.brand_name || 'Unknown', price, JSON.stringify(attributes)]
    );
    return true;
  } catch (error) {
    return false;
  }
}

async function upsertSku(product: XOOBAYProductDetail): Promise<boolean> {
  const offerId = `xoobay_${product.id}`;
  const skuId = `sku_xoobay_${product.id}`;
  
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
    return false;
  }
}

function generateSimpleEmbedding(text: string): number[] {
  const tokens = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
  
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
// Concurrent Processing
// ============================================================

/**
 * 处理单个页面的所有产品
 */
async function processPage(page: number, lang: string): Promise<PageResult> {
  const result: PageResult = { page, success: 0, failed: 0, chunks: 0 };
  
  try {
    const pageData = await getProductList(page, lang);
    if (!pageData || !pageData.list) {
      result.error = 'Failed to fetch page';
      return result;
    }
    
    // 并发处理页面内的产品（每页最多20个产品，使用4个并发）
    const productConcurrency = 4;
    const products = pageData.list;
    
    for (let i = 0; i < products.length; i += productConcurrency) {
      const batch = products.slice(i, i + productConcurrency);
      const promises = batch.map(async (product) => {
        const detail = await getProductDetail(product.id, lang);
        if (!detail) {
          return { success: false, chunks: 0 };
        }
        
        const categoryId = await ensureCategory(detail.category);
        const offerOk = await upsertOffer(detail, categoryId);
        const skuOk = await upsertSku(detail);
        const chunks = await indexProductChunks(detail);
        
        return { success: offerOk && skuOk, chunks };
      });
      
      const results = await Promise.all(promises);
      for (const r of results) {
        if (r.success) {
          result.success++;
        } else {
          result.failed++;
        }
        result.chunks += r.chunks;
      }
      
      // 批次间小延迟，避免API过载
      await sleep(50);
    }
  } catch (error) {
    result.error = String(error);
  }
  
  return result;
}

/**
 * 并发执行器 - 控制最大并发数
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  onProgress?: (completed: number, total: number, result: R) => void
): Promise<R[]> {
  const results: R[] = [];
  let completed = 0;
  let currentIndex = 0;
  
  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];
      const result = await fn(item);
      results[index] = result;
      completed++;
      if (onProgress) {
        onProgress(completed, items.length, result);
      }
    }
  }
  
  // 创建 workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  
  await Promise.all(workers);
  return results;
}

// ============================================================
// Main Sync Function (Concurrent)
// ============================================================

async function syncXoobayProductsConcurrent(options: {
  maxPages?: number;
  startPage?: number;
  concurrency?: number;
  lang?: string;
  clearExisting?: boolean;
}): Promise<SyncStats> {
  const { 
    maxPages = 100, 
    startPage = 1, 
    concurrency = 6,
    lang = XOOBAY_LANG, 
    clearExisting = false 
  } = options;
  
  const stats: SyncStats = {
    pages_processed: 0,
    products_fetched: 0,
    offers_inserted: 0,
    skus_inserted: 0,
    categories_created: 0,
    chunks_indexed: 0,
    errors: [],
    start_time: new Date(),
  };
  
  console.log('══════════════════════════════════════════════════════');
  console.log('  🚀 XOOBAY Product Database Sync (CONCURRENT)');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  API: ${XOOBAY_BASE_URL}`);
  console.log(`  Language: ${lang}`);
  console.log(`  Concurrency: ${concurrency} workers`);
  console.log(`  Database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  console.log('──────────────────────────────────────────────────────');
  
  // Clear existing XOOBAY data if requested
  if (clearExisting) {
    console.log('\n[Step 0] 🗑️  Clearing existing XOOBAY data...');
    await query(`DELETE FROM agent.evidence_chunks WHERE offer_id LIKE 'xoobay_%'`);
    await query(`DELETE FROM agent.skus WHERE offer_id LIKE 'xoobay_%'`);
    await query(`DELETE FROM agent.offers WHERE id LIKE 'xoobay_%'`);
    console.log('  ✓ Cleared existing data');
  }
  
  // Get total page count
  console.log('\n[Step 1] 📊 Fetching product list metadata...');
  const firstPage = await getProductList(1, lang);
  if (!firstPage) {
    console.error('  ❌ Failed to fetch first page');
    stats.errors.push('Failed to fetch first page');
    return stats;
  }
  
  const totalPages = Math.min(firstPage.pager.pageCount, maxPages);
  const effectiveStartPage = Math.max(1, Math.min(startPage, totalPages));
  const pagesToProcess = totalPages - effectiveStartPage + 1;
  
  console.log(`  ✓ Total products available: ${firstPage.pager.count.toLocaleString()}`);
  console.log(`  ✓ Total pages available: ${firstPage.pager.pageCount.toLocaleString()}`);
  console.log(`  ✓ Start page: ${effectiveStartPage}`);
  console.log(`  ✓ End page: ${totalPages}`);
  console.log(`  ✓ Pages to process: ${pagesToProcess}`);
  console.log(`  ✓ Estimated products: ~${(pagesToProcess * 20).toLocaleString()}`);
  
  // Generate page numbers to process
  const pages: number[] = [];
  for (let p = effectiveStartPage; p <= totalPages; p++) {
    pages.push(p);
  }
  
  // Process pages concurrently
  console.log(`\n[Step 2] 🔄 Syncing products with ${concurrency} concurrent workers...`);
  console.log('──────────────────────────────────────────────────────');
  
  const startTime = Date.now();
  let lastProgressTime = startTime;
  
  const pageResults = await runWithConcurrency(
    pages,
    concurrency,
    (page) => processPage(page, lang),
    (completed, total, result) => {
      stats.pages_processed++;
      stats.offers_inserted += result.success;
      stats.products_fetched += result.success + result.failed;
      stats.chunks_indexed += result.chunks;
      
      if (result.error) {
        stats.errors.push(`Page ${result.page}: ${result.error}`);
      }
      
      // 每2秒或每50页打印一次进度
      const now = Date.now();
      if (now - lastProgressTime > 2000 || completed % 50 === 0 || completed === total) {
        const elapsed = (now - startTime) / 1000;
        const rate = completed / elapsed;
        const eta = Math.round((total - completed) / rate);
        const percent = Math.round((completed / total) * 100);
        
        process.stdout.write(`\r  Progress: ${completed}/${total} pages (${percent}%) | ` +
          `${stats.offers_inserted.toLocaleString()} products | ` +
          `${rate.toFixed(1)} pages/s | ETA: ${eta}s    `);
        lastProgressTime = now;
      }
    }
  );
  
  console.log('\n');
  
  stats.end_time = new Date();
  const duration = Math.round((stats.end_time.getTime() - stats.start_time.getTime()) / 1000);
  
  // Print summary
  console.log('══════════════════════════════════════════════════════');
  console.log('  ✅ SYNC COMPLETE');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  ⏱️  Duration: ${duration}s (${(duration / 60).toFixed(1)} min)`);
  console.log(`  📄 Pages Processed: ${stats.pages_processed.toLocaleString()}`);
  console.log(`  📦 Products Synced: ${stats.offers_inserted.toLocaleString()}`);
  console.log(`  🔍 RAG Chunks: ${stats.chunks_indexed.toLocaleString()}`);
  console.log(`  ⚡ Speed: ${(stats.pages_processed / duration).toFixed(2)} pages/s`);
  console.log(`  ⚡ Speed: ${(stats.offers_inserted / duration).toFixed(1)} products/s`);
  
  if (stats.errors.length > 0) {
    console.log(`\n  ⚠️  Errors (${stats.errors.length}):`);
    stats.errors.slice(0, 5).forEach(e => console.log(`    - ${e}`));
    if (stats.errors.length > 5) {
      console.log(`    ... and ${stats.errors.length - 5} more`);
    }
  }
  
  console.log('══════════════════════════════════════════════════════\n');
  
  return stats;
}

// ============================================================
// CLI Entry Point
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  
  let maxPages = 100;
  let startPage = 1;
  let concurrency = 6;
  let lang = XOOBAY_LANG;
  let clearExisting = true;
  
  for (const arg of args) {
    if (arg.startsWith('--pages=')) {
      maxPages = parseInt(arg.split('=')[1]) || 100;
    } else if (arg.startsWith('--start-page=')) {
      startPage = parseInt(arg.split('=')[1]) || 1;
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = Math.min(12, Math.max(1, parseInt(arg.split('=')[1]) || 6));
    } else if (arg.startsWith('--lang=')) {
      lang = arg.split('=')[1] || 'en';
    } else if (arg === '--keep-existing') {
      clearExisting = false;
    } else if (arg === '--help') {
      console.log(`
🚀 XOOBAY Product Database Sync (Concurrent Version)

Usage:
  npx tsx scripts/sync-xoobay-products.ts [options]

Options:
  --pages=N          End page number (default: 100)
  --start-page=N     Start from page N (default: 1)
  --concurrency=N    Number of concurrent workers, max 12 (default: 6)
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
  # Sync pages 1-500 with 6 workers
  npx tsx scripts/sync-xoobay-products.ts --pages=500 --concurrency=6

  # Sync pages 501-1000 with 6 workers (continue from previous sync)
  npx tsx scripts/sync-xoobay-products.ts --start-page=501 --pages=1000 --concurrency=6 --keep-existing

  # Fast sync with max concurrency
  npx tsx scripts/sync-xoobay-products.ts --pages=2000 --concurrency=12 --keep-existing
`);
      process.exit(0);
    }
  }
  
  try {
    await syncXoobayProductsConcurrent({ maxPages, startPage, concurrency, lang, clearExisting });
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
