# 运维 Runbook（命令手册）

> 适用场景：已在服务器上完成 Docker 部署（推荐 `docker-compose.full.yml`）。
>
> 约定：以下命令默认在仓库根目录执行，且已准备好 `.env`（参考 `.env.example`）。

---

## 0. 快速定位（我现在要做什么？）

- **启动全套服务**：
  - `docker compose -f docker-compose.full.yml up -d`
- **看服务状态**：
  - `docker compose -f docker-compose.full.yml ps`
- **看日志（全量）**：
  - `docker compose -f docker-compose.full.yml logs -f`
- **健康检查**：
  - Tool Gateway：`curl -fsS http://localhost:3000/health`
  - Core MCP：`curl -fsS http://localhost:3010/health`
  - Checkout MCP：`curl -fsS http://localhost:3011/health`
  - Python Agent：`curl -fsS http://localhost:8000/health`
- **进数据库排查**（容器内 psql，不依赖宿主机安装）：
  - `docker exec -it agent-postgres psql -U agent -d agent_db`

---

## 1. ⭐ 数据迁移 / 导入 / 同步（重点：数据库必须是真实数据）

> **重要原则**：本项目不再提供/使用任何“种子数据（seed）”。生产数据库必须通过 **真实数据源同步**（如 XOOBAY）或你的自有商家/ERP feed 导入。

### 1.1 首次部署（或重建数据库）推荐流程

```bash
# 0) 确认 XOOBAY 已启用（生产强烈建议开启，否则 DB 为空时将完全无商品可搜）
docker exec agent-tool-gateway env | grep -E '^XOOBAY_ENABLED=|^XOOBAY_BASE_URL=|^XOOBAY_API_KEY=' || true

# 1) 启动基础依赖
docker compose -f docker-compose.full.yml up -d postgres redis

# 2) 跑迁移（让表结构与代码一致）
docker compose -f docker-compose.full.yml --profile migrate up db-migrate

# 3) 启动业务服务
docker compose -f docker-compose.full.yml up -d core-mcp checkout-mcp tool-gateway agent web-app

# 4) 同步真实商品数据（XOOBAY → PostgreSQL）
# 推荐用 run --rm：一次性任务跑完即退出
docker compose -f docker-compose.full.yml --profile sync run --rm xoobay-sync
```

### 1.2 验收：确认“确实有真实数据”

```bash
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT
  (SELECT COUNT(*) FROM agent.categories) AS categories,
  (SELECT COUNT(*) FROM agent.offers) AS offers,
  (SELECT COUNT(*) FROM agent.skus) AS skus,
  (SELECT COUNT(*) FROM agent.evidence_chunks) AS evidence_chunks;"
```

### 1.3 可选：数据增强（从真实数据派生品牌/商家/KG/风险画像）

> 该脚本不会注入“样例商品”，只会基于现有真实 offers 派生/补全字段。

```bash
docker exec -i agent-postgres psql -U agent -d agent_db < scripts/enhance-database-data.sql
```

---

## 2. 约定与关键参数（默认值）

### 1.1 关键容器名（来自 `docker-compose.full.yml`）

- `agent-postgres`
- `agent-redis`
- `agent-tool-gateway`
- `agent-core-mcp`
- `agent-checkout-mcp`
- `agent-python`
- `agent-web-app`
- 可选工具：
  - `agent-adminer`
  - `agent-redis-commander`

### 1.2 默认端口（可通过 `.env` 覆盖）

- PostgreSQL：宿主机 `POSTGRES_PORT`（默认 5433）→ 容器 5432
- Redis：宿主机 `REDIS_PORT`（默认 6379）→ 容器 6379
- Tool Gateway：`TOOL_GATEWAY_PORT`（默认 3000）
- Core MCP：`CORE_MCP_PORT`（默认 3010）
- Checkout MCP：`CHECKOUT_MCP_PORT`（默认 3011）
- Web App：`WEB_APP_PORT`（默认 3001）
- Python Agent：`AGENT_PORT`（默认 8000）

---

## 3. 服务生命周期（Start / Stop / Restart）

### 2.1 启动/停止全套服务

```bash
# 启动（后台）
docker compose -f docker-compose.full.yml up -d

# 查看状态
docker compose -f docker-compose.full.yml ps

# 停止（保留数据卷）
docker compose -f docker-compose.full.yml down

# 停止并删除数据卷（⚠️ 会清空 PostgreSQL/Redis 数据）
docker compose -f docker-compose.full.yml down -v
```

### 2.2 重启单个服务

```bash
docker compose -f docker-compose.full.yml restart tool-gateway
docker compose -f docker-compose.full.yml restart agent
docker compose -f docker-compose.full.yml restart web-app
```

### 2.3 只启动/停止某几个服务

```bash
docker compose -f docker-compose.full.yml up -d postgres redis
docker compose -f docker-compose.full.yml up -d tool-gateway core-mcp checkout-mcp
docker compose -f docker-compose.full.yml up -d agent web-app
```

---

## 4. 日志与运行态诊断

### 3.1 查看日志

```bash
# 全量（跟随）
docker compose -f docker-compose.full.yml logs -f

# 单服务（跟随）
docker compose -f docker-compose.full.yml logs -f tool-gateway
docker compose -f docker-compose.full.yml logs -f agent
docker compose -f docker-compose.full.yml logs -f web-app

# 只看最近 N 行
docker compose -f docker-compose.full.yml logs --tail 200 tool-gateway
```

### 3.2 容器层面排查

```bash
# 列出本项目相关容器
docker ps --filter "name=agent-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 资源占用
docker stats --no-stream

# 进入容器（交互式 shell）
docker exec -it agent-tool-gateway sh
docker exec -it agent-python sh
```

---

## 5. 健康检查（Healthcheck / 端口连通）

### 4.1 HTTP 健康检查

```bash
curl -fsS http://localhost:3000/health && echo
curl -fsS http://localhost:3010/health && echo
curl -fsS http://localhost:3011/health && echo
curl -fsS http://localhost:8000/health && echo
```

### 4.2 PostgreSQL / Redis 健康检查（容器内）

```bash
docker exec -it agent-postgres pg_isready -U agent -d agent_db
docker exec -it agent-redis redis-cli -a redis_dev_password ping
```

> 如果你在 `.env` 修改了 Redis 密码，请同步替换 `redis_dev_password`。

---

## 6. 数据库运维（PostgreSQL）

### 5.1 进入 psql（容器内）

```bash
docker exec -it agent-postgres psql -U agent -d agent_db
```

### 5.2 常用 psql 命令

```sql
-- schema / tables
\dn
\dt agent.*

-- table schema
\d agent.offers
\d agent.skus
\d agent.carts
\d agent.draft_orders
\d agent.evidence_snapshots
\d agent.evidence_chunks

-- quick counts
SELECT
  (SELECT COUNT(*) FROM agent.offers) AS offers,
  (SELECT COUNT(*) FROM agent.skus) AS skus,
  (SELECT COUNT(*) FROM agent.carts) AS carts,
  (SELECT COUNT(*) FROM agent.draft_orders) AS draft_orders,
  (SELECT COUNT(*) FROM agent.evidence_snapshots) AS evidence_snapshots,
  (SELECT COUNT(*) FROM agent.evidence_chunks) AS evidence_chunks;
```

### 5.3 常用查询（命令行一把梭）

```bash
# 列表/表结构
docker exec -it agent-postgres psql -U agent -d agent_db -c "\dt agent.*"

# 近期草稿订单
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT id, user_id, status, payable_amount, currency, expires_at, created_at
FROM agent.draft_orders
ORDER BY created_at DESC
LIMIT 20;"
```

### 5.4 产品数据检查（Offers / SKUs / Categories / Brands / Merchants）

> 以下命令均可直接在服务器上执行；不需要本机安装 psql（走容器内 `psql`）。

#### 5.4.1 产品数据总览（行数/更新时间）

```bash
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT
  (SELECT COUNT(*) FROM agent.categories) AS categories,
  (SELECT COUNT(*) FROM agent.offers) AS offers,
  (SELECT COUNT(*) FROM agent.skus) AS skus,
  (SELECT COUNT(*) FROM agent.brands) AS brands,
  (SELECT COUNT(*) FROM agent.merchants) AS merchants;
"
```

```bash
# 最近更新的商品（看同步是否“真的在跑”）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT id, title_en, brand_name, currency, base_price, updated_at
FROM agent.offers
ORDER BY updated_at DESC NULLS LAST
LIMIT 20;"
```

#### 5.4.2 Offers 完整性与异常（标题/价格/类目/风险标签）

```bash
# 标题缺失、价格缺失、类目缺失的统计
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT
  SUM(CASE WHEN COALESCE(title_en, '') = '' AND COALESCE(title_zh, '') = '' THEN 1 ELSE 0 END) AS missing_title,
  SUM(CASE WHEN base_price IS NULL OR base_price <= 0 THEN 1 ELSE 0 END) AS missing_or_nonpositive_price,
  SUM(CASE WHEN category_id IS NULL OR category_id = '' THEN 1 ELSE 0 END) AS missing_category
FROM agent.offers;"
```

```bash
# 类目引用不存在（orphan category_id）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT COUNT(*) AS orphan_offer_category_refs
FROM agent.offers o
LEFT JOIN agent.categories c ON c.id = o.category_id
WHERE o.category_id IS NOT NULL AND c.id IS NULL;"
```

```bash
# 价格分布（粗看异常：超低/超高）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT
  MIN(base_price) AS min_price,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY base_price) AS p50_price,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY base_price) AS p95_price,
  MAX(base_price) AS max_price
FROM agent.offers
WHERE base_price IS NOT NULL;"
```

```bash
# 风险标签覆盖（哪些风险最常见）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT tag, COUNT(*) AS offers_count
FROM (
  SELECT unnest(COALESCE(risk_tags, '{}'::text[])) AS tag
  FROM agent.offers
) t
WHERE tag IS NOT NULL AND tag <> ''
GROUP BY tag
ORDER BY offers_count DESC
LIMIT 30;"
```

#### 5.4.3 SKUs 完整性与异常（价格/库存/外键）

```bash
# SKU 外键引用不存在（orphan offer_id）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT COUNT(*) AS orphan_sku_offer_refs
FROM agent.skus s
LEFT JOIN agent.offers o ON o.id = s.offer_id
WHERE s.offer_id IS NOT NULL AND o.id IS NULL;"
```

```bash
# SKU 价格缺失/异常、库存异常
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT
  SUM(CASE WHEN price IS NULL OR price <= 0 THEN 1 ELSE 0 END) AS missing_or_nonpositive_price,
  SUM(CASE WHEN stock IS NULL THEN 1 ELSE 0 END) AS missing_stock,
  SUM(CASE WHEN stock < 0 THEN 1 ELSE 0 END) AS negative_stock
FROM agent.skus;"
```

```bash
# 每个 offer 的 SKU 数量分布（找“没有 SKU”的商品）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT
  SUM(CASE WHEN sku_count = 0 THEN 1 ELSE 0 END) AS offers_without_skus,
  SUM(CASE WHEN sku_count = 1 THEN 1 ELSE 0 END) AS offers_with_1_sku,
  SUM(CASE WHEN sku_count BETWEEN 2 AND 5 THEN 1 ELSE 0 END) AS offers_with_2_5_skus,
  SUM(CASE WHEN sku_count > 5 THEN 1 ELSE 0 END) AS offers_with_gt5_skus
FROM (
  SELECT o.id, COUNT(s.id) AS sku_count
  FROM agent.offers o
  LEFT JOIN agent.skus s ON s.offer_id = o.id
  GROUP BY o.id
) x;"
```

#### 5.4.4 类目数据检查（层级/覆盖）

```bash
# 类目层级分布
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT level, COUNT(*) AS categories
FROM agent.categories
GROUP BY level
ORDER BY level;"
```

```bash
# 商品在类目上的覆盖（Top 类目）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT c.id, c.name_en, COUNT(o.id) AS offers
FROM agent.categories c
JOIN agent.offers o ON o.category_id = c.id
GROUP BY c.id, c.name_en
ORDER BY offers DESC
LIMIT 30;"
```

#### 5.4.5 品牌/商家聚合（用于发现脏数据/空值）

```bash
# brand_name 为空的商品占比
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT
  COUNT(*) FILTER (WHERE COALESCE(brand_name, '') = '') AS missing_brand_name,
  COUNT(*) AS total_offers
FROM agent.offers;"
```

```bash
# Top 品牌（按商品数）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT COALESCE(NULLIF(brand_name, ''), '(empty)') AS brand_name, COUNT(*) AS offers
FROM agent.offers
GROUP BY COALESCE(NULLIF(brand_name, ''), '(empty)')
ORDER BY offers DESC
LIMIT 30;"
```

```bash
# 商家分布（merchant_id 字段如为空，先用此确认数据情况）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT COALESCE(NULLIF(merchant_id, ''), '(empty)') AS merchant_id, COUNT(*) AS offers
FROM agent.offers
GROUP BY COALESCE(NULLIF(merchant_id, ''), '(empty)')
ORDER BY offers DESC
LIMIT 30;"
```

#### 5.4.6 RAG/证据块检查（embedding/来源）

```bash
# evidence_chunks 来源分布
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT source_type, COUNT(*) AS chunks
FROM agent.evidence_chunks
GROUP BY source_type
ORDER BY chunks DESC;"
```

```bash
# embedding 缺失统计（向量索引/语义检索依赖）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT
  COUNT(*) FILTER (WHERE embedding IS NULL) AS missing_embedding,
  COUNT(*) AS total_chunks
FROM agent.evidence_chunks;"
```

```bash
# 近期 evidence_chunks（看索引/同步是否在持续产出）
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT id, source_type, offer_id, language, created_at
FROM agent.evidence_chunks
ORDER BY created_at DESC
LIMIT 20;"
```

### 6.4 迁移、同步（compose profiles）

```bash
# 数据库迁移（profile: migrate）
docker compose -f docker-compose.full.yml --profile migrate up db-migrate

# XOOBAY 产品同步（profile: sync）
docker compose -f docker-compose.full.yml --profile sync run --rm xoobay-sync
```

### 5.5 备份与恢复

```bash
# 备份（导出到当前目录）
docker exec agent-postgres pg_dump -U agent agent_db > backup.sql

# 恢复（⚠️ 会执行 SQL，注意环境）
docker exec -i agent-postgres psql -U agent agent_db < backup.sql
```

---

## 6. Redis 运维

```bash
# 进入 redis-cli（容器内）
docker exec -it agent-redis redis-cli -a redis_dev_password
```

```redis
PING
INFO
DBSIZE
CLIENT LIST
```

危险命令（谨慎）：

```redis
FLUSHALL
```

---

## 7. 运维辅助工具（可选）

```bash
# 启动 Adminer + Redis Commander
docker compose -f docker-compose.full.yml --profile tools up -d

# 关闭（只关闭工具容器）
docker compose -f docker-compose.full.yml stop adminer redis-commander
```

访问地址（按需改为服务器域名/内网 IP）：

- Adminer：`http://localhost:8080`
- Redis Commander：`http://localhost:8081`

---

## 8. 常见排障套路（Checklist）

### 8.1 “前端/Agent 报连接失败”

```bash
docker compose -f docker-compose.full.yml ps
docker compose -f docker-compose.full.yml logs --tail 200 tool-gateway
curl -fsS http://localhost:3000/health && echo
```

### 9.2 “数据库连接失败/迁移失败”

```bash
docker exec -it agent-postgres pg_isready -U agent -d agent_db
docker compose -f docker-compose.full.yml logs --tail 200 postgres
docker compose -f docker-compose.full.yml --profile migrate up db-migrate
```

### 8.3 “429/限流导致前端异常”

```bash
# 检查网关限流配置
docker exec -it agent-tool-gateway env | grep RATE_LIMIT
```

> 开发/演示环境建议 `RATE_LIMIT_ENABLED=false` 或调大 `RATE_LIMIT_MAX`。

### 9.4 “搜不到商品/搜索结果为空（No products found）”

现象常见分两类：

- **A. `query` 为空能返回，但自然语言整句搜索返回空**  
  典型：`"wireless charger iphone 15, budget $50, ship to US"` 这种输入包含预算/国家等噪声，若后端只做 `ILIKE '%整句%'` 会很难命中。
- **B. 不管怎么搜都为空**  
  多数是 **数据库无商品数据** 或 **XOOBAY 关闭/不可用**。

#### 8.4.1 先确认链路与服务健康

```bash
curl -fsS http://localhost:3000/health && echo
docker ps --filter "name=agent-tool-gateway" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs --tail 200 agent-tool-gateway | grep -iE 'error|invalid|search|xoobay' || true
```

#### 8.4.2 用 curl 直接验证 `catalog.search_offers`（注意 request_id 必须是 UUID）

> `request_id` **必须是 UUID**；如果你随便写 `debug`，会收到 `INVALID_ARGUMENT`。

```bash
# 1) 空 query（如果 DB 有数据，一般会返回若干 offer_ids）
curl -sS http://localhost:3000/tools/catalog/search_offers \
  -H 'content-type: application/json' \
  -d '{"request_id":"11111111-1111-1111-1111-111111111111","actor":{"type":"user","id":"ops"},"client":{"app":"ops","version":"1"},"params":{"query":"","limit":10}}' | cat

echo

# 2) 短关键词（例如 charger）
curl -sS http://localhost:3000/tools/catalog/search_offers \
  -H 'content-type: application/json' \
  -d '{"request_id":"22222222-2222-2222-2222-222222222222","actor":{"type":"user","id":"ops"},"client":{"app":"ops","version":"1"},"params":{"query":"charger","limit":10}}' | cat

echo

# 3) 自然语言整句（含预算/国家等信息）
curl -sS http://localhost:3000/tools/catalog/search_offers \
  -H 'content-type: application/json' \
  -d '{"request_id":"33333333-3333-3333-3333-333333333333","actor":{"type":"user","id":"ops"},"client":{"app":"ops","version":"1"},"params":{"query":"wireless charger iphone 15, budget $50, ship to US","limit":10}}' | cat
```

判读：

- 若 (1) 有结果、(2) 有结果、但 (3) 为 0：  
  - **升级 tool-gateway 到最新版本**（新版本会对自然语言做 token 化去噪匹配），或前端把预算/国家拆到 filters 中。  
- 若 (1)(2)(3) 都为 0：继续看 8.4.3 与 8.4.4。

#### 8.4.3 数据库是否有商品数据

```bash
docker exec -it agent-postgres psql -U agent -d agent_db -c "SELECT COUNT(*) AS offers FROM agent.offers;"
docker exec -it agent-postgres psql -U agent -d agent_db -c "SELECT COUNT(*) AS skus FROM agent.skus;"
```

若 `offers=0`：需要跑迁移/同步真实数据（见 **1** 或 **6.4**）。

#### 8.4.4 XOOBAY 是否启用（用于补充结果）

> 截图里这种情况：`XOOBAY_ENABLED=false`，当 DB 匹配不到时就会“真的搜不到”。

```bash
docker exec agent-tool-gateway env | grep -E '^XOOBAY_ENABLED=|^XOOBAY_BASE_URL=|^XOOBAY_API_KEY=' || true
```

如需启用：在 `.env` / compose 环境里设置：

- `XOOBAY_ENABLED=true`
- `XOOBAY_BASE_URL=https://www.xoobay.com`
- `XOOBAY_API_KEY=...`（如不设置，代码会使用默认 key；但生产建议显式配置）

---

## 9. 清理与回收（谨慎）

```bash
# 删除停止的容器、无用网络（不会删除数据卷）
docker system prune -f

# 查看数据卷
docker volume ls | grep pgdata || true
docker volume ls | grep redisdata || true
```

> 如需“彻底清库”，用 `docker compose -f docker-compose.full.yml down -v`（会删除 `pgdata/redisdata`）。


