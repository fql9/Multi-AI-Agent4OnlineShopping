# 18｜部署指南

> 本文档详细说明 Multi-AI-Agent Shopping System 的完整部署流程。

---

## 目录

1. [系统要求](#系统要求)
2. [快速开始](#快速开始)
3. [服务架构](#服务架构)
4. [环境配置](#环境配置)
5. [部署模式](#部署模式)
6. [服务详解](#服务详解)
7. [数据管理](#数据管理)
8. [监控与日志](#监控与日志)
9. [故障排除](#故障排除)
10. [生产部署](#生产部署)

---

## 系统要求

### 硬件要求

| 环境 | CPU | 内存 | 磁盘 |
|------|-----|------|------|
| 开发环境 | 2 核 | 4 GB | 20 GB |
| 测试环境 | 4 核 | 8 GB | 50 GB |
| 生产环境 | 8 核+ | 16 GB+ | 100 GB+ SSD |

### 软件要求

| 软件 | 最低版本 | 推荐版本 |
|------|----------|----------|
| Docker | 24.0 | 25.0+ |
| Docker Compose | 2.20 | 2.24+ |
| Node.js | 20.0 | 20 LTS |
| Python | 3.11 | 3.11+ |
| pnpm | 8.0 | 9.0+ |

### 端口要求

| 服务 | 端口 | 用途 |
|------|------|------|
| PostgreSQL | 5433 | 数据库 |
| Redis | 6379 | 缓存 |
| Tool Gateway | 3000 | API 网关 |
| Core MCP | 3010 | 核心工具服务 (SSE) |
| Checkout MCP | 3011 | 结算工具服务 (SSE) |
| Web App | 3001 | 前端界面 |
| Agent | 8000 | Python Agent API |
| Adminer | 8080 | 数据库管理 (可选) |
| Redis Commander | 8081 | Redis 管理 (可选) |

---

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/fql9/Multi-AI-Agent4OnlineShopping.git
cd Multi-AI-Agent4OnlineShopping
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，设置必要的配置
# 必须设置 OPENAI_API_KEY
nano .env
```

### 3. 启动所有服务

```bash
# 开发环境 - 启动核心服务
docker compose -f docker-compose.full.yml up -d

# 查看服务状态
docker compose -f docker-compose.full.yml ps

# 查看日志
docker compose -f docker-compose.full.yml logs -f
```

### 4. 验证部署

```bash
# 检查所有服务健康状态
curl http://localhost:3000/health  # Tool Gateway
curl http://localhost:3010/health  # Core MCP
curl http://localhost:3011/health  # Checkout MCP
curl http://localhost:8000/health  # Python Agent
curl http://localhost:3001         # Web App

# 测试 API
curl -X POST http://localhost:3000/tools/catalog/search_offers \
  -H 'Content-Type: application/json' \
  -d '{
    "request_id": "test-001",
    "actor": {"type": "user", "id": "test-user"},
    "client": {"app": "web", "version": "1.0.0"},
    "params": {"query": "laptop", "limit": 5}
  }'
```

### 5. 访问前端

打开浏览器访问：**http://localhost:3001**

---

## 服务架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户界面层                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Web App (Next.js)                        │ │
│  │                    http://localhost:3001                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Agent 编排层                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │               Python Agent (LangGraph + FastAPI)            │ │
│  │                    http://localhost:8000                    │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │ │
│  │  │ Intent │→│Candidate│→│Verifier│→│  Plan  │→│Execute │   │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘   │ │
│  │                    ↘ Compliance ↗      ↘ Payment ↗         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         工具网关层                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                Tool Gateway (Fastify)                       │ │
│  │                    http://localhost:3000                    │ │
│  │         Envelope | Idempotency | Rate Limit | Audit        │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
┌───────────────────────────┐   ┌───────────────────────────────┐
│        MCP 工具层           │   │           MCP 工具层           │
│  ┌─────────────────────┐  │   │  ┌─────────────────────────┐  │
│  │     Core MCP        │  │   │  │     Checkout MCP        │  │
│  │  :3010 (SSE)        │  │   │  │     :3011 (SSE)         │  │
│  │  • Catalog          │  │   │  │  • Cart                 │  │
│  │  • Pricing          │  │   │  │  • Checkout             │  │
│  │  • Shipping         │  │   │  │  • Evidence             │  │
│  │  • Compliance       │  │   │  │  • Payment              │  │
│  │  • Knowledge        │  │   │  └─────────────────────────┘  │
│  └─────────────────────┘  │   └───────────────────────────────┘
└───────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         数据存储层                                │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │   PostgreSQL + pgvector │  │          Redis              │  │
│  │        :5433            │  │          :6379              │  │
│  │  • 业务数据              │  │  • 会话缓存                   │  │
│  │  • 向量索引              │  │  • 幂等性检查                 │  │
│  │  • 证据快照              │  │  • 速率限制                   │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 环境配置

### 必需配置

```bash
# OpenAI API (必须设置)
OPENAI_API_KEY=sk-your-api-key-here
```

### 完整配置说明

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| **数据库** |||
| `POSTGRES_USER` | agent | PostgreSQL 用户名 |
| `POSTGRES_PASSWORD` | agent_dev_password | PostgreSQL 密码 |
| `POSTGRES_DB` | agent_db | 数据库名 |
| `POSTGRES_PORT` | 5433 | 外部访问端口 |
| **Redis** |||
| `REDIS_PASSWORD` | redis_dev_password | Redis 密码 |
| `REDIS_PORT` | 6379 | Redis 端口 |
| **LLM** |||
| `OPENAI_API_KEY` | - | OpenAI API 密钥 (必需) |
| `OPENAI_BASE_URL` | https://api.openai.com/v1 | API 基础 URL |
| `OPENAI_MODEL_PLANNER` | gpt-4o-mini | 规划模型 |
| `OPENAI_MODEL_VERIFIER` | gpt-4o | 验证模型 |
| **Token 预算** |||
| `TOKEN_BUDGET_TOTAL` | 50000 | 每会话总 Token |
| `TOKEN_BUDGET_PER_STEP` | 5000 | 每步骤 Token |
| **XOOBAY** |||
| `XOOBAY_ENABLED` | false | 启用 XOOBAY API |
| `XOOBAY_API_KEY` | - | XOOBAY API 密钥 |
| **功能** |||
| `MOCK_TOOLS` | false | 使用模拟工具 |
| `ENABLE_RAG` | true | 启用 RAG 检索 |
| `LOG_LEVEL` | info | 日志级别 |

---

## 部署模式

### 模式 1: 开发环境 (默认)

启动核心服务：

```bash
docker compose -f docker-compose.full.yml up -d
```

服务列表：
- ✅ PostgreSQL
- ✅ Redis
- ✅ Tool Gateway
- ✅ Core MCP
- ✅ Checkout MCP
- ✅ Web App
- ✅ Python Agent

### 模式 2: 带管理工具

启动核心服务 + 数据库/缓存管理界面：

```bash
docker compose -f docker-compose.full.yml --profile tools up -d
```

额外服务：
- ✅ Adminer (http://localhost:8080) - 数据库管理
- ✅ Redis Commander (http://localhost:8081) - Redis 管理

### 模式 3: 仅数据库

只启动数据存储服务（用于本地开发）：

```bash
docker compose -f docker-compose.full.yml up -d postgres redis
```

然后本地运行应用：

```bash
# 安装依赖
pnpm install

# 启动 Tool Gateway
pnpm --filter @shopping-agent/tool-gateway dev

# 启动 Web App
pnpm --filter @shopping-agent/web-app dev
```

### 模式 4: 运行数据库迁移

```bash
docker compose -f docker-compose.full.yml --profile migrate up db-migrate
```

### 模式 5: 导入种子数据

```bash
docker compose -f docker-compose.full.yml --profile seed up seed-data
```

### 模式 6: XOOBAY 产品同步

```bash
# 设置 XOOBAY_API_KEY 后
docker compose -f docker-compose.full.yml --profile sync up xoobay-sync
```

> ⚠️ **务必导入足够多的商品数据**：生产/演示环境至少需要跑完一次 `seed-data`，并通过 `xoobay-sync` 同步真实商品（建议覆盖上万商品与 SKU），否则候选商品不足会导致 Candidate/Plan 阶段无法给出理想的方案。

---

## 服务详解

### PostgreSQL (pgvector)

**功能**:
- 存储业务数据（用户、订单、商品等）
- pgvector 扩展支持向量搜索（RAG）
- 全文搜索索引

**数据表**:

| 表名 | 用途 |
|------|------|
| `agent.users` | 用户信息 |
| `agent.missions` | 购物任务 |
| `agent.offers` | 商品信息 |
| `agent.skus` | SKU 变体 |
| `agent.carts` | 购物车 |
| `agent.draft_orders` | 草稿订单 |
| `agent.evidence_snapshots` | 证据快照 |
| `agent.evidence_chunks` | RAG 证据块 |
| `agent.compliance_rules` | 合规规则 |
| `agent.xoobay_sync_log` | XOOBAY 同步日志 |

**连接信息**:
```
Host: localhost
Port: 5433
User: agent
Password: agent_dev_password
Database: agent_db
```

### Redis

**功能**:
- 会话缓存
- 幂等性检查（请求去重）
- 速率限制
- 临时数据存储

**连接信息**:
```
Host: localhost
Port: 6379
Password: redis_dev_password
```

### Tool Gateway

**功能**:
- 统一 API 入口
- 请求验证（Envelope 格式）
- 幂等性保证
- 速率限制
- 审计日志

**API 端点**: `/tools/{domain}/{action}`

| 域 | 工具 |
|----|------|
| catalog | search_offers, get_offer_card, get_availability |
| pricing | get_realtime_quote, check_price_change |
| shipping | validate_address, quote_options, get_delivery_estimate |
| compliance | check_item, get_rules_for_category |
| checkout | create_cart, add_to_cart, compute_total, create_draft_order |
| evidence | create_snapshot, attach_to_draft_order, get_snapshot |
| knowledge | search, get_chunk, index_product, sync_xoobay |

### Python Agent

**功能**:
- LangGraph 状态机编排
- 多 Agent 协作
- LLM 调用管理
- 会话持久化

**HTTP 端点**:

| 端点 | 方法 | 功能 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/` | GET | 服务信息 |
| `/api/v1/chat` | POST | 运行 Agent |
| `/api/v1/sessions` | GET/POST | 会话管理 |
| `/api/v1/sessions/{id}` | GET/DELETE | 会话详情/删除 |

**Agent 节点**:

```
Intent → Candidate → Verifier → Plan → Execute
                  ↘ Compliance ↗     ↘ Payment ↗
```

### MCP 服务 (SSE 模式)

**Core MCP** (端口 3010):
- Catalog 工具
- Pricing 工具
- Shipping 工具
- Compliance 工具
- Knowledge 工具 (RAG)

**Checkout MCP** (端口 3011):
- Cart 工具
- Checkout 工具
- Evidence 工具
- Payment 工具

**SSE 端点**:
```
GET /sse - SSE 连接
POST /message - MCP 消息
GET /health - 健康检查
```

---

## 数据管理

### 初始化数据

数据库初始化时会自动导入：

1. `init-db.sql` - 表结构创建
2. `seed-data.sql` - 种子数据（类目、规则、示例商品）
3. `migrations/*.sql` - 数据库迁移

### 手动导入数据

```bash
# 进入 PostgreSQL 容器
docker exec -it agent-postgres psql -U agent -d agent_db

# 或使用 Adminer (http://localhost:8080)
```

### 备份数据

```bash
# 备份数据库
docker exec agent-postgres pg_dump -U agent agent_db > backup.sql

# 恢复数据库
docker exec -i agent-postgres psql -U agent agent_db < backup.sql
```

### 清理数据

```bash
# 停止服务并删除数据卷
docker compose -f docker-compose.full.yml down -v

# 重新启动
docker compose -f docker-compose.full.yml up -d
```

---

## 监控与日志

### 查看日志

```bash
# 所有服务日志
docker compose -f docker-compose.full.yml logs -f

# 特定服务日志
docker compose -f docker-compose.full.yml logs -f tool-gateway
docker compose -f docker-compose.full.yml logs -f agent

# 最近 100 行
docker compose -f docker-compose.full.yml logs --tail=100 web-app
```

### 健康检查

```bash
# 检查所有服务状态
docker compose -f docker-compose.full.yml ps

# 检查特定服务健康
docker inspect --format='{{.State.Health.Status}}' agent-tool-gateway
docker inspect --format='{{.State.Health.Status}}' agent-python
docker inspect --format='{{.State.Health.Status}}' agent-core-mcp
docker inspect --format='{{.State.Health.Status}}' agent-checkout-mcp
```

### 资源监控

```bash
# 查看容器资源使用
docker stats

# 查看特定容器
docker stats agent-postgres agent-redis
```

---

## 故障排除

### 常见问题

#### 1. 端口冲突

```bash
# 检查端口占用
lsof -i :3000
lsof -i :5433

# 解决方案：修改 .env 中的端口配置
POSTGRES_PORT=5434
TOOL_GATEWAY_PORT=3002
```

#### 2. 数据库连接失败

```bash
# 检查数据库容器状态
docker compose -f docker-compose.full.yml logs postgres

# 检查数据库是否就绪
docker exec agent-postgres pg_isready -U agent -d agent_db

# 重启数据库
docker compose -f docker-compose.full.yml restart postgres
```

#### 3. 服务启动失败

```bash
# 查看详细日志
docker compose -f docker-compose.full.yml logs --tail=200 <service-name>

# 重新构建镜像
docker compose -f docker-compose.full.yml build --no-cache <service-name>

# 重启服务
docker compose -f docker-compose.full.yml restart <service-name>
```

#### 4. OpenAI API 错误

```bash
# 检查 API Key 是否设置
echo $OPENAI_API_KEY

# 检查网络连接
curl -I https://api.openai.com

# 查看 Agent 日志
docker compose -f docker-compose.full.yml logs agent
```

#### 5. 内存不足

```bash
# 检查内存使用
docker stats --no-stream

# 限制容器内存
# 在 docker-compose.full.yml 中添加：
# deploy:
#   resources:
#     limits:
#       memory: 512M
```

#### 6. MCP 服务重启

如果 MCP 服务不断重启，检查：
- 健康检查 URL 是否正确 (应使用 `127.0.0.1` 而非 `localhost`)
- 数据库连接是否正常
- 端口是否被占用

```bash
# 查看 MCP 服务日志
docker compose -f docker-compose.full.yml logs core-mcp
docker compose -f docker-compose.full.yml logs checkout-mcp

# 验证健康检查
docker exec agent-core-mcp wget --no-verbose --tries=1 --spider http://127.0.0.1:3010/health
docker exec agent-checkout-mcp wget --no-verbose --tries=1 --spider http://127.0.0.1:3011/health
```

### 重置环境

```bash
# 完全重置（删除所有数据）
docker compose -f docker-compose.full.yml down -v
docker system prune -f
docker compose -f docker-compose.full.yml up -d --build
```

---

## 生产部署

### 安全配置

1. **更改默认密码**:

```bash
# .env
POSTGRES_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>
```

2. **限制网络访问**:

```yaml
# docker-compose.full.yml
ports:
  - "127.0.0.1:5433:5432"  # 只允许本地访问
```

3. **启用 HTTPS**:

使用反向代理（Nginx/Traefik）处理 TLS 终止。

### 高可用配置

1. **数据库主从**:

```yaml
# 添加 PostgreSQL 从库
postgres-replica:
  image: pgvector/pgvector:pg16
  environment:
    POSTGRES_REPLICATION_MODE: slave
    POSTGRES_MASTER_HOST: postgres
```

2. **Redis 集群**:

```yaml
# 使用 Redis Sentinel 或 Cluster
redis-sentinel:
  image: redis:7-alpine
  command: redis-sentinel /etc/redis/sentinel.conf
```

### Kubernetes 部署

项目包含 Helm Chart（待添加），支持：

- 自动扩缩容 (HPA)
- 服务发现
- 配置管理 (ConfigMap/Secret)
- 持久化存储 (PVC)

---

## 命令速查

| 操作 | 命令 |
|------|------|
| 启动所有服务 | `docker compose -f docker-compose.full.yml up -d` |
| 停止所有服务 | `docker compose -f docker-compose.full.yml down` |
| 查看状态 | `docker compose -f docker-compose.full.yml ps` |
| 查看日志 | `docker compose -f docker-compose.full.yml logs -f` |
| 重启服务 | `docker compose -f docker-compose.full.yml restart <service>` |
| 重新构建 | `docker compose -f docker-compose.full.yml build --no-cache` |
| 清理数据 | `docker compose -f docker-compose.full.yml down -v` |
| 运行迁移 | `docker compose -f docker-compose.full.yml --profile migrate up db-migrate` |
| 导入种子数据 | `docker compose -f docker-compose.full.yml --profile seed up seed-data` |
| 启动管理工具 | `docker compose -f docker-compose.full.yml --profile tools up -d` |
| XOOBAY 同步 | `docker compose -f docker-compose.full.yml --profile sync up xoobay-sync` |

---

## 更新日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-01-02 | v1.1 | 添加 Agent HTTP 端点、MCP SSE 模式说明、新部署模式 |
| 2026-01-02 | v1.0 | 初始文档创建 |
