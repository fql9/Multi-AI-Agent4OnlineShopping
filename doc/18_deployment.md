# Docker 部署与环境配置指南

本文档详细说明如何配置和运行 Multi-AI-Agent Shopping System 的 Docker 环境，包含 v0.6 新增的 Rate Limit 配置。

## 1. 快速启动

最简单的启动方式是使用 `docker-compose.full.yml`：

```bash
# 复制环境变量模板
cp .env.example .env
# 编辑 .env 填入 OpenAI Key
# 生产环境强烈建议启用 XOOBAY（否则服务器只有少量 seed 数据时很容易“搜不到商品”）：
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

# XOOBAY（生产环境强烈建议开启：服务器若仅有少量 seed 数据，关闭会导致“搜索很容易为空”）
XOOBAY_ENABLED=true
XOOBAY_API_KEY=your_key
XOOBAY_BASE_URL=https://www.xoobay.com
XOOBAY_LANG=en
```

### Rate Limiting (v0.6 新增)
为了防止前端高频请求（如 Dock 动画加载）触发 429 错误，你可以调整或关闭限流：

```ini
# 是否开启限流 (开发环境建议设为 false)
RATE_LIMIT_ENABLED=true

# 限流阈值 (每窗口最大请求数)
RATE_LIMIT_MAX=1000

# 限流窗口 (时间单位)
RATE_LIMIT_WINDOW="1 minute"
```

### 端口映射
如果默认端口被占用，可修改以下变量：
```ini
POSTGRES_PORT=5433
REDIS_PORT=6379
TOOL_GATEWAY_PORT=3000
CORE_MCP_PORT=3010
CHECKOUT_MCP_PORT=3011
WEB_APP_PORT=3001
AGENT_PORT=8000
```

### 外部集成 (XOOBAY)
> 已整合到上方“核心配置”中，避免部署时遗漏。这里不再重复维护。

## 3. 服务说明

| 服务名 | 容器名 | 端口 | 依赖 | 说明 |
|--------|--------|------|------|------|
| **postgres** | agent-postgres | 5433 | - | 核心数据库，带 pgvector 扩展 |
| **redis** | agent-redis | 6379 | - | 缓存与限流存储 |
| **tool-gateway** | agent-tool-gateway | 3000 | DB, Redis | 统一 API 网关，处理鉴权与限流 |
| **core-mcp** | agent-core-mcp | 3010 | DB, Redis | 核心业务工具 (Catalog, Compliance) |
| **checkout-mcp** | agent-checkout-mcp | 3011 | DB, Redis | 交易相关工具 (Cart, Checkout) |
| **agent** | agent-python | 8000 | Gateway | LangGraph 智能体编排服务 |
| **web-app** | agent-web-app | 3001 | Gateway | Next.js 前端界面 |

## 4. 常用运维命令

> 本文档只保留“部署相关”的最小命令与参数说明；所有运维/排障/数据库检查命令统一收敛到：[`19_ops_runbook.md`](./19_ops_runbook.md)

### 最小常用命令（部署后自检）

```bash
# 查看服务状态（应看到 postgres/redis/tool-gateway/core-mcp/checkout-mcp/agent/web-app）
docker compose -f docker-compose.full.yml ps

# 查看网关健康
curl -fsS http://localhost:3000/health && echo

# 确认 XOOBAY 已启用（重要）
docker exec agent-tool-gateway env | grep -E '^XOOBAY_ENABLED=|^XOOBAY_BASE_URL=|^XOOBAY_API_KEY=' || true
```

## 5. 常见问题排查

### Q: 前端加载图片慢或显示 429 错误？
**A:** 请检查 `RATE_LIMIT_ENABLED` 是否为 `true`。开发环境下，Dock 组件会并发请求多个图片，建议在 `.env` 中设置 `RATE_LIMIT_ENABLED=false` 或调高 `RATE_LIMIT_MAX`。

### Q: 数据库连接失败？
**A:** 检查端口 `5433` 是否被占用。如果修改了 `POSTGRES_PORT`，请确保所有服务（Gateway, Agent）的环境变量都已对应更新（Docker Compose 会自动处理容器间通信，但本地调试需注意端口）。

### Q: Agent 报错 "Connection refused"？
**A:** Agent 依赖 `tool-gateway`。先确保 `tool-gateway` 处于 `healthy` 状态：
```bash
docker compose -f docker-compose.full.yml ps tool-gateway
```

更完整排障清单：[`19_ops_runbook.md`](./19_ops_runbook.md)
