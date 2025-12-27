# 文档索引（从这里开始）

本目录给出 "AI 生成可执行草稿订单（Draft Order）" 平台的**完整工程化设计**：仓库结构、技术栈、开发流程、工具目录（Tool Calls）、证据审计（Evidence Snapshot）、AROC（AI-Ready Offer Card）、知识图谱（KG）、GraphRAG、MCP 工具服务器拆分、多 Agent 编排与权限风控。

---

## ⚡ 快速开始（建议阅读顺序）

1. [`00_overview.md`](./00_overview.md) - 项目概览与三层架构
2. [`02_tech_stack.md`](./02_tech_stack.md) - **技术栈（落地版）**
3. [`01_repo_structure.md`](./01_repo_structure.md) - **仓库结构（落地版）**
4. [`03_dev_process.md`](./03_dev_process.md) - 开发流程与里程碑
5. [`05_tool_catalog.md`](./05_tool_catalog.md) - 工具目录
6. [`07_draft_order.md`](./07_draft_order.md) - Draft Order 状态机

---

## 📚 完整目录

### 概览

| 文档 | 说明 |
|------|------|
| [`00_overview.md`](./00_overview.md) | 目标、边界、三层架构（Truth/Reasoning/Acting） |

### 工程与落地

| 文档 | 说明 |
|------|------|
| [`01_repo_structure.md`](./01_repo_structure.md) | **仓库目录结构（Python Agent + TypeScript API）** |
| [`02_tech_stack.md`](./02_tech_stack.md) | **技术栈与选型（MVP → 中期 → 成熟期 分阶段演进）** |
| [`03_dev_process.md`](./03_dev_process.md) | 开发流程、里程碑、CI/CD、联调与验收 |
| [`14_cold_start.md`](./14_cold_start.md) | **冷启动策略（AROC/KG/RAG 从零开始）** |
| [`15_llm_selection.md`](./15_llm_selection.md) | **LLM 选型指南（模型、成本、调用策略）** |
| [`16_cost_estimation.md`](./16_cost_estimation.md) | **成本估算（MVP → 规模化）** |

### 工具层（强事实 + 可审计）

| 文档 | 说明 |
|------|------|
| [`04_tooling_spec.md`](./04_tooling_spec.md) | 工具调用统一规范（Envelope/错误码/幂等/TTL/Tracing） |
| [`05_tool_catalog.md`](./05_tool_catalog.md) | 平台级工具目录（全量清单 + 分阶段 MVP 裁剪） |
| [`06_evidence_audit.md`](./06_evidence_audit.md) | Evidence Snapshot 设计（可回放、可追责） |
| [`07_draft_order.md`](./07_draft_order.md) | Draft Order 生成流程与状态机 |

### 知识与检索

| 文档 | 说明 |
|------|------|
| [`08_aroc_schema.md`](./08_aroc_schema.md) | AROC Schema 与强/弱事实边界 |
| [`09_kg_design.md`](./09_kg_design.md) | 产品知识图谱（KG）实体/关系/版本/置信度 |
| [`10_rag_graphrag.md`](./10_rag_graphrag.md) | HybridRAG/GraphRAG（证据库构建、chunk、引用） |

### 智能体与协议

| 文档 | 说明 |
|------|------|
| [`11_multi_agent.md`](./11_multi_agent.md) | **多 Agent 编排（LangGraph + 职责划分 + 反幻觉）** |
| [`12_mcp_design.md`](./12_mcp_design.md) | **MCP Server 设计（分阶段拆分 + 权限边界）** |

### 安全与风控

| 文档 | 说明 |
|------|------|
| [`13_security_risk.md`](./13_security_risk.md) | 支付确认、PII、风控、合规门禁、反注入 |

### 项目管理

| 文档 | 说明 |
|------|------|
| [`17_progress.md`](./17_progress.md) | **开发进度追踪（已完成/进行中/待办）** |

### 📊 架构图表

| 文档 | 说明 |
|------|------|
| [`diagrams/architecture_overview.md`](./diagrams/architecture_overview.md) | **系统架构总览（三层架构 + 数据流）** |
| [`diagrams/aroc_structure.md`](./diagrams/aroc_structure.md) | **AROC 结构图（字段 + 数据流 + 强弱事实）** |
| [`diagrams/knowledge_graph.md`](./diagrams/knowledge_graph.md) | **知识图谱架构（实体 + 关系 + 调用流程）** |

---

## 🏗️ 技术栈总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                           前端层                                     │
│  Next.js 14 + TypeScript + Tailwind + shadcn/ui                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                        Tool Gateway                                  │
│  TypeScript + Fastify + Zod + OpenTelemetry                         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ Agent 编排层       │ │ MCP Servers       │ │ 数据管道          │
│ Python 3.11+      │ │ TypeScript        │ │ Python            │
│ LangGraph         │ │ (core/checkout)   │ │ (AROC/KG/聚类)    │
└───────────────────┘ └───────────────────┘ └───────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                          数据层                                      │
│  MVP: PostgreSQL 16 + pgvector                                      │
│  成熟期: + Redis + Neo4j + OpenSearch + Kafka                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📋 MVP 检查清单

### ✅ 已完成

- [x] **数据库架构** - PostgreSQL 16 + pgvector 表结构设计
- [x] **类目树导入** - 12 个类目（3 级层次结构）
- [x] **合规规则导入** - 22 条规则（电池/液体/CE/FCC/UKCA/RoHS 等）
- [x] **样例 AROC 导入** - 30+ 个商品 + 60+ 个 SKU
- [x] **Tool Gateway** - 统一入口 + Envelope + 幂等 + 审计
- [x] **Catalog 工具** - search_offers / get_offer_card / get_availability
- [x] **Pricing 工具** - get_realtime_quote / check_price_change
- [x] **Shipping 工具** - validate_address / quote_options / get_delivery_estimate
- [x] **Compliance 工具** - check_item / get_rules_for_category
- [x] **Checkout 工具** - create_cart / add_to_cart / compute_total / create_draft_order
- [x] **Evidence 工具** - create_snapshot / attach_to_draft_order / get_snapshot
- [x] **Knowledge 工具** - search (BM25 + fuzzy) / get_chunk / index_chunk
- [x] **KG 工具** - get_compatible_models / get_substitutes / get_complements / get_sku_certificates
- [x] **Python Agent 骨架** - Intent / Candidate / Verifier / Execution nodes
- [x] **LangGraph 状态机** - 基础编排流程定义
- [x] **Draft Order** - 支持幂等、用户确认、30分钟过期
- [x] **CI/CD** - GitHub Actions（TypeScript build + Python tests）
- [x] **LLM 集成** - GPT-4o-mini + Claude-3-Haiku (Poe API)
- [x] **端到端测试** - 10 tests, 58% coverage
- [x] **前端 Web App** - Next.js + Tailwind + shadcn/ui
- [x] **AROC 完善** - evidence_refs + version_hash + confidence
- [x] **知识图谱** - Brand/Merchant/Certificate/Model + 兼容/替代/配件关系
- [x] **错误处理增强** - 超时重试（指数退避）+ 降级策略
- [x] **RAG 检索** - evidence_chunks 混合检索

### ⏳ 待开始

- [ ] 支付集成 - Stripe/PayPal 对接
- [ ] 向量嵌入服务 - 集成 embedding 生成
- [ ] 生产部署 - Docker Compose → K8s
