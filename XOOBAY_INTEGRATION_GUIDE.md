# 🔌 XOOBAY API 集成指南

## 📋 API 文档位置

你提供的 API 文档：`api-geo.md`

## ✅ 这个 API 非常有用！

### 为什么有用？

1. **真实产品数据源**
   - 当前项目从数据库读取产品（可能数据有限）
   - XOOBAY API 提供 **47,000+** 真实产品数据
   - 包含完整的产品信息、价格、图片

2. **数据完整性**
   - ✅ 产品名称、描述
   - ✅ 产品价格
   - ✅ 产品图片（绝对路径）
   - ✅ 品牌信息
   - ✅ 店铺信息
   - ✅ 分类信息

3. **多语言支持**
   - 支持 `zh_cn`, `en`, `zh_hk`, `ru`
   - 适合国际化场景

## 🎯 集成方案

我已经创建了集成代码：

### 1. XOOBAY API 客户端

**文件**: `apps/tool-gateway/src/services/xoobay.ts`

提供：
- `getProductList()` - 获取产品列表
- `getProductInfo()` - 获取产品详情
- `getStoreInfo()` - 获取商家信息
- `searchProducts()` - 搜索产品

### 2. 数据同步脚本

**文件**: `scripts/sync-xoobay-products.ts`

功能：
- 从 XOOBAY API 拉取产品
- 转换为项目数据格式
- 同步到数据库

### 3. 集成文档

**文件**: `XOOBAY_API_INTEGRATION.md`

包含：
- 集成方案说明
- 数据映射关系
- 实施步骤

## 🚀 快速开始

### 步骤 1: 配置环境变量

在 `.env` 文件中添加：

```env
# XOOBAY API 配置
XOOBAY_ENABLED=true
XOOBAY_API_KEY=xoobay_api_ai_geo
XOOBAY_BASE_URL=https://www.xoobay.com
XOOBAY_LANG=en
```

### 步骤 2: 测试 API 连接

```typescript
import { getXOOBAYClient } from './apps/tool-gateway/src/services/xoobay.js';

const client = getXOOBAYClient();
const products = await client.getProductList({ pageNo: 1 });
console.log(products);
```

### 步骤 3: 同步产品数据（可选）

```bash
# 运行同步脚本
ts-node scripts/sync-xoobay-products.ts
```

### 步骤 4: 集成到 Catalog 工具

在 `apps/tool-gateway/src/routes/catalog.ts` 中：

```typescript
import { getXOOBAYClient } from '../services/xoobay.js';

// 在 search_offers 中
if (process.env.XOOBAY_ENABLED === 'true') {
  const xoobayClient = getXOOBAYClient();
  const xoobayProducts = await xoobayClient.searchProducts(searchQuery);
  // 合并数据库结果和 XOOBAY 结果
}
```

## 📊 数据映射

| XOOBAY 字段 | 项目字段 | 说明 |
|------------|---------|------|
| `id` | `id` | `xoobay_{id}` |
| `name` | `title_en` | 产品名称 |
| `description` | `attributes.description` | 产品描述 |
| `price` | `base_price` | 价格（需转换） |
| `category` | `category_id` | 分类（需映射） |
| `image_url` | `attributes.image_url` | 主图 |
| `gallery_images` | `attributes.gallery` | 图库 |
| `brand_name` | `brand_name` | 品牌 |
| `store_id` | `merchant_id` | 商家 ID |

## 💡 使用建议

### 方案 A: 数据同步（推荐用于生产）

1. 定期运行同步脚本
2. 将 XOOBAY 产品导入数据库
3. 保持现有查询逻辑不变

**优点**: 查询快，不依赖外部 API

### 方案 B: 实时查询（推荐用于测试）

1. 在 catalog 工具中直接调用 XOOBAY API
2. 实时获取产品数据

**优点**: 数据最新，无需维护

### 方案 C: 混合模式（最佳）

1. 优先查询数据库
2. 如果结果不足，调用 XOOBAY API 补充
3. 可选：将 XOOBAY 结果缓存到数据库

## 🔍 测试 API

### 测试产品列表

```bash
curl "https://www.xoobay.com/api-geo/product-list?pageNo=1&lang=en&apiKey=xoobay_api_ai_geo"
```

### 测试产品详情

```bash
curl "https://www.xoobay.com/api-geo/product-info?id=1088&lang=en&apiKey=xoobay_api_ai_geo"
```

## ⚠️ 注意事项

1. **API 限流**: 注意调用频率，避免被封
2. **数据格式**: 价格是字符串，需要 `parseFloat()`
3. **图片路径**: 确保是绝对路径（API 已提供）
4. **分类映射**: 需要将 XOOBAY 分类映射到项目分类
5. **错误处理**: API 可能失败，需要降级处理

## 📝 下一步

1. **测试 API**: 先测试 API 是否可用
2. **小规模同步**: 同步少量产品测试
3. **集成到 Catalog**: 修改 catalog 工具支持 XOOBAY
4. **生产部署**: 配置自动同步或实时查询

## 📚 相关文件

- API 客户端: `apps/tool-gateway/src/services/xoobay.ts`
- 同步脚本: `scripts/sync-xoobay-products.ts`
- 集成文档: `XOOBAY_API_INTEGRATION.md`
- Catalog 工具: `apps/tool-gateway/src/routes/catalog.ts`

---

**结论**: 这个 API **非常有用**，可以大大丰富项目的产品数据！建议先测试 API 可用性，然后选择适合的集成方案。
