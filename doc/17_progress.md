# 17｜开发进度追踪

> 本文档记录项目的开发进度、已完成功能、待办事项。

---

## 当前版本

**v0.3.0** (2025-12-27) - AROC + KG 完善

---

## 进度总览

```
██████████████████████████████████████ 95%
```

| 模块 | 进度 | 状态 |
|------|------|------|
| 基础设施 | 100% | ✅ 完成 |
| 工具层 | 100% | ✅ 完成（含 RAG + KG） |
| Agent 层 | 100% | ✅ 完成（含错误处理） |
| 前端 | 80% | ✅ Demo 可用 |
| AROC 商品卡 | 100% | ✅ 完成（含版本控制） |
| 知识图谱 | 100% | ✅ 完成（实体 + 关系） |
| 支付集成 | 0% | ⏳ 待开始 |

---

## 已完成功能

### 🗄️ 基础设施

| 功能 | 描述 | 文件 |
|------|------|------|
| Docker 环境 | PostgreSQL 16 + pgvector | `docker-compose.yml` |
| 数据库表结构 | 20+ 张表（含 KG 实体和关系表） | `infra/docker/init-db.sql`, `migrations/` |
| 数据库连接池 | pg 连接管理 + 事务支持 | `packages/common/src/db.ts` |
| 种子数据 | 12 类目 + 22 规则 + 30+ 商品 + 60+ SKU | `infra/docker/seed-*.sql` |
| KG 实体表 | Brand/Merchant/Certificate/Model/Policy/HSCode | `migrations/002_kg_entities.sql` |
| KG 关系表 | compatibility/substitutes/complements/certificates | `migrations/002_kg_entities.sql` |
| AROC 版本表 | aroc_versions 版本追踪 | `migrations/002_kg_entities.sql` |
| CI/CD | GitHub Actions 自动构建测试 | `.github/workflows/ci.yml` |

### 🔧 工具层（27 个端点）

| 域 | 工具 | 功能 |
|----|------|------|
| **Catalog** | `search_offers` | 关键词/类目/价格搜索 |
| | `get_offer_card` | AROC 完整商品卡（含 evidence_refs, version_hash） |
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
| **Knowledge** | `search` | 混合检索（BM25 + Fuzzy） |
| | `get_chunk` | 获取完整证据块 |
| | `index_chunk` | 索引新证据块 |
| **KG** | `get_compatible_models` | SKU 兼容设备型号 |
| | `get_substitutes` | 替代商品查询 |
| | `get_complements` | 配件/组合商品 |
| | `get_sku_certificates` | SKU 认证证书 |
| | `get_brand_info` | 品牌信息 |
| | `get_merchant_info` | 商家信息 |

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
- [x] ~~**错误处理增强** - 超时、重试、降级策略~~

### 中优先级 (P1)

- [x] ~~**RAG 检索** - 实现 evidence_chunks 向量检索~~
- [x] ~~**知识图谱** - 兼容性/替代品/配件推理~~
- [x] ~~**AROC 完善** - evidence_refs + version_hash + confidence~~
- [ ] **TypeScript 测试** - 添加 API 端点测试
- [ ] **日志增强** - 结构化日志 + OpenTelemetry trace

### 低优先级 (P2)

- [ ] **支付集成** - Stripe/PayPal
- [ ] **生产部署** - Docker Compose → K8s
- [ ] **向量嵌入** - 集成 embedding 服务生成向量

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

### 2025-12-27 (v0.3.0) - AROC + KG 完善

- ✅ **AROC 完善** - evidence_refs, version_hash, confidence 字段
- ✅ **KG 实体表** - brands, merchants, certificates, models, policies, hs_codes
- ✅ **KG 关系表** - sku_compatibility, offer_substitutes, offer_complements, sku_certificates
- ✅ **KG API** - 8 个新端点（兼容性/替代品/配件/证书/品牌/商家）
- ✅ **扩展种子数据** - 30+ 商品, 60+ SKU, 22 合规规则
- ✅ **混合检索** - BM25 + Fuzzy 降级方案
- ✅ **版本控制** - AROC 版本历史表

### 2025-12-27 (v0.2.1) - P0/P1 完成

- ✅ **错误处理增强** - 重试模块（指数退避 + 抖动）
- ✅ **降级策略** - 关键工具的 fallback 响应
- ✅ **RAG 工具** - knowledge.search / get_chunk 实现
- ✅ **证据种子数据** - 20+ 条 evidence chunks
- ✅ **Agent RAG 集成** - Verifier 节点引用证据

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

# 2. 导入种子数据（按顺序执行）
docker cp infra/docker/migrations/002_kg_entities.sql agent-postgres:/tmp/
docker exec agent-postgres psql -U agent -d agent_db -f /tmp/002_kg_entities.sql

docker cp infra/docker/seed-data.sql agent-postgres:/tmp/
docker exec agent-postgres psql -U agent -d agent_db -f /tmp/seed-data.sql

docker cp infra/docker/seed-kg-data.sql agent-postgres:/tmp/
docker exec agent-postgres psql -U agent -d agent_db -f /tmp/seed-kg-data.sql

docker cp infra/docker/seed-offers-extended.sql agent-postgres:/tmp/
docker exec agent-postgres psql -U agent -d agent_db -f /tmp/seed-offers-extended.sql

docker cp infra/docker/seed-compliance-extended.sql agent-postgres:/tmp/
docker exec agent-postgres psql -U agent -d agent_db -f /tmp/seed-compliance-extended.sql

docker cp infra/docker/seed-evidence-chunks.sql agent-postgres:/tmp/
docker exec agent-postgres psql -U agent -d agent_db -f /tmp/seed-evidence-chunks.sql

# 3. 安装依赖
pnpm install

# 4. 启动 Tool Gateway
pnpm --filter @shopping-agent/tool-gateway dev

# 5. 测试 API
curl -X POST http://localhost:3000/tools/catalog/search_offers \
  -H 'Content-Type: application/json' \
  -d '{"request_id": "test", "actor": {"type": "user", "id": "u1"}, "client": {"app": "web", "version": "1.0"}, "params": {"query": "iPhone"}}'

# 6. 测试 KG API
curl -X POST http://localhost:3000/tools/kg/get_compatible_models \
  -H 'Content-Type: application/json' \
  -d '{"params": {"offer_id": "of_case_001"}}'
```

