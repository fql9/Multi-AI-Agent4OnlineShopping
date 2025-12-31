/**
 * XOOBAY 产品数据同步脚本
 * 
 * 从 XOOBAY API 同步产品数据到数据库
 */

import { XOOBAYClient } from '../apps/tool-gateway/src/services/xoobay.js';
import { query } from '../packages/common/src/db.js';

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
}

/**
 * 将 XOOBAY 产品转换为数据库格式
 */
function convertToOffer(xoobayProduct: XOOBAYProductDetail) {
  return {
    id: `xoobay_${xoobayProduct.id}`,
    spu_id: `spu_${xoobayProduct.id}`,
    merchant_id: `merchant_${xoobayProduct.store_id}`,
    category_id: mapCategory(xoobayProduct.category),
    title_en: xoobayProduct.name,
    title_zh: xoobayProduct.name, // 可以调用中文 API 获取
    brand_name: xoobayProduct.brand_name || 'XOOBAY',
    brand_id: `brand_${xoobayProduct.brand_name?.toLowerCase().replace(/\s+/g, '_') || 'xoobay'}`,
    base_price: parseFloat(xoobayProduct.price),
    currency: 'USD',
    attributes: {
      description: xoobayProduct.description,
      short_description: xoobayProduct.short_description,
      image_url: xoobayProduct.image_url,
      gallery_images: xoobayProduct.gallery_images,
      category: xoobayProduct.category,
      store_name: xoobayProduct.store_name,
    },
    weight_g: 0, // XOOBAY API 没有提供，需要估算或设为默认值
    dimensions_mm: { l: 0, w: 0, h: 0 },
    risk_tags: [],
    certifications: [],
    return_policy: {},
    warranty_months: 0,
    rating: 0,
    reviews_count: 0,
  };
}

/**
 * 分类映射（XOOBAY 分类 → 项目分类）
 */
function mapCategory(xoobayCategory: string): string {
  const categoryMap: Record<string, string> = {
    'Cosmetics': 'cat_cosmetics',
    'Electronics': 'cat_electronics',
    'Clothing': 'cat_clothing',
    'Toys': 'cat_toys',
    // 添加更多映射
  };
  
  return categoryMap[xoobayCategory] || 'cat_other';
}

/**
 * 同步产品到数据库
 */
async function syncProduct(xoobayProduct: XOOBAYProductDetail) {
  const offer = convertToOffer(xoobayProduct);

  // 检查产品是否已存在
  const existing = await query(
    `SELECT id FROM agent.offers WHERE id = $1`,
    [offer.id]
  );

  if (existing.length > 0) {
    // 更新现有产品
    await query(
      `UPDATE agent.offers SET
        title_en = $2, title_zh = $3, base_price = $4,
        attributes = $5, updated_at = NOW()
      WHERE id = $1`,
      [offer.id, offer.title_en, offer.title_zh, offer.base_price, offer.attributes]
    );
    console.log(`Updated product: ${offer.id}`);
  } else {
    // 插入新产品
    await query(
      `INSERT INTO agent.offers (
        id, spu_id, merchant_id, category_id,
        title_en, title_zh, brand_name, brand_id,
        base_price, currency, attributes,
        weight_g, dimensions_mm, risk_tags, certifications,
        return_policy, warranty_months, rating, reviews_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )`,
      [
        offer.id, offer.spu_id, offer.merchant_id, offer.category_id,
        offer.title_en, offer.title_zh, offer.brand_name, offer.brand_id,
        offer.base_price, offer.currency, JSON.stringify(offer.attributes),
        offer.weight_g, JSON.stringify(offer.dimensions_mm),
        offer.risk_tags, offer.certifications,
        JSON.stringify(offer.return_policy), offer.warranty_months,
        offer.rating, offer.reviews_count
      ]
    );
    console.log(`Inserted product: ${offer.id}`);
  }

  // 创建默认 SKU
  const skuId = `sku_${xoobayProduct.id}`;
  const existingSku = await query(
    `SELECT id FROM agent.skus WHERE id = $1`,
    [skuId]
  );

  if (existingSku.length === 0) {
    await query(
      `INSERT INTO agent.skus (id, offer_id, options, price, currency, stock)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        skuId,
        offer.id,
        JSON.stringify({}),
        offer.base_price,
        offer.currency,
        100 // 默认库存
      ]
    );
  }
}

/**
 * 主同步函数
 */
async function syncProducts(maxPages = 10) {
  const client = new XOOBAYClient();
  let totalSynced = 0;

  console.log('🚀 Starting XOOBAY product sync...');

  for (let page = 1; page <= maxPages; page++) {
    console.log(`📦 Fetching page ${page}...`);
    
    try {
      const result = await client.getProductList({ pageNo: page });
      
      if (result.list.length === 0) {
        console.log('No more products to sync');
        break;
      }

      // 同步每个产品
      for (const product of result.list) {
        try {
          const detail = await client.getProductInfo(product.id);
          await syncProduct(detail);
          totalSynced++;
        } catch (error) {
          console.error(`Failed to sync product ${product.id}:`, error);
        }
      }

      console.log(`✅ Synced page ${page}, total: ${totalSynced} products`);
      
      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to fetch page ${page}:`, error);
      break;
    }
  }

  console.log(`✅ Sync completed! Total products synced: ${totalSynced}`);
}

// 运行同步
if (import.meta.url === `file://${process.argv[1]}`) {
  syncProducts(10).catch(console.error);
}

export { syncProducts, convertToOffer };
