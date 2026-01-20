/**
 * XOOBAY API Client
 * 
 * Integrates XOOBAY product API with robust error handling:
 * - Retry with exponential backoff
 * - Timeout handling
 * - Circuit breaker pattern
 * - Graceful degradation
 */

import { createLogger } from '@shopping-agent/common';

const logger = createLogger('xoobay-client');

// ============================================================
// Types
// ============================================================

/**
 * Product from /api-geo/product-search
 * Returns rich product data including goods_url, sold_cnt, etc.
 */
interface XOOBAYSearchProduct {
  id: string;           // Format: "4608-en"
  goods_id: number;     // Numeric product ID
  goods_name: string;
  goods_logo: string;   // Image URL
  goods_url: string;    // Product page URL
  money: string;        // Current price
  money_old: string;    // Original price (for discount calculation)
  sold_cnt: number;     // Number sold
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

interface XOOBAYStore {
  id: number;
  name: string;
  url: string;
  store_url: string;
  remark: string;
}

interface XOOBAYResponse<T> {
  code: number;
  msg: string;
  data: T;
}

/**
 * Response from /api-geo/product-search
 * Pagination structure: total/page/limit
 */
interface XOOBAYProductSearchResponse {
  list: XOOBAYSearchProduct[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================
// Retry & Circuit Breaker Implementation
// ============================================================

interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  timeout: number;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureTime: Date | null = null;
  private successCount = 0;
  
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;

  constructor(options: {
    failureThreshold?: number;
    resetTimeout?: number;
    successThreshold?: number;
  } = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60000;
    this.successThreshold = options.successThreshold ?? 2;
  }

  getState(): CircuitState {
    return this.state;
  }

  canExecute(): boolean {
    if (this.state === 'CLOSED') return true;
    
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = this.lastFailureTime
        ? Date.now() - this.lastFailureTime.getTime()
        : Infinity;
      
      if (timeSinceLastFailure >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        logger.info('Circuit breaker transitioning to HALF_OPEN');
        return true;
      }
      return false;
    }
    
    return true; // HALF_OPEN allows requests
  }

  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failures = 0;
        this.successCount = 0;
        logger.info('Circuit breaker closed after successful recovery');
      }
    } else if (this.state === 'CLOSED') {
      this.failures = 0;
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();
    this.successCount = 0;
    
    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn({ failures: this.failures }, 'Circuit breaker opened');
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  timeout: number,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt >= options.maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = options.initialDelay * Math.pow(2, attempt);
      const cappedDelay = Math.min(baseDelay, options.maxDelay);
      const jitter = cappedDelay * 0.1 * Math.random();
      const delay = Math.floor(cappedDelay + jitter);

      logger.warn({ 
        attempt: attempt + 1, 
        maxRetries: options.maxRetries,
        delay,
        error: lastError.message 
      }, 'Retrying after error');

      await sleep(delay);
    }
  }

  throw lastError;
}

// ============================================================
// XOOBAY Client
// ============================================================

export class XOOBAYClient {
  private baseUrl: string;
  private apiKey: string;
  private lang: string;
  private circuitBreaker: CircuitBreaker;
  private retryOptions: RetryOptions;
  
  // Cache for product details (5 minute TTL)
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000;

  constructor() {
    this.baseUrl = process.env.XOOBAY_BASE_URL || 'https://www.xoobay.com';
    this.apiKey = process.env.XOOBAY_API_KEY || 'xoobay_api_ai_geo';
    this.lang = process.env.XOOBAY_LANG || 'en';
    
    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      successThreshold: 2,
    });

    // Retry configuration
    this.retryOptions = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      timeout: 15000,
    };

    logger.info({
      baseUrl: this.baseUrl,
      lang: this.lang,
    }, 'XOOBAY client initialized');
  }

  /**
   * Check if circuit allows requests
   */
  private checkCircuit(): void {
    if (!this.circuitBreaker.canExecute()) {
      const error = new Error('Circuit breaker is open, rejecting request');
      error.name = 'CircuitOpenError';
      throw error;
    }
  }

  /**
   * Get cached value or null
   */
  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      logger.debug({ key }, 'Cache hit');
      return cached.data as T;
    }
    return null;
  }

  /**
   * Set cache value
   */
  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
    
    // Cleanup old entries periodically
    if (this.cache.size > 1000) {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > this.cacheTTL) {
          this.cache.delete(k);
        }
      }
    }
  }

  /**
   * Make API request with retry and circuit breaker
   */
  private async apiRequest<T>(
    endpoint: string,
    params: Record<string, string> = {},
    cacheKey?: string
  ): Promise<T> {
    // Check circuit breaker
    this.checkCircuit();

    // Check cache
    if (cacheKey) {
      const cached = this.getCached<T>(cacheKey);
      if (cached) return cached;
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('apiKey', this.apiKey);
    url.searchParams.set('lang', this.lang);
    
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }

    logger.debug({ url: url.toString() }, 'Making XOOBAY API request');

    try {
      const result = await retryWithBackoff(
        async () => {
          const response = await fetchWithTimeout(
            url.toString(),
            this.retryOptions.timeout
          );

          if (!response.ok) {
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            error.name = 'HttpError';
            throw error;
          }

          const data = await response.json() as XOOBAYResponse<T>;

          if (data.code !== 200) {
            const error = new Error(`API error: ${data.msg || 'Unknown error'}`);
            error.name = 'ApiError';
            throw error;
          }

          return data.data;
        },
        this.retryOptions
      );

      // Record success
      this.circuitBreaker.recordSuccess();

      // Cache result
      if (cacheKey) {
        this.setCache(cacheKey, result);
      }

      return result;
    } catch (error) {
      // Record failure for circuit breaker
      this.circuitBreaker.recordFailure();

      logger.error({
        endpoint,
        error: error instanceof Error ? error.message : String(error),
        circuitState: this.circuitBreaker.getState(),
      }, 'XOOBAY API request failed');

      throw error;
    }
  }

  /**
   * Get product details
   */
  async getProductInfo(id: string | number, lang = this.lang): Promise<XOOBAYProductDetail> {
    const cacheKey = `product:${id}:${lang}`;
    
    return this.apiRequest<XOOBAYProductDetail>(
      '/api-geo/product-info',
      {
        id: String(id),
        lang,
      },
      cacheKey
    );
  }

  /**
   * Get store details
   */
  async getStoreInfo(id: string | number, lang = this.lang): Promise<XOOBAYStore> {
    const cacheKey = `store:${id}:${lang}`;
    
    return this.apiRequest<XOOBAYStore>(
      '/api-geo/store-info',
      {
        id: String(id),
        lang,
      },
      cacheKey
    );
  }

  /**
   * Search products using the latest /api-geo/product-search endpoint
   * 
   * This endpoint provides:
   * - Better search capabilities
   * - pageSize parameter for controlling results per page
   * - More product fields: goods_url, sold_cnt, money_old
   * - Different pagination structure (total/page/limit)
   */
  async searchProducts(params: {
    query?: string;
    pageNo?: number;
    pageSize?: number;
    lang?: string;
  } = {}): Promise<XOOBAYProductSearchResponse> {
    const { 
      query = '', 
      pageNo = 1, 
      pageSize = 20, 
      lang = this.lang 
    } = params;
    
    const cacheKey = `search:${query}:${pageNo}:${pageSize}:${lang}`;
    
    return this.apiRequest<XOOBAYProductSearchResponse>(
      '/api-geo/product-search',
      {
        name: query,
        pageNo: String(pageNo),
        pageSize: String(pageSize),
        lang,
      },
      cacheKey
    );
  }

  /**
   * Search products with automatic keyword fallback
   * If no results with full query, tries individual keywords
   */
  async searchProductsWithFallback(params: {
    query: string;
    pageNo?: number;
    pageSize?: number;
    lang?: string;
  }): Promise<XOOBAYProductSearchResponse> {
    const { query, pageNo = 1, pageSize = 20, lang = this.lang } = params;
    
    // First try with full query
    let result = await this.searchProducts({ query, pageNo, pageSize, lang });
    
    // If no results with full query, try individual keywords
    if (result.list.length === 0 && query) {
      const searchTerms = query.split(/\s+/).filter(t => t.length >= 3);
      
      // Try keywords from last to first (last word is often the product type)
      for (let i = searchTerms.length - 1; i >= 0 && result.list.length === 0; i--) {
        const term = searchTerms[i];
        logger.info({ term, original_query: query }, 'Retrying search with single keyword');
        result = await this.searchProducts({ query: term, pageNo, pageSize, lang });
      }
    }
    
    return result;
  }

  /**
   * Search products with bilingual support (Chinese + English)
   * 
   * XOOBAY is a Chinese e-commerce platform, so Chinese queries work better.
   * This method tries:
   * 1. Original language query (e.g., Chinese "黑色夹克")
   * 2. English query as fallback (e.g., "black jacket")
   * 3. Individual keywords from both queries
   * 
   * Results are merged and deduplicated.
   */
  async searchProductsBilingual(params: {
    queryOriginal: string;  // 原始语言查询（如中文）
    queryEn: string;        // 英文查询
    pageNo?: number;
    pageSize?: number;
    lang?: string;
  }): Promise<XOOBAYProductSearchResponse> {
    const { queryOriginal, queryEn, pageNo = 1, pageSize = 20, lang = this.lang } = params;
    
    logger.info({ 
      queryOriginal, 
      queryEn,
      pageNo,
      pageSize,
    }, 'Starting bilingual search');

    // 检测原始查询是否包含中文
    const hasChinese = queryOriginal && /[\u4e00-\u9fff]/.test(queryOriginal);
    
    // 策略 1: 优先使用中文查询（对 XOOBAY 效果最好）
    let result: XOOBAYProductSearchResponse = { list: [], total: 0, page: pageNo, limit: pageSize };
    
    if (hasChinese && queryOriginal) {
      logger.info({ query: queryOriginal }, 'Trying Chinese query first');
      result = await this.searchProducts({ query: queryOriginal, pageNo, pageSize, lang });
      
      if (result.list.length > 0) {
        logger.info({ 
          query: queryOriginal, 
          count: result.list.length 
        }, 'Chinese query succeeded');
        return result;
      }
    }
    
    // 策略 2: 如果中文查询没结果，尝试英文查询
    if (result.list.length === 0 && queryEn) {
      logger.info({ query: queryEn }, 'Trying English query');
      result = await this.searchProducts({ query: queryEn, pageNo, pageSize, lang });
      
      if (result.list.length > 0) {
        logger.info({ 
          query: queryEn, 
          count: result.list.length 
        }, 'English query succeeded');
        return result;
      }
    }
    
    // 策略 3: 如果仍然没结果，尝试从中文查询中提取单个关键词
    if (result.list.length === 0 && hasChinese && queryOriginal) {
      // 中文分词：提取可能的产品关键词
      // 常见的产品词汇
      const chineseProductKeywords = [
        '夹克', '外套', '大衣', '风衣', '棉服', '羽绒服', '卫衣', '毛衣',
        '衬衫', 'T恤', '短袖', '长袖', '背心', '马甲',
        '裤子', '牛仔裤', '休闲裤', '运动裤', '短裤', '半裙', '连衣裙',
        '鞋子', '运动鞋', '皮鞋', '靴子', '凉鞋', '拖鞋',
        '包', '背包', '手提包', '钱包', '手表', '眼镜', '帽子',
        '手机', '充电器', '耳机', '数据线', '保护壳',
      ];
      
      for (const keyword of chineseProductKeywords) {
        if (queryOriginal.includes(keyword)) {
          logger.info({ keyword }, 'Trying extracted Chinese keyword');
          result = await this.searchProducts({ query: keyword, pageNo, pageSize, lang });
          if (result.list.length > 0) {
            logger.info({ keyword, count: result.list.length }, 'Chinese keyword search succeeded');
            return result;
          }
        }
      }
    }
    
    // 策略 4: 从英文查询中提取核心产品词
    if (result.list.length === 0 && queryEn) {
      const englishWords = queryEn.toLowerCase().split(/\s+/);
      const coreProductWords = [
        'jacket', 'coat', 'blazer', 'sweater', 'hoodie', 'shirt', 'blouse',
        'pants', 'jeans', 'shorts', 'skirt', 'dress', 'gown',
        'shoes', 'boots', 'sneakers', 'sandals', 'heels',
        'bag', 'backpack', 'purse', 'wallet', 'watch', 'glasses', 'hat',
        'phone', 'charger', 'headphones', 'earbuds', 'cable', 'case',
      ];
      
      // 从后往前尝试（最后一个词通常是核心产品类型）
      for (let i = englishWords.length - 1; i >= 0 && result.list.length === 0; i--) {
        const word = englishWords[i];
        if (coreProductWords.includes(word)) {
          logger.info({ word }, 'Trying core English product word');
          result = await this.searchProducts({ query: word, pageNo, pageSize, lang });
          if (result.list.length > 0) {
            logger.info({ word, count: result.list.length }, 'English keyword search succeeded');
            return result;
          }
        }
      }
    }
    
    // 如果所有策略都失败了，返回空结果
    logger.warn({ 
      queryOriginal, 
      queryEn 
    }, 'Bilingual search found no results');
    
    return result;
  }

  /**
   * Batch get product details with concurrency control
   */
  async batchGetProductInfo(
    ids: (string | number)[],
    options: {
      concurrency?: number;
      lang?: string;
      onProgress?: (completed: number, total: number) => void;
    } = {}
  ): Promise<Map<string, XOOBAYProductDetail | null>> {
    const { concurrency = 5, lang = this.lang, onProgress } = options;
    const results = new Map<string, XOOBAYProductDetail | null>();
    
    let completed = 0;
    const total = ids.length;

    // Process in batches
    for (let i = 0; i < ids.length; i += concurrency) {
      const batch = ids.slice(i, i + concurrency);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (id) => {
          try {
            const product = await this.getProductInfo(id, lang);
            return { id: String(id), product };
          } catch (error) {
            logger.warn({ id, error: String(error) }, 'Failed to get product info');
            return { id: String(id), product: null };
          }
        })
      );

      for (const result of batchResults) {
        completed++;
        if (result.status === 'fulfilled') {
          results.set(result.value.id, result.value.product);
        }
        if (onProgress) {
          onProgress(completed, total);
        }
      }

      // Rate limiting between batches
      if (i + concurrency < ids.length) {
        await sleep(200);
      }
    }

    return results;
  }

  /**
   * Get all products with pagination using /api-geo/product-search
   */
  async getAllProducts(options: {
    query?: string;
    maxPages?: number;
    pageSize?: number;
    lang?: string;
    onPage?: (page: number, products: XOOBAYSearchProduct[]) => void;
  } = {}): Promise<XOOBAYSearchProduct[]> {
    const { query = '', maxPages = 100, pageSize = 20, lang = this.lang, onPage } = options;
    const allProducts: XOOBAYSearchProduct[] = [];
    
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      try {
        const result = await this.searchProducts({ query, pageNo: page, pageSize, lang });
        
        if (!result.list || result.list.length === 0) {
          hasMore = false;
          break;
        }

        allProducts.push(...result.list);
        
        if (onPage) {
          onPage(page, result.list);
        }

        // Check if there are more pages based on total count
        const totalPages = Math.ceil(result.total / result.limit);
        hasMore = page < totalPages;
        page++;

        // Rate limiting
        await sleep(200);
      } catch (error) {
        logger.error({ page, error: String(error) }, 'Failed to get product page');
        
        // If circuit is open, stop pagination
        if (this.circuitBreaker.getState() === 'OPEN') {
          break;
        }
        
        // Skip failed page and continue
        page++;
      }
    }

    logger.info({ 
      totalProducts: allProducts.length,
      pagesProcessed: page - 1,
    }, 'Finished getting all products');

    return allProducts;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitStatus(): {
    state: CircuitState;
    canExecute: boolean;
  } {
    return {
      state: this.circuitBreaker.getState(),
      canExecute: this.circuitBreaker.canExecute(),
    };
  }

  /**
   * Reset circuit breaker
   */
  resetCircuit(): void {
    this.circuitBreaker.reset();
    logger.info('Circuit breaker manually reset');
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let clientInstance: XOOBAYClient | null = null;

export function getXOOBAYClient(): XOOBAYClient {
  if (!clientInstance) {
    clientInstance = new XOOBAYClient();
  }
  return clientInstance;
}

/**
 * Reset client instance (for testing)
 */
export function resetXOOBAYClient(): void {
  if (clientInstance) {
    clientInstance.clearCache();
    clientInstance.resetCircuit();
  }
  clientInstance = null;
}

// Export types for use in other modules
export type { 
  XOOBAYSearchProduct, 
  XOOBAYProductSearchResponse,
  XOOBAYProductDetail,
  XOOBAYStore,
};
