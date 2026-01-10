# Docker 部署与环境配置指南

本文档详细说明如何配置和运行 Multi-AI-Agent Shopping System 的 Docker 环境，包含 v0.6 新增的 Rate Limit 配置。

## 1. 快速启动

最简单的启动方式是使用 `docker-compose.full.yml`：

```bash
# 复制环境变量模板
cp .env.example .env
# 编辑 .env 填入 OpenAI Key
# 生产环境强烈建议启用 XOOBAY（否则数据库为空/数据量不足时很容易“搜不到商品”）：
#   XOOBAY_ENABLED=true
#   XOOBAY_API_KEY=your_key
#   XOOBAY_BASE_URL=https://www.xoobay.com

# 启动（后台运行）
docker compose -f docker-compose.full.yml up -d
```

## 2. 环境变量配置

在 `.env` 文件中，你可以配置以下关键参数：

### 核心配置
```ini
OPENAI_API_KEY=sk-...           # 必填：OpenAI API Key
APP_ENV=production              # 环境模式
LOG_LEVEL=info                  # 日志级别 (debug/info/warn/error)

# XOOBAY（生产环境强烈建议开启：数据库为空/数据量不足时，关闭会导致“搜索很容易为空”）
XOOBAY_ENABLED=true
XOOBAY_API_KEY=your_key
XOOBAY_BASE_URL=https://www.xoobay.com
XOOBAY_LANG=en
```

### Rate Limiting (v0.6 新增)

⚠️ **重要警告**：Rate Limiting 会影响 `/health` 健康检查端点！如果阈值设置过低，Docker 健康检查会被 429 拦截，导致容器状态显示 unhealthy。

#### 开发环境（推荐）
```ini
# 关闭限流，避免 /health 健康检查被 429 干扰
APP_ENV=development
RATE_LIMIT_ENABLED=false
LOG_LEVEL=debug
```

#### 生产环境（推荐）
```ini
# 开启限流保护服务，但阈值要足够高
# 需要覆盖：监控探针 + 负载均衡健康检查 + 正常用户请求峰值
APP_ENV=production
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=60000
LOG_LEVEL=info
```

> 💡 **提示**：如果生产环境需要限流但 `/health` 总被 429，有两个选择：
> 1. 提高 `RATE_LIMIT_MAX`（推荐先尝试）
> 2. 修改 `tool-gateway` 代码给 `/health` 加白名单（需要改代码）

### 端口映射
如果默认端口被占用，可修改以下变量：
```ini
POSTGRES_PORT=25432
REDIS_PORT=26379
TOOL_GATEWAY_PORT=28000
CORE_MCP_PORT=28001
CHECKOUT_MCP_PORT=28002
WEB_APP_PORT=28004
AGENT_PORT=28003
```

### 外部集成 (XOOBAY)
> 已整合到上方“核心配置”中，避免部署时遗漏。这里不再重复维护。

## 3. 服务说明

| 服务名 | 容器名 | 端口 | 依赖 | 说明 |
|--------|--------|------|------|------|
| **postgres** | agent-postgres | 25432 | - | 核心数据库，带 pgvector 扩展 |
| **redis** | agent-redis | 26379 | - | 缓存与限流存储 |
| **tool-gateway** | agent-tool-gateway | 28000 | DB, Redis | 统一 API 网关，处理鉴权与限流 |
| **core-mcp** | agent-core-mcp | 28001 | DB, Redis | 核心业务工具 (Catalog, Compliance) |
| **checkout-mcp** | agent-checkout-mcp | 28002 | DB, Redis | 交易相关工具 (Cart, Checkout) |
| **agent** | agent-python | 28003 | Gateway | LangGraph 智能体编排服务 |
| **web-app** | agent-web-app | 28004 | Gateway | Next.js 前端界面 |

> **数据库迁移保证**  
> `docker-compose.full.yml` 内置了 `db-migrate` 一次性服务，`docker compose ... up` 时会自动在 Postgres 就绪后执行全部 SQL 迁移（幂等）。  
> 如果是 **已有数据卷** 升级到新版（可能缺少新表/字段），请手动执行：  
> `docker compose -f docker-compose.full.yml run --rm db-migrate`

## 4. 常用运维命令

> 本文档只保留“部署相关”的最小命令与参数说明；所有运维/排障/数据库检查命令统一收敛到：[`19_ops_runbook.md`](./19_ops_runbook.md)

### 最小常用命令（部署后自检）

```bash
# 查看服务状态（应看到 postgres/redis/tool-gateway/core-mcp/checkout-mcp/agent/web-app）
docker compose -f docker-compose.full.yml ps

# 查看网关健康
curl -fsS http://localhost:28000/health && echo

# 确认 XOOBAY 已启用（重要）
docker exec agent-tool-gateway env | grep -E '^XOOBAY_ENABLED=|^XOOBAY_BASE_URL=|^XOOBAY_API_KEY=' || true
```

## 5. 常见问题排查

### Q: Docker 健康检查失败 / 容器状态 unhealthy？
**A:** 很可能是 Rate Limiting 把 `/health` 也算进去了。解决方案：

```bash
# 1. 检查限流配置
docker exec agent-tool-gateway env | grep RATE_LIMIT

# 2. 开发环境：关闭限流
# 在 .env 中设置：
RATE_LIMIT_ENABLED=false

# 3. 生产环境：提高阈值
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=1000

# 4. 重启服务
docker compose -f docker-compose.full.yml restart tool-gateway
```

### Q: 前端加载图片慢或显示 429 错误？
**A:** Rate Limiting 阈值过低。开发环境下，Dock 组件会并发请求多个图片，建议：
- 开发环境：`RATE_LIMIT_ENABLED=false`
- 生产环境：`RATE_LIMIT_MAX=1000` 或更高

### Q: 数据库连接失败？
**A:** 检查端口 `25432` 是否被占用。如果修改了 `POSTGRES_PORT`，请确保所有服务（Gateway, Agent）的环境变量都已对应更新（Docker Compose 会自动处理容器间通信，但本地调试需注意端口）。

### Q: Agent 报错 "Connection refused"？
**A:** Agent 依赖 `tool-gateway`。先确保 `tool-gateway` 处于 `healthy` 状态：
```bash
docker compose -f docker-compose.full.yml ps tool-gateway
```

更完整排障清单：[`19_ops_runbook.md`](./19_ops_runbook.md)
