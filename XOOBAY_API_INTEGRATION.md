# 🔌 XOOBAY API 集成方案

## 📋 API 文档分析

### API 基本信息

- **基础地址**: `https://www.xoobay.com`
- **API Key**: `xoobay_api_ai_geo` (默认)
- **支持语言**: `zh_cn`, `en`, `zh_hk`, `ru`
- **请求方式**: GET

### 可用接口

1. **产品列表**: `/api-geo/product-list`
   - 支持分页、搜索、店铺过滤
   - 返回产品 ID、名称、价格、图片

2. **产品详情**: `/api-geo/product-info`
   - 返回完整产品信息
   - 包含描述、分类、SKU、图片等

3. **商家详情**: `/api-geo/store-info`
   - 返回店铺信息

## 🎯 集成价值

### 对项目的价值

1. **真实产品数据源**
   - 当前项目从数据库读取产品（可能数据有限）
   - XOOBAY API 提供大量真实产品数据

2. **产品信息完整**
   - 产品名称、描述、价格
   - 产品图片（绝对路径）
   - 品牌信息、店铺信息
   - 分类信息

3. **多语言支持**
   - 支持中文、英文、繁体中文、俄语
   - 适合国际化场景

## 🔧 集成方案

### 方案 1: 数据同步（推荐）

将 XOOBAY API 的产品数据同步到数据库，保持现有架构不变。

**优点**:
- 不改变现有代码结构
- 数据本地化，查询速度快
- 可以添加自定义字段

**实现步骤**:
1. 创建数据同步脚本
2. 定期从 XOOBAY API 拉取产品
3. 转换数据格式并存入数据库
4. 更新现有产品数据

### 方案 2: 直接集成（实时查询）

在 catalog 工具中直接调用 XOOBAY API。

**优点**:
- 数据实时，无需同步
- 产品数据量大

**缺点**:
- 依赖外部 API
- 可能影响响应速度
- 需要处理 API 限流

### 方案 3: 混合模式（最佳）

优先使用数据库，数据库无数据时调用 XOOBAY API。

**优点**:
- 兼顾速度和数据量
- 灵活切换数据源

## 📝 实现建议

### 1. 创建 XOOBAY API 客户端

```typescript
// apps/tool-gateway/src/services/xoobay.ts
export class XOOBAYClient {
  private baseUrl = 'https://www.xoobay.com';
  private apiKey = process.env.XOOBAY_API_KEY || 'xoobay_api_ai_geo';

  async getProductList(params: {
    pageNo?: number;
    name?: string;
    shopId?: string;
    lang?: string;
  }) {
    // 实现产品列表查询
  }

  async getProductInfo(id: string, lang = 'en') {
    // 实现产品详情查询
  }

  async getStoreInfo(id: string, lang = 'en') {
    // 实现商家信息查询
  }
}
```

### 2. 数据转换函数

将 XOOBAY API 数据格式转换为项目内部格式：

```typescript
function convertXOOBAYToOffer(xoobayProduct: XOOBAYProduct): OfferRow {
  return {
    id: `xoobay_${xoobayProduct.id}`,
    title_en: xoobayProduct.name,
    title_zh: xoobayProduct.name, // 如果有中文版本
    base_price: parseFloat(xoobayProduct.price),
    currency: 'USD',
    brand_name: xoobayProduct.brand_name || 'XOOBAY',
    // ... 其他字段映射
  };
}
```

### 3. 集成到 Catalog 工具

在 `catalog.search_offers` 中：
- 先查询数据库
- 如果结果不足，调用 XOOBAY API
- 合并结果返回

## 🚀 快速开始

### 步骤 1: 添加环境变量

在 `.env` 文件中：

```env
# XOOBAY API 配置
XOOBAY_API_KEY=xoobay_api_ai_geo
XOOBAY_BASE_URL=https://www.xoobay.com
XOOBAY_ENABLED=true
XOOBAY_LANG=en
```

### 步骤 2: 安装依赖（如果需要）

```bash
# 如果需要 HTTP 客户端
pnpm add axios
# 或使用 Node.js 内置的 fetch (Node 18+)
```

### 步骤 3: 创建集成代码

参考上面的实现建议创建客户端和集成代码。

## 📊 数据映射

### XOOBAY API → 项目数据库

| XOOBAY 字段 | 项目字段 | 说明 |
|------------|---------|------|
| `id` | `id` | 产品 ID（添加前缀 `xoobay_`） |
| `name` | `title_en` | 产品名称 |
| `description` | `attributes.description` | 产品描述 |
| `price` | `base_price` | 价格 |
| `category` | `category_id` | 分类（需要映射） |
| `image_url` | `attributes.image_url` | 主图 |
| `gallery_images` | `attributes.gallery` | 图库 |
| `brand_name` | `brand_name` | 品牌 |
| `sku` | `skus[0].id` | SKU |
| `store_id` | `merchant_id` | 商家 ID |

## ⚠️ 注意事项

1. **API 限流**: 注意 API 调用频率限制
2. **数据格式**: XOOBAY 返回的价格是字符串，需要转换
3. **图片路径**: 确保图片 URL 是绝对路径
4. **分类映射**: XOOBAY 的分类可能需要映射到项目的分类体系
5. **错误处理**: 需要处理 API 调用失败的情况

## 🎯 推荐实施步骤

1. **第一阶段**: 创建数据同步脚本，手动导入一批产品
2. **第二阶段**: 集成到 catalog 工具，作为补充数据源
3. **第三阶段**: 实现自动同步，定期更新产品数据

## 📚 相关文件

- API 文档: `api-geo.md`
- Catalog 工具: `apps/tool-gateway/src/routes/catalog.ts`
- Catalog MCP: `apps/mcp-servers/core-mcp/src/catalog/index.ts`

---

**结论**: 这个 API **非常有用**，可以作为真实产品数据源，丰富项目的产品库。
