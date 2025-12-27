# Multi-AI-Agent4OnlineShopping

> **shopping like prompting!**

Build an auditable, tool-driven multi-agent system that turns a user's *purchase mission* into an executable **Draft Order** (without capturing payment), backed by **strong facts** (pricing/stock/shipping/tax/compliance/policies) obtained only via tools and **evidence snapshots** that can be replayed for cross-border disputes.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

---

## Contents

- [Why this repo](#why-this-repo)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Docs (Chinese)](#docs-chinese)
- [Quick Start](#quick-start)
- [中文版本](#中文版本)

---

## Why this repo

| Principle | Description |
|-----------|-------------|
| **No guessing on tradable facts** | Price, stock, shipping, tax, compliance, policies must come from structured sources or real-time tools. |
| **Auditable by design** | Every key decision is attached to an Evidence Snapshot (tool outputs + ruleset versions + citations). |
| **RAG is evidence, not truth** | Manuals, QA, review insights are retrieved with citations; they never override tool-verified truth. |

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Agent Orchestration** | Python 3.11+ / LangGraph | State machine driven, controllable |
| **Tool Gateway / MCP** | TypeScript / Fastify | Type-safe API, Contract First |
| **Frontend** | Next.js 14 / Tailwind / shadcn/ui | Modern UI |
| **Database (MVP)** | PostgreSQL 16 + pgvector | All-in-one for MVP |
| **LLM** | GPT-4o-mini (routing) + GPT-4o (verification) | Tiered usage |

**MVP only needs PostgreSQL + pgvector. Expand to Redis/Neo4j/Kafka as needed.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend                                   │
│  Next.js 14 + TypeScript + Tailwind + shadcn/ui                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                        Tool Gateway                                  │
│  TypeScript + Fastify + Zod + OpenTelemetry                         │
│  (Envelope / Auth / Idempotency / Rate Limit / Audit)               │
└─────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ Agent Layer       │ │ MCP Servers       │ │ Data Pipelines    │
│ Python 3.11+      │ │ TypeScript        │ │ Python            │
│ LangGraph         │ │ (core/checkout)   │ │ (AROC/KG/Cluster) │
│ Pydantic          │ │                   │ │                   │
└───────────────────┘ └───────────────────┘ └───────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                          Data Layer                                  │
│  MVP: PostgreSQL 16 + pgvector                                      │
│  Scale: + Redis + Neo4j + OpenSearch + Kafka                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Agent Flow (LangGraph State Machine)

```
User Message
     │
     ▼
┌─────────────┐
│   Intent    │ ─── Parse user intent → Mission
└─────────────┘
     │
     ▼
┌─────────────┐
│  Candidate  │ ─── Search offers (catalog.*)
└─────────────┘
     │
     ▼
┌─────────────┐
│   Verify    │ ─── Real-time tools (pricing/shipping/tax/compliance)
└─────────────┘
     │
     ▼
┌─────────────┐
│    Plan     │ ─── Generate 2-3 executable plans
└─────────────┘
     │ (user selects)
     ▼
┌─────────────┐
│  Execution  │ ─── Create Draft Order + Evidence Snapshot
└─────────────┘
     │
     ▼
  Payment (requires_user_action: true)
```

---

## Docs (Chinese)

📚 **Start here:** [`doc/README.md`](doc/README.md)

| Document | Description |
|----------|-------------|
| [00_overview](doc/00_overview.md) | 项目概览：三层架构 |
| [01_repo_structure](doc/01_repo_structure.md) | 仓库目录结构（Python Agent + TS API） |
| [02_tech_stack](doc/02_tech_stack.md) | **技术栈（落地版，分阶段演进）** |
| [03_dev_process](doc/03_dev_process.md) | 开发流程与里程碑 |
| [04_tooling_spec](doc/04_tooling_spec.md) | 工具调用统一规范 |
| [05_tool_catalog](doc/05_tool_catalog.md) | 平台级工具目录 |
| [06_evidence_audit](doc/06_evidence_audit.md) | Evidence Snapshot 审计机制 |
| [07_draft_order](doc/07_draft_order.md) | Draft Order 状态机 |
| [08_aroc_schema](doc/08_aroc_schema.md) | AROC Schema 设计 |
| [09_kg_design](doc/09_kg_design.md) | 知识图谱设计 |
| [10_rag_graphrag](doc/10_rag_graphrag.md) | GraphRAG 检索 |
| [11_multi_agent](doc/11_multi_agent.md) | **Multi-Agent 编排（LangGraph）** |
| [12_mcp_design](doc/12_mcp_design.md) | **MCP Server 设计（分阶段拆分）** |
| [13_security_risk](doc/13_security_risk.md) | 安全与风控 |
| [14_cold_start](doc/14_cold_start.md) | **冷启动策略** |
| [15_llm_selection](doc/15_llm_selection.md) | **LLM 选型指南** |
| [16_cost_estimation](doc/16_cost_estimation.md) | **成本估算** |

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker (for PostgreSQL)

### 1. Start Database

```bash
docker compose up -d
```

### 2. Install Dependencies

```bash
# Python (agents)
cd agents && uv sync  # or pip install -e .

# TypeScript (gateway & MCP)
pnpm install
```

### 3. Run Services

```bash
# Tool Gateway
pnpm --filter tool-gateway dev

# MCP Servers
pnpm --filter core-mcp dev
pnpm --filter checkout-mcp dev

# Agent
cd agents && python -m src.main
```

---

## 中文版本

> **shopping like prompting!**

目标是构建一个可工程落地的**委托式采购（Delegated Buying）**平台：

- AI 把用户的采购委托转成**可执行草稿订单（Draft Order）**（不扣款）
- 通过**工具调用**获得价格/库存/物流/税费/合规/条款等**强事实**
- 全链路**可审计回放（Evidence Snapshot）**，支撑跨境纠纷仲裁

### 核心原则

| 原则 | 说明 |
|------|------|
| **强事实不允许模型猜** | 所有可验证交易事实必须来自结构化源或实时工具返回 |
| **可审计** | 关键决策点必须产出 Evidence Snapshot，可回放"当时为什么这么报价/合规判定/下单" |
| **RAG 只做证据补全** | 说明书/QA/评价洞察必须带引用，且不替代强事实 |

### 技术栈（落地版）

| 层 | 技术 | 说明 |
|----|------|------|
| **Agent 编排** | Python + LangGraph | 状态机驱动、可控 |
| **Tool Gateway / MCP** | TypeScript + Fastify | 强类型 API |
| **前端** | Next.js + Tailwind | 现代 UI |
| **数据库（MVP）** | PostgreSQL + pgvector | 一站式 |
| **LLM** | GPT-4o-mini + GPT-4o | 分层使用 |

### 文档入口

📚 从这里开始：[`doc/README.md`](doc/README.md)

### MVP 检查清单

- [x] 类目树 + 属性定义导入 *(12 类目)*
- [x] 合规规则导入 *(6 条规则)*
- [x] 样例 AROC 导入 *(14 商品 / 22 SKU)*
- [x] Tool Gateway 实现 *(19 个端点)*
- [x] core-mcp 实现 *(catalog/pricing/shipping/compliance)*
- [x] checkout-mcp 实现 *(cart/checkout/evidence)*
- [x] LangGraph Agent 骨架 *(intent → candidate → verify → plan → execution)*
- [x] Draft Order 可回放证据
- [x] 支付确认 *(requires_user_action: true)*
- [x] LLM 集成 *(GPT-4o-mini + Claude-3-Haiku via Poe API)*
- [x] 端到端测试 *(10 tests, 58% coverage)*
- [x] 前端 Web App *(Next.js + Tailwind + shadcn/ui)*
- [ ] 支付集成 *(Stripe/PayPal)*
- [ ] RAG 向量检索

---

## Repository Conventions

- **Contract First**: Tool schemas, error codes, TTL, and evidence formats are defined before implementations.
- **Least Privilege**: Payment capture is never callable by agents; user confirmation is mandatory.
- **Python (Agent) + TypeScript (API)**: LLM ecosystem is more mature in Python; API layer uses TypeScript for type safety.

---

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
