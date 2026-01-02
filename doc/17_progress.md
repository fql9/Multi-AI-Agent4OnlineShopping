# 17｜开发进度追踪

> 本文档记录项目的开发进度、已完成功能、待办事项。

---

## 当前版本

**v0.5.0** (2026-01-02) - 全服务 Docker 部署完成

---

## 进度总览

```
████████████████████████████████████████████ 100%
```

| 模块 | 进度 | 状态 |
|------|------|------|
| 基础设施 | 100% | ✅ 完成 |
| 工具层 | 100% | ✅ 完成 |
| Agent 层 | 100% | ✅ 完成 |
| RAG 检索 | 100% | ✅ 完成 |
| Docker 部署 | 100% | ✅ 完成 |
| 前端 | 85% | ✅ Demo 可用 |
| 支付集成 | 80% | ✅ Agent 完成 |

---

## 已完成功能

### 🗄️ 基础设施

| 功能 | 描述 | 文件 |
|------|------|------|
| Docker 完整环境 | 10 服务一键部署 | `docker-compose.full.yml` |
| PostgreSQL 16 + pgvector | 向量数据库 + 全文搜索 | `infra/docker/init-db.sql` |
| Redis 7 | 缓存 + 会话 + 幂等性 | `docker-compose.full.yml` |
| 数据库表结构 | 11 张表 + RAG 增强 | `infra/docker/migrations/` |
| 数据库连接池 | pg 连接管理 + 事务支持 | `packages/common/src/db.ts` |
| 种子数据 | 12 类目 + 6 规则 + 14 商品 + 22 SKU | `infra/docker/seed-data.sql` |
| CI/CD | GitHub Actions 自动构建测试 | `.github/workflows/ci.yml` |
| 环境配置 | 完整环境变量模板 | `.env.example` |
| 部署文档 | 完整部署指南 | `doc/18_deployment.md` |

### 🐳 Docker 服务

| 服务 | 端口 | 功能 | 状态 |
|------|------|------|------|
| PostgreSQL | 5433 | 向量数据库 | ✅ healthy |
| Redis | 6379 | 缓存服务 | ✅ healthy |
| Tool Gateway | 3000 | API 网关 | ✅ healthy |
| Core MCP | 3010 | 核心工具 (SSE) | ✅ healthy |
| Checkout MCP | 3011 | 结算工具 (SSE) | ✅ healthy |
| Web App | 3001 | 前端界面 | ✅ healthy |
| Python Agent | 8000 | LangGraph 编排 | ✅ healthy |
| DB Migrate | - | 数据库迁移 | ✅ profile: migrate |
| Seed Data | - | 种子数据导入 | ✅ profile: seed |
| XOOBAY Sync | - | 产品同步 | ✅ profile: sync |

### 🔧 工具层（23 个端点）

| 域 | 工具 | 功能 |
|----|------|------|
| **Catalog** | `search_offers` | 关键词/类目/价格搜索 |
| | `get_offer_card` | AROC 完整商品卡 |
| | `get_availability` | SKU 库存状态 |
| **Pricing** | `get_realtime_quote` | 实时报价 + 批量折扣 |
| | `check_price_change` | 价格变动检测 |
| **Shipping** | `validate_address` | 地址验证 + 标准化 |
| | `quote_options` | 运输选项报价 |
| | `get_delivery_estimate` | 送达时间估算 |
| **Compliance** | `check_item` | 合规检查 + 认证要求 |
| | `get_rules_for_category` | 类目规则查询 |
| **Checkout** | `create_cart` | 创建购物车 |
| | `add_to_cart` | 添加商品 |
| | `compute_total` | 计算总价（含税运） |
| | `create_draft_order` | 草稿订单（幂等） |
| | `get_draft_order_summary` | 订单摘要 |
| **Evidence** | `create_snapshot` | 证据快照 |
| | `attach_to_draft_order` | 绑定证据 |
| | `get_snapshot` | 获取快照 |
| | `list_snapshots` | 快照列表 |
| **Knowledge** | `search` | 混合 RAG 检索（BM25 + 向量） |
| | `get_chunk` | 获取证据块 + 引用 |
| | `index_product` | 产品内容索引 |
| | `sync_xoobay` | XOOBAY 产品批量同步 |

### 🐍 Python Agent

| 组件 | 描述 | 文件 |
|------|------|------|
| 配置管理 | Pydantic Settings | `agents/src/config.py` |
| 数据模型 | Mission / DraftOrder / Evidence | `agents/src/models/` |
| LangGraph 状态 | AgentState TypedDict | `agents/src/graph/state.py` |
| 状态机构建 | 节点定义 + 边 + 路由 | `agents/src/graph/builder.py` |
| Intent 节点 | 意图解析 → MissionSpec | `agents/src/intent/node.py` |
| Candidate 节点 | 商品召回 | `agents/src/candidate/node.py` |
| Verifier 节点 | 实时核验 | `agents/src/verifier/node.py` |
| Plan 节点 | 方案生成 | `agents/src/execution/plan_node.py` |
| Execution 节点 | 草稿订单创建 | `agents/src/execution/execution_node.py` |
| Compliance 节点 | 合规深度分析 | `agents/src/compliance/node.py` |
| Payment 节点 | 支付准备 | `agents/src/execution/payment_node.py` |
| 工具封装 | 调用 Tool Gateway | `agents/src/tools/` |
| HTTP Server | FastAPI 服务端点 | `agents/src/server.py` |

### 🤖 LLM 集成

| 组件 | 描述 | 文件 |
|------|------|------|
| LLM 客户端 | OpenAI API 封装 + 结构化输出 | `agents/src/llm/client.py` |
| Agent Prompts | Intent/Verifier/Plan/Compliance/Payment 提示词 | `agents/src/llm/prompts.py` |
| 输出 Schemas | Pydantic 结构化输出模型 | `agents/src/llm/schemas.py` |

### 🛡️ Compliance Agent

| 组件 | 描述 | 文件 |
|------|------|------|
| Compliance 节点 | 深度合规分析 + 风险评估 | `agents/src/compliance/node.py` |
| 合规工具 | check_compliance + get_rules | `agents/src/tools/compliance.py` |

### 💳 Payment Agent

| 组件 | 描述 | 文件 |
|------|------|------|
| Payment 节点 | 支付准备 + 方式选择 | `agents/src/execution/payment_node.py` |
| Confirm Payment | 支付确认 + 订单创建 | `agents/src/execution/payment_node.py` |

### 🎛️ Orchestrator

| 组件 | 描述 | 文件 |
|------|------|------|
| Session Manager | 会话创建/管理/持久化 | `agents/src/orchestrator/session.py` |
| Token 预算控制 | 每会话 Token 限额 | `agents/src/orchestrator/session.py` |

### 🔍 RAG 集成

| 组件 | 描述 | 文件 |
|------|------|------|
| Knowledge 工具 | search_knowledge, get_chunk | `agents/src/tools/knowledge.py` |
| 综合搜索 | search_with_context | `agents/src/tools/knowledge.py` |
| 混合检索 | BM25 + 向量语义搜索 | `apps/mcp-servers/core-mcp/src/knowledge/` |
| XOOBAY 同步 | 批量产品索引 | `apps/tool-gateway/src/services/xoobay.ts` |

### 🛡️ 错误处理

| 组件 | 描述 | 文件 |
|------|------|------|
| Circuit Breaker | 熔断器模式 | `packages/common/src/retry.ts` |
| Retry | 指数退避重试 | `packages/common/src/retry.ts` |
| Timeout | 请求超时处理 | `packages/common/src/retry.ts` |
| Fallback | 降级缓存策略 | `packages/common/src/retry.ts` |

### 📄 Contract 定义

| 文件 | 描述 |
|------|------|
| `contracts/json-schema/models/envelope.schema.json` | 请求/响应 Envelope |
| `contracts/json-schema/models/mission.schema.json` | Mission 数据模型 |
| `contracts/error-codes.yaml` | 统一错误码 |

---

## 测试状态

| 测试类型 | 状态 | 覆盖率 |
|----------|------|--------|
| TypeScript Build | ✅ 5/5 packages | - |
| Python Unit Tests | ✅ 10/10 passed | 58% |
| Python Lint (ruff) | ✅ 0 errors | - |
| API 手动测试 | ✅ 23/23 endpoints | - |
| Agent 集成测试 | ✅ 10/10 passed | - |
| Docker Build | ✅ 7/7 images | - |
| Docker 健康检查 | ✅ 7/7 services healthy | - |

---

## 待办事项

### 高优先级 (P0) - 全部完成 ✅

- [x] ~~**LLM 集成** - 在 Agent nodes 中调用 OpenAI API~~
- [x] ~~**完整流程测试** - 端到端购物流程验证~~
- [x] ~~**前端 Web App** - Next.js 用户界面~~
- [x] ~~**真实 LLM 测试** - 使用 Poe API 进行端到端测试~~
- [x] ~~**错误处理增强** - 超时、重试、降级策略~~
- [x] ~~**Docker 完整打包** - 所有服务容器化~~
- [x] ~~**Agent HTTP Server** - FastAPI 服务端点~~
- [x] ~~**MCP SSE 模式** - Core MCP / Checkout MCP 升级为 SSE~~

### 中优先级 (P1)

- [x] ~~**RAG 检索** - 实现 evidence_chunks 向量检索~~
- [x] ~~**XOOBAY 产品同步** - 批量索引真实产品~~
- [x] ~~**部署文档** - 完整部署指南~~
- [ ] **TypeScript 测试** - 添加 API 端点测试
- [ ] **日志增强** - 结构化日志 + OpenTelemetry trace

### 低优先级 (P2)

- [ ] **支付集成** - Stripe/PayPal 真实对接
- [ ] **知识图谱** - 兼容性/替代品推理（GraphRAG）
- [ ] **K8s 部署** - Helm Chart + 自动扩缩容

---

## 里程碑

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| **M0** | 环境搭建 + Contract 定义 | ✅ 完成 |
| **M1** | 工具层实现 + 种子数据 | ✅ 完成 |
| **M2** | Agent 编排 + LLM 集成 | ✅ 完成 |
| **M3** | 端到端流程 + 测试覆盖 | ✅ 完成 |
| **M4** | 前端 Demo | ✅ 完成 |
| **M5** | Docker 部署 + 文档 | ✅ 完成 |
| **M6** | 生产部署 + 监控 | ⏳ 待开始 |

---

## 变更日志

### 2026-01-02 (v0.5.0) - 全服务 Docker 部署完成

- ✅ **Python Agent HTTP Server**:
  - 新增 `agents/src/server.py` FastAPI 服务
  - 端点: `/health`, `/api/v1/chat`, `/api/v1/sessions`
  - 集成 SessionManager 会话持久化
- ✅ **MCP SSE 升级**:
  - checkout-mcp 从 stdio 升级为 SSE/HTTP 模式
  - 所有 MCP 服务现在稳定运行
- ✅ **Docker 健康检查修复**:
  - 修复 health check URL (localhost → 127.0.0.1)
  - 所有 7 个服务健康检查通过
- ✅ **依赖更新**:
  - agents/pyproject.toml: 添加 fastapi, uvicorn
  - checkout-mcp/package.json: 添加 express

### 2026-01-02 (v0.4.0) - Docker 完整打包

- ✅ **Docker Compose 增强**:
  - 添加 Redis 缓存服务
  - 完善所有服务健康检查
  - 支持多种部署模式（开发/工具/迁移）
  - 统一日志配置
- ✅ **环境配置**:
  - 创建 `.env.example` 完整模板
  - 支持所有服务端口配置
  - LLM/XOOBAY API 配置
- ✅ **部署文档**:
  - 创建 `doc/18_deployment.md` 完整指南
  - 系统要求说明
  - 快速启动指南
  - 故障排除手册
  - 生产部署建议
- ✅ **服务完整性**:
  - 10 个 Docker 服务全部就绪
  - 网络/存储卷配置完善
  - 服务依赖顺序正确

### 2026-01-02 (v0.3.1) - Agent 层 100% 完成

- ✅ **Compliance Agent** - 深度合规分析 + 风险评估 + 替代方案建议
- ✅ **Payment Agent** - 支付准备 + 方式选择 + 确认流程
- ✅ **Session Manager** - 会话持久化 + Token 预算控制
- ✅ **RAG 集成到 Agent** - Knowledge 工具封装
- ✅ **Graph 增强**:
  - 添加 compliance 节点（针对高风险商品）
  - 添加 payment/confirm_payment 节点
  - 完整的 7 节点状态机流程
- ✅ **测试用例增强**:
  - TestComplianceNode
  - TestPaymentNode
  - TestSessionManager
  - TestRAGIntegration

### 2026-01-02 (v0.3.0) - RAG 检索 + 错误处理

- ✅ **RAG 混合检索** - BM25 关键词 + 向量语义搜索
- ✅ **Knowledge 工具** - search, get_chunk, index_product, sync_xoobay
- ✅ **XOOBAY 完整集成** - 47,000+ 产品批量索引
- ✅ **错误处理增强**:
  - Circuit Breaker 熔断器模式
  - 指数退避重试策略
  - 请求超时处理
  - 内存缓存降级
  - 批量操作并发控制
- ✅ **数据库迁移** - 全文搜索索引 + 知识图谱表结构
- ✅ **通用工具库** - `packages/common/src/retry.ts`

### 2025-12-27 (v0.2.0) - [PR #2](https://github.com/fql9/Multi-AI-Agent4OnlineShopping/pull/2)

- ✅ **前端 Demo** - Next.js + Tailwind + shadcn/ui 完整 UI
- ✅ **Agent 推理可视化** - 实时显示 LLM 思考过程
- ✅ **方案选择 UI** - 3 个方案卡片（最便宜/最快/最佳）
- ✅ **确认项复选框** - confirmation_items 支持
- ✅ **税费置信度** - low/medium/high 显示
- ✅ **合规风险图标** - battery/liquid/magnet 图标
- ✅ **Poe API 集成** - GPT-4o-mini + Claude-3-Haiku
- ✅ **CI 修复** - web-app lint/test 脚本

### 2025-12-26 (v0.2.0-alpha)

- ✅ **LLM 客户端模块** - 支持结构化输出和重试
- ✅ **Agent Prompts** - Intent/Verifier/Plan 提示词
- ✅ **Intent Agent** - 解析用户意图为 MissionSpec
- ✅ **Candidate Agent** - 商品搜索和召回
- ✅ **Verifier Agent** - 价格/合规/运输核验
- ✅ **Plan Agent** - 多方案生成（最便宜/最快/最佳）
- ✅ **Execution Agent** - 购物车和草稿订单创建
- ✅ **集成测试** - 10 个测试用例，58% 覆盖率

### 2025-12-26 (v0.1.0)

- ✅ 实现所有 19 个工具端点的数据库逻辑
- ✅ 添加种子数据（类目/规则/商品）
- ✅ 修复 Python lint 问题
- ✅ 创建 PR #1 合并到 main

### 2025-12-25

- ✅ 创建 fql-dev 分支
- ✅ 搭建 Docker 环境
- ✅ 实现 Tool Gateway 骨架
- ✅ 实现 Python Agent 骨架
- ✅ 配置 Conda 环境

---

## 快速启动

### 方式一：Docker 一键部署（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/fql9/Multi-AI-Agent4OnlineShopping.git
cd Multi-AI-Agent4OnlineShopping

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置 OPENAI_API_KEY

# 3. 启动所有服务
docker compose -f docker-compose.full.yml up -d

# 4. 验证服务状态
docker compose -f docker-compose.full.yml ps

# 5. 访问前端
open http://localhost:3001
```

### 方式二：本地开发

```bash
# 1. 启动数据库
docker compose up -d

# 2. 导入种子数据
docker exec agent-postgres psql -U agent -d agent_db -f /docker-entrypoint-initdb.d/02-seed-data.sql

# 3. 安装依赖
pnpm install

# 4. 启动 Tool Gateway
pnpm --filter @shopping-agent/tool-gateway dev

# 5. 启动前端
pnpm --filter @shopping-agent/web-app dev

# 6. 测试 API
curl -X POST http://localhost:3000/tools/catalog/search_offers \
  -H 'Content-Type: application/json' \
  -d '{"request_id": "test", "actor": {"type": "user", "id": "test"}, "client": {"app": "web", "version": "1.0"}, "params": {"query": "iPhone"}}'
```

---

## API 测试示例

### 搜索产品

```bash
curl -X POST http://localhost:3000/tools/catalog/search_offers \
  -H 'Content-Type: application/json' \
  -d '{
    "request_id": "test-001",
    "actor": {"type": "user", "id": "test-user"},
    "client": {"app": "web", "version": "1.0.0"},
    "params": {"query": "laptop", "limit": 5}
  }'
```

### 获取产品详情

```bash
curl -X POST http://localhost:3000/tools/catalog/get_offer_card \
  -H 'Content-Type: application/json' \
  -d '{
    "request_id": "test-002",
    "actor": {"type": "user", "id": "test-user"},
    "client": {"app": "web", "version": "1.0.0"},
    "params": {"offer_id": "of_laptop_001"}
  }'
```

### Agent 对话

```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "session_id": "session-001",
    "message": "帮我找一款适合编程的笔记本电脑，预算 8000 元左右"
  }'
```

---

## 文档索引

| 文档 | 描述 |
|------|------|
| [00_overview.md](00_overview.md) | 项目概述 |
| [01_repo_structure.md](01_repo_structure.md) | 仓库结构 |
| [02_tech_stack.md](02_tech_stack.md) | 技术栈 |
| [03_dev_process.md](03_dev_process.md) | 开发流程 |
| [04_tooling_spec.md](04_tooling_spec.md) | 工具规范 |
| [05_tool_catalog.md](05_tool_catalog.md) | 工具目录 |
| [06_evidence_audit.md](06_evidence_audit.md) | 证据审计 |
| [07_draft_order.md](07_draft_order.md) | 草稿订单 |
| [08_aroc_schema.md](08_aroc_schema.md) | AROC Schema |
| [09_kg_design.md](09_kg_design.md) | 知识图谱设计 |
| [10_rag_graphrag.md](10_rag_graphrag.md) | RAG/GraphRAG |
| [11_multi_agent.md](11_multi_agent.md) | 多 Agent 设计 |
| [12_mcp_design.md](12_mcp_design.md) | MCP 设计 |
| [13_security_risk.md](13_security_risk.md) | 安全风险 |
| [14_cold_start.md](14_cold_start.md) | 冷启动 |
| [15_llm_selection.md](15_llm_selection.md) | LLM 选型 |
| [16_cost_estimation.md](16_cost_estimation.md) | 成本估算 |
| [17_progress.md](17_progress.md) | 开发进度（本文档） |
| [18_deployment.md](18_deployment.md) | 部署指南 |
