# 17｜开发进度追踪

> 本文档记录项目的开发进度、已完成功能、待办事项。

---

## 当前版本

**v0.1.0-alpha** (2025-12-26)

---

## 进度总览

```
████████████████████████░░░░░░░░ 65%
```

| 模块 | 进度 | 状态 |
|------|------|------|
| 基础设施 | 100% | ✅ 完成 |
| 工具层 | 100% | ✅ 完成 |
| Agent 层 | 40% | 🔶 进行中 |
| 前端 | 0% | ⏳ 待开始 |
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
| Python Unit Tests | ✅ 4/4 passed | 24% |
| Python Lint (ruff) | ✅ 0 errors | - |
| API 手动测试 | ✅ 19/19 endpoints | - |
| 集成测试 | ⏳ 待添加 | - |

---

## 待办事项

### 高优先级 (P0)

- [ ] **LLM 集成** - 在 Agent nodes 中调用 OpenAI API
- [ ] **完整流程测试** - 端到端购物流程验证
- [ ] **错误处理增强** - 超时、重试、降级策略

### 中优先级 (P1)

- [ ] **RAG 检索** - 实现 evidence_chunks 向量检索
- [ ] **TypeScript 测试** - 添加 API 端点测试
- [ ] **日志增强** - 结构化日志 + OpenTelemetry trace

### 低优先级 (P2)

- [ ] **前端 Web App** - Next.js 用户界面
- [ ] **支付集成** - Stripe/PayPal
- [ ] **知识图谱** - 兼容性/替代品推理

---

## 里程碑

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| **M0** | 环境搭建 + Contract 定义 | ✅ 完成 |
| **M1** | 工具层实现 + 种子数据 | ✅ 完成 |
| **M2** | Agent 编排 + LLM 集成 | 🔶 进行中 |
| **M3** | 端到端流程 + 测试覆盖 | ⏳ 待开始 |
| **M4** | 前端 + 支付 + 生产部署 | ⏳ 待开始 |

---

## 变更日志

### 2025-12-26

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

