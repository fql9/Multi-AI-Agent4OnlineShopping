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
- Tool Gateway：`curl -fsS http://localhost:28000/health`
- Core MCP：`curl -fsS http://localhost:28001/health`
- Checkout MCP：`curl -fsS http://localhost:28002/health`
- Python Agent：`curl -fsS http://localhost:28003/health`
- **进数据库排查**（容器内 psql，不依赖宿主机安装）：
  - `docker exec -it agent-postgres psql -U agent -d agent_db`

---

## 1. ⭐ 数据迁移 / 导入 / 同步

### 1.1 首次部署（或重建数据库）推荐流程

```bash
# 0) 确认 XOOBAY 已启用（默认开启，确保商品搜索正常工作）
docker exec agent-tool-gateway env | grep -E '^XOOBAY_ENABLED=|^XOOBAY_BASE_URL=|^XOOBAY_API_KEY=' || true

# 1) 启动基础依赖（含自动迁移）
docker compose -f docker-compose.full.yml up -d postgres redis db-migrate

# 2) 启动业务服务（db-migrate 幂等，已跑完会直接退出）
docker compose -f docker-compose.full.yml up -d core-mcp checkout-mcp tool-gateway agent web-app

# 3) 同步真实商品数据（XOOBAY → PostgreSQL）
# 推荐用 run --rm：一次性任务跑完即退出（前台会显示同步进度条）
docker compose -f docker-compose.full.yml --profile sync run --rm xoobay-sync
```

### 1.1.1 迁移会显示什么“进度”？

迁移容器会按文件逐个输出：

- `Waiting for PostgreSQL...`
- `Running migrations...`
- `Applying: /migrations/001_xxx.sql`
- `Applying: /migrations/002_xxx.sql`
- `Migrations completed successfully!`

如需追日志：

```bash
docker compose -f docker-compose.full.yml logs -f db-migrate
```

> ⚠️ 已有数据卷从旧版本升级：请先执行一次  
> `docker compose -f docker-compose.full.yml run --rm db-migrate`  
> 确保新表（如 `agent.kg_relations`）创建到位，避免 Gateway/Agent 查询 500。

### 1.1.2 XOOBAY 同步（重点）：进度显示、导入数量、断点续传

#### A) 前台运行（推荐：能实时看到进度条）

```bash
docker compose -f docker-compose.full.yml --profile sync run --rm xoobay-sync
```

> 同步脚本会打印类似：`Progress: 37/100 pages (37%) | 740 products | ETA: 120s`

#### B) 控制“导入多少数据”（按 page 控制，约 20 products/page）

你可以通过环境变量控制导入规模（不改 compose 文件）。**注意：必须使用 `run -e` 把变量传进容器**，因为这些参数是在容器内 shell 里解析的（不是 docker compose 在宿主机侧展开）。

```bash
# 导入 100 pages ≈ 2000 商品（默认）
docker compose -f docker-compose.full.yml --profile sync run --rm \
  -e XOOBAY_SYNC_PAGES=100 \
  xoobay-sync

# 导入 500 pages ≈ 10000 商品
docker compose -f docker-compose.full.yml --profile sync run --rm \
  -e XOOBAY_SYNC_PAGES=500 \
  xoobay-sync

# 更快：提升并发（上限建议 12；视服务器与 XOOBAY 限流情况调整）
docker compose -f docker-compose.full.yml --profile sync run --rm \
  -e XOOBAY_SYNC_PAGES=500 \
  -e XOOBAY_SYNC_CONCURRENCY=10 \
  xoobay-sync
```

可选参数（均为可选）：

- `XOOBAY_SYNC_PAGES`：结束页（默认 100）
- `XOOBAY_SYNC_START_PAGE`：起始页（默认 1）
- `XOOBAY_SYNC_CONCURRENCY`：并发 worker 数（默认 6）
- `XOOBAY_SYNC_LANG`：同步语言（默认沿用 `XOOBAY_LANG`）
- `XOOBAY_SYNC_KEEP_EXISTING`：是否保留已有 xoobay 数据（默认 false，默认会先清空再同步）

#### C) 断点续传/继续导入（“检查上一次进度并继续”）

同步脚本本身不会自动持久化“最后页号”，推荐的运维方式是：

1) **保留同步容器日志**（不要 `--rm`），方便回看中断点  
2) 从日志里找出“最后一次看到的页数”，然后用 `START_PAGE + KEEP_EXISTING` 继续

**方式 1：不删除容器，便于查看日志（推荐用于长时间同步）**

```bash
# 启动同步（后台跑）
docker compose -f docker-compose.full.yml --profile sync up -d xoobay-sync

# 跟随日志（可看到进度输出）
docker logs -f agent-xoobay-sync
```

**方式 2：从日志里找“上次大概跑到哪”**

```bash
docker logs --tail 3000 agent-xoobay-sync | grep -Eo 'Progress: [0-9]+/[0-9]+' | tail -n 1 || true
```

**方式 3：继续从下一段页码开始（关键：必须 KEEP_EXISTING=true，否则会先清空）**

```bash
# 示例：假设上次跑到 500/1000，想从 501 继续跑到 1000
docker compose -f docker-compose.full.yml --profile sync run --rm \
  -e XOOBAY_SYNC_START_PAGE=501 \
  -e XOOBAY_SYNC_PAGES=1000 \
  -e XOOBAY_SYNC_KEEP_EXISTING=true \
  xoobay-sync
```

> 提醒：如果你把 `XOOBAY_SYNC_KEEP_EXISTING` 留空或设为 false，同步会先删除已有 `xoobay_%` 数据再重建（适合“全量重刷”，不适合续跑）。

#### D) 同步过程中监控“已入库多少”

```bash
# 仅统计 XOOBAY 数据
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT
  (SELECT COUNT(*) FROM agent.offers WHERE id LIKE 'xoobay_%') AS xoobay_offers,
  (SELECT COUNT(*) FROM agent.skus WHERE offer_id LIKE 'xoobay_%') AS xoobay_skus,
  (SELECT COUNT(*) FROM agent.evidence_chunks WHERE offer_id LIKE 'xoobay_%') AS xoobay_chunks;"
```

#### E) “上一次同步是否成功 / 何时同步的？”

```bash
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT
  COUNT(*) AS xoobay_offers,
  MAX(updated_at) AS last_offer_updated_at
FROM agent.offers
WHERE id LIKE 'xoobay_%';"
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

- PostgreSQL：宿主机 `POSTGRES_PORT`（默认 25432）→ 容器 5432
- Redis：宿主机 `REDIS_PORT`（默认 26379）→ 容器 6379
- Tool Gateway：`TOOL_GATEWAY_PORT`（默认 28000）
- Core MCP：`CORE_MCP_PORT`（默认 28001）
- Checkout MCP：`CHECKOUT_MCP_PORT`（默认 28002）
- Web App：`WEB_APP_PORT`（默认 28004）
- Python Agent：`AGENT_PORT`（默认 28003）

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
curl -fsS http://localhost:28000/health && echo
curl -fsS http://localhost:28001/health && echo
curl -fsS http://localhost:28002/health && echo
curl -fsS http://localhost:28003/health && echo
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
# 数据库迁移（幂等；用于旧数据卷升级/补齐新表）
docker compose -f docker-compose.full.yml run --rm db-migrate

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

- Adminer：`http://localhost:28080`
- Redis Commander：`http://localhost:28081`

---

## 8. 常见排障套路（Checklist）

### 8.1 “前端/Agent 报连接失败”

```bash
docker compose -f docker-compose.full.yml ps
docker compose -f docker-compose.full.yml logs --tail 200 tool-gateway
curl -fsS http://localhost:28000/health && echo
```

### 9.2 “数据库连接失败/迁移失败”

```bash
docker exec -it agent-postgres pg_isready -U agent -d agent_db
docker compose -f docker-compose.full.yml logs --tail 200 postgres
docker compose -f docker-compose.full.yml logs --tail 200 db-migrate
docker compose -f docker-compose.full.yml run --rm db-migrate
```

### 8.3 "429/限流导致前端异常 或 健康检查失败"

⚠️ **重要**：Rate Limiting 会把 `/health` 也算进去！如果阈值过低，Docker 健康检查会被 429 拦截。

```bash
# 1. 检查网关限流配置
docker exec -it agent-tool-gateway env | grep RATE_LIMIT

# 2. 开发/演示环境：关闭限流
# 在 .env 中设置：
#   RATE_LIMIT_ENABLED=false

# 3. 生产环境：提高阈值（需覆盖监控 + LB 健康检查 + 用户请求）
# 在 .env 中设置：
#   RATE_LIMIT_ENABLED=true
#   RATE_LIMIT_MAX=1000

# 4. 修改后重启服务
docker compose -f docker-compose.full.yml restart tool-gateway

# 5. 验证健康检查是否恢复
curl -fsS http://localhost:28000/health && echo
```

> 💡 如果生产环境需要限流但 `/health` 总被 429，可以修改 `tool-gateway` 代码给 `/health` 加白名单。

### 9.4 “搜不到商品/搜索结果为空（No products found）”

现象常见分两类：

- **A. `query` 为空能返回，但自然语言整句搜索返回空**  
  典型：`"wireless charger iphone 15, budget $50, ship to US"` 这种输入包含预算/国家等噪声，若后端只做 `ILIKE '%整句%'` 会很难命中。
- **B. 不管怎么搜都为空**  
  多数是 **数据库无商品数据** 或 **XOOBAY 关闭/不可用**。

#### 8.4.1 先确认链路与服务健康

```bash
curl -fsS http://localhost:28000/health && echo
docker ps --filter "name=agent-tool-gateway" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs --tail 200 agent-tool-gateway | grep -iE 'error|invalid|search|xoobay' || true
```

#### 8.4.2 用 curl 直接验证 `catalog.search_offers`（注意 request_id 必须是 UUID）

> `request_id` **必须是 UUID**；如果你随便写 `debug`，会收到 `INVALID_ARGUMENT`。

```bash
# 1) 空 query（如果 DB 有数据，一般会返回若干 offer_ids）
curl -sS http://localhost:28000/tools/catalog/search_offers \
  -H 'content-type: application/json' \
  -d '{"request_id":"11111111-1111-1111-1111-111111111111","actor":{"type":"user","id":"ops"},"client":{"app":"web","version":"1"},"params":{"query":"","limit":10}}' | cat

echo

# 2) 短关键词（例如 charger）
curl -sS http://localhost:28000/tools/catalog/search_offers \
  -H 'content-type: application/json' \
  -d '{"request_id":"22222222-2222-2222-2222-222222222222","actor":{"type":"user","id":"ops"},"client":{"app":"web","version":"1"},"params":{"query":"charger","limit":10}}' | cat

echo

# 3) 自然语言整句（含预算/国家等信息）
curl -sS http://localhost:28000/tools/catalog/search_offers \
  -H 'content-type: application/json' \
  -d '{"request_id":"33333333-3333-3333-3333-333333333333","actor":{"type":"user","id":"ops"},"client":{"app":"web","version":"1"},"params":{"query":"wireless charger iphone 15, budget $50, ship to US","limit":10}}' | cat
```

判读：

- 若 (1) 有结果、(2) 有结果、但 (3) 为 0：  
  - **升级 tool-gateway 到最新版本**（新版本会对自然语言做 token 化去噪匹配），或前端把预算/国家拆到 filters 中。  
- 若 (1)(2)(3) 都为 0：继续看 8.4.3 与 8.4.4。

#### 8.4.2.1 语言/多语言：中文输入但搜不到（非常常见）

如果你用中文输入（例如“手提包包”）但结果为 0，而英文关键词（例如 `handbag` / `bag`）有结果，通常是因为：

- 数据源同步的语言是英文（`XOOBAY_LANG=en`），数据库中的 `title_zh` 可能为空或内容仍为英文；
- 检索是基于标题/描述的匹配，中文很难命中英文数据。

运维/运营处理建议：

- **短期**：引导用户用英文关键词（或在前端做 query 翻译/同义词扩展）。
- **中期（推荐）**：将同步语言切到中文并重刷数据：
  - 在 `.env` 设置 `XOOBAY_LANG=zh`
  - 重新跑同步（可配合 `XOOBAY_SYNC_LANG`）
  - 重新验收：中文关键词是否能命中（以及 `agent.offers.title_zh` 是否真的包含中文）

#### 8.4.3 数据库是否有商品数据

```bash
docker exec -it agent-postgres psql -U agent -d agent_db -c "SELECT COUNT(*) AS offers FROM agent.offers;"
docker exec -it agent-postgres psql -U agent -d agent_db -c "SELECT COUNT(*) AS skus FROM agent.skus;"
```

若 `offers=0`：需要跑迁移/同步真实数据（见 **1** 或 **6.4**）。

#### 8.4.4 XOOBAY 是否启用（用于补充结果）

> 默认已开启 `XOOBAY_ENABLED=true`。如被手动关闭，当 DB 匹配不到时就会"真的搜不到"。

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


