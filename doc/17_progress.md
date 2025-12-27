# 17｜开发进度追踪

> 本文档记录项目的开发进度、已完成功能、待办事项。

---

## 当前版本

**v0.2.0** (2025-12-27) - [PR #2 已合并](https://github.com/fql9/Multi-AI-Agent4OnlineShopping/pull/2)

---

## 进度总览

```
██████████████████████████████████░░ 85%
```

| 模块 | 进度 | 状态 |
|------|------|------|
| 基础设施 | 100% | ✅ 完成 |
| 工具层 | 100% | ✅ 完成 |
| Agent 层 | 95% | ✅ 完成 |
| 前端 | 80% | ✅ Demo 可用 |
| 支付集成 | 0% | ⏳ 待开始 |

---

## 已完成功能

### 🗄️ 基础设施

| 功能 | 描述 | 文件 |
|------|------|------|
| Docker 环境 | PostgreSQL 16 + pgvector | `docker-compose.yml` |
| 数据库表结构 | 11 张表（users, missions, offers, skus, carts, draft_orders, evidence_snapshots 等） | `infra/docker/init-db.sql` |
| 数据库连接池 | pg 连接管理 + 事务支持 | `packages/common/src/db.ts` |
| 种子数据 | 12 类目 + 6 规则 + 14 商品 + 22 SKU | `infra/docker/seed-data.sql` |
| CI/CD | GitHub Actions 自动构建测试 | `.github/workflows/ci.yml` |

### 🔧 工具层（19 个端点）

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
| 工具封装 | 调用 Tool Gateway | `agents/src/tools/` |

### 🤖 LLM 集成

| 组件 | 描述 | 文件 |
|------|------|------|
| LLM 客户端 | OpenAI API 封装 + 结构化输出 | `agents/src/llm/client.py` |
| Agent Prompts | Intent/Verifier/Plan 提示词 | `agents/src/llm/prompts.py` |
| 输出 Schemas | Pydantic 结构化输出模型 | `agents/src/llm/schemas.py` |

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
| TypeScript Build | ✅ 4/4 packages | - |
| Python Unit Tests | ✅ 10/10 passed | 58% |
| Python Lint (ruff) | ✅ 0 errors | - |
| API 手动测试 | ✅ 19/19 endpoints | - |
| Agent 集成测试 | ✅ 6/6 passed | - |

---

## 待办事项

### 高优先级 (P0)

- [x] ~~**LLM 集成** - 在 Agent nodes 中调用 OpenAI API~~
- [x] ~~**完整流程测试** - 端到端购物流程验证~~
- [x] ~~**前端 Web App** - Next.js 用户界面~~
- [x] ~~**真实 LLM 测试** - 使用 Poe API 进行端到端测试~~
- [ ] **错误处理增强** - 超时、重试、降级策略

### 中优先级 (P1)

- [ ] **RAG 检索** - 实现 evidence_chunks 向量检索
- [ ] **TypeScript 测试** - 添加 API 端点测试
- [ ] **日志增强** - 结构化日志 + OpenTelemetry trace

### 低优先级 (P2)

- [ ] **支付集成** - Stripe/PayPal
- [ ] **知识图谱** - 兼容性/替代品推理
- [ ] **生产部署** - Docker Compose → K8s

---

## 里程碑

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| **M0** | 环境搭建 + Contract 定义 | ✅ 完成 |
| **M1** | 工具层实现 + 种子数据 | ✅ 完成 |
| **M2** | Agent 编排 + LLM 集成 | ✅ 完成 |
| **M3** | 端到端流程 + 测试覆盖 | ✅ 完成 |
| **M4** | 前端 Demo | ✅ 完成 |
| **M5** | 支付集成 + 生产部署 | ⏳ 待开始 |

---

## 变更日志

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

```bash
# 1. 启动数据库
docker-compose up -d

# 2. 导入种子数据
docker cp infra/docker/seed-data.sql agent-postgres:/tmp/
docker exec agent-postgres psql -U agent -d agent_db -f /tmp/seed-data.sql

# 3. 安装依赖
pnpm install

# 4. 启动 Tool Gateway
pnpm --filter @shopping-agent/tool-gateway dev

# 5. 测试 API
curl -X POST http://localhost:3000/tools/catalog/search_offers \
  -H 'Content-Type: application/json' \
  -d '{"request_id": "...", "actor": {...}, "client": {...}, "params": {"query": "iPhone"}}'
```

