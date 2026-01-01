/**
 * 测试 XOOBAY API 连接
 */

import { getXOOBAYClient } from '../apps/tool-gateway/src/services/xoobay.js';

async function testXOOBAYAPI() {
  console.log('🧪 Testing XOOBAY API...\n');

  const client = getXOOBAYClient();

  try {
    // 测试 1: 获取产品列表
    console.log('📦 Test 1: Get product list...');
    const productList = await client.getProductList({ pageNo: 1, lang: 'en' });
    console.log(`✅ Success! Found ${productList.list.length} products`);
    console.log(`   Total products: ${productList.pager.count}`);
    console.log(`   Total pages: ${productList.pager.pageCount}\n`);

    if (productList.list.length > 0) {
      const firstProduct = productList.list[0];
      console.log(`   First product: ${firstProduct.name} (ID: ${firstProduct.id}, Price: $${firstProduct.money})`);

      // 测试 2: 获取产品详情
      console.log('\n📋 Test 2: Get product detail...');
      const productDetail = await client.getProductInfo(firstProduct.id, 'en');
      console.log(`✅ Success! Product: ${productDetail.name}`);
      console.log(`   Price: $${productDetail.price}`);
      console.log(`   Category: ${productDetail.category}`);
      console.log(`   Brand: ${productDetail.brand_name}`);
      console.log(`   Image: ${productDetail.image_url}`);

      // 测试 3: 搜索产品
      if (productDetail.category) {
        console.log(`\n🔍 Test 3: Search products by category "${productDetail.category}"...`);
        const searchResults = await client.searchProducts(productDetail.category, 1, 'en');
        console.log(`✅ Success! Found ${searchResults.list.length} products`);
      }
    }

    console.log('\n✅ All tests passed! XOOBAY API is working correctly.');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
    }
    process.exit(1);
  }
}

// 运行测试
testXOOBAYAPI().catch(console.error);
