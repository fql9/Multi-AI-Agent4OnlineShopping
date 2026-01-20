# 21｜XOOBAY 集成（配置、测试、同步）

本文档收敛 XOOBAY 相关说明，避免根目录多份 `XOOBAY_*.md` 重复维护。

---

## ✅ 当前集成能力（概览）

- **搜索补充**：当 DB 结果不足或开启 XOOBAY 时，从 XOOBAY API 补充召回并合并去重
- **详情实时拉取**：当 `offer_id` 以 `xoobay_` 开头且 DB 无该商品时，实时调用 XOOBAY 获取详情并转换为 AROC
- **可选同步**：支持将 XOOBAY 商品批量同步到 PostgreSQL（用于 RAG/KG/离线增强）

---

## 🔌 XOOBAY API 基本信息

- **基础地址**：`https://www.xoobay.com`
- **认证方式**：`apiKey` query 参数（环境变量 `XOOBAY_API_KEY`）
- **语言**：`lang` query 参数（环境变量 `XOOBAY_LANG`，如 `en` / `zh_cn`）

常见接口：

- 产品列表：`/api-geo/product-list`
- 产品详情：`/api-geo/product-info`
- 店铺信息：`/api-geo/store-info`
-（Gateway 侧还使用）产品搜索：`/api-geo/product-search`

---

## 🔧 配置位置（Docker / 本地）

### 1) Docker（推荐）

1. 复制环境变量模板：
   - 开发：`cp .env.example .env`
   - 生产：`cp env.prod.example .env`

2. 在根目录 `.env` 设置（示例）：

```ini
XOOBAY_ENABLED=true
XOOBAY_API_KEY=your_xoobay_api_key
XOOBAY_BASE_URL=https://www.xoobay.com
XOOBAY_LANG=en
```

> 默认已开启 `XOOBAY_ENABLED=true`，确保商品搜索正常工作。

### 2) 本地私有说明（不入库）

若你有公司内部获取 Key / SLA / 限流规则等信息，请放到 `private_docs/`（已在 `.gitignore` 中忽略）：  
`private_docs/XOOBAY_API_GUIDE.md`

---

## 🧪 快速测试

### 1) 测试 XOOBAY API 可达性（直连）

```bash
curl -fsS "https://www.xoobay.com/api-geo/product-list?pageNo=1&lang=en&apiKey=xoobay_api_ai_geo" | head
```

### 2) 测试 Tool Gateway 是否启用 XOOBAY

```bash
docker exec agent-tool-gateway env | grep -E '^XOOBAY_ENABLED=|^XOOBAY_BASE_URL=|^XOOBAY_API_KEY=' || true
```

### 3) 通过 Tool Gateway 调用搜索（HTTP）

```bash
curl -fsS "http://localhost:28000/health" && echo
curl -fsS -X POST "http://localhost:28000/tools/catalog/search_offers" \
  -H "Content-Type: application/json" \
  -d '{
    "request_id":"test",
    "actor":{"type":"user","id":"u1"},
    "client":{"app":"cli","version":"1.0.0"},
    "params":{"query":"phone","limit":10}
  }' | head
```

PowerShell 示例请看：`doc/quick_start_windows.md`

---

## 🔄 可选：批量同步（XOOBAY → PostgreSQL）

权威命令以 `doc/19_ops_runbook.md` 的 "XOOBAY 同步" 一节为准。核心入口：

```bash
docker compose -f docker-compose.full.yml --profile sync run --rm xoobay-sync
```

同步参数（环境变量）：

- `XOOBAY_SYNC_PAGES`
- `XOOBAY_SYNC_START_PAGE`
- `XOOBAY_SYNC_CONCURRENCY`
- `XOOBAY_SYNC_LANG`
- `XOOBAY_SYNC_KEEP_EXISTING`

---

## 🔍 日志与排障

- 查看 Gateway 中 XOOBAY 调用日志：

```bash
docker logs agent-tool-gateway | grep -i xoobay || true
```

- 若遇到 `/health` 频繁 429 或容器 unhealthy，优先排查 Rate Limit 配置：`doc/18_deployment.md` / `doc/19_ops_runbook.md`
