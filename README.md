# Multi-AI-Agent4OnlineShopping

> **shopping like prompting!**

Build an auditable, tool-driven multi-agent system that turns a user's *purchase mission* into an executable **Draft Order** (without capturing payment), backed by **strong facts** (pricing/stock/shipping/tax/compliance/policies) obtained only via tools and **evidence snapshots** that can be replayed for cross-border disputes.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](docker-compose.full.yml)
[![Progress](https://img.shields.io/badge/Progress-98%25-success)](doc/17_progress.md)

---

## Contents

- [Why this repo](#why-this-repo)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Docker Deployment](#docker-deployment)
- [Docs (Chinese)](#docs-chinese)
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
| **Database** | PostgreSQL 16 + pgvector | Vector search + Full-text search |
| **Cache** | Redis 7 | Session + Idempotency + Rate Limit |
| **LLM** | GPT-4o-mini (routing) + GPT-4o (verification) | Tiered usage |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend                                   │
│  Next.js 14 + TypeScript + Tailwind + shadcn/ui      :3001          │
└─────────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                       Python Agent                                   │
│  LangGraph + Pydantic + OpenAI                       :8000          │
│  ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────┐ ┌─────────┐            │
│  │ Intent │→│Candidate│→│Verifier│→│ Plan │→│ Execute │            │
│  └────────┘ └─────────┘ └────────┘ └──────┘ └─────────┘            │
│                    ↘ Compliance ↗      ↘ Payment ↗                  │
└─────────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                        Tool Gateway                                  │
│  TypeScript + Fastify + Zod + OpenTelemetry          :3000          │
│  (Envelope / Auth / Idempotency / Rate Limit / Audit)               │
└─────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼                               ▼
┌───────────────────────────┐   ┌───────────────────────────────┐
│       Core MCP :3010      │   │     Checkout MCP :3011        │
│  • Catalog                │   │  • Cart                       │
│  • Pricing                │   │  • Checkout                   │
│  • Shipping               │   │  • Evidence                   │
│  • Compliance             │   │  • Payment                    │
│  • Knowledge (RAG)        │   │                               │
└───────────────────────────┘   └───────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                          Data Layer                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐      │
│  │   PostgreSQL + pgvector │  │          Redis              │      │
│  │        :5433            │  │          :6379              │      │
│  └─────────────────────────┘  └─────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Option 1: Docker (Recommended) 🐳

```bash
# 1. Clone the repo
git clone https://github.com/fql9/Multi-AI-Agent4OnlineShopping.git
cd Multi-AI-Agent4OnlineShopping

# 2. Configure environment
cp .env.example .env
# Edit .env and set OPENAI_API_KEY

# 3. Start all services
docker compose -f docker-compose.full.yml up -d

# 4. Verify services
docker compose -f docker-compose.full.yml ps

# 5. Open frontend
open http://localhost:3001
```

### Option 2: Local Development

```bash
# 1. Start database only
docker compose up -d

# 2. Install dependencies
pnpm install
cd agents && pip install -e .

# 3. Start services
pnpm --filter @shopping-agent/tool-gateway dev  # :3000
pnpm --filter @shopping-agent/web-app dev       # :3001

# 4. Test API
curl http://localhost:3000/health
```

---

## Docker Deployment

### Services Overview

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 5433 | Database with pgvector |
| Redis | 6379 | Cache & Session |
| Tool Gateway | 3000 | Unified API Gateway |
| Core MCP | 3010 | Catalog/Pricing/Shipping/Compliance/Knowledge |
| Checkout MCP | 3011 | Cart/Checkout/Evidence |
| Web App | 3001 | Next.js Frontend |
| Python Agent | 8000 | LangGraph Orchestration |

### Commands

```bash
# Start all services
docker compose -f docker-compose.full.yml up -d

# Start with management tools (Adminer, Redis Commander)
docker compose -f docker-compose.full.yml --profile tools up -d

# Run database migrations
docker compose -f docker-compose.full.yml --profile migrate up db-migrate

# View logs
docker compose -f docker-compose.full.yml logs -f

# Stop all services
docker compose -f docker-compose.full.yml down

# Full reset (delete data)
docker compose -f docker-compose.full.yml down -v
```

### Environment Variables

Key configuration in `.env`:

```bash
# Required
OPENAI_API_KEY=sk-your-api-key

# Optional: XOOBAY product integration
XOOBAY_ENABLED=true
XOOBAY_API_KEY=your-key

# Ports (if conflicts)
POSTGRES_PORT=5433
TOOL_GATEWAY_PORT=3000
WEB_APP_PORT=3001
```

📚 Full deployment guide: [`doc/18_deployment.md`](doc/18_deployment.md)

---

## Docs (Chinese)

📚 **Start here:** [`doc/README.md`](doc/README.md)

| Document | Description |
|----------|-------------|
| [00_overview](doc/00_overview.md) | 项目概览：三层架构 |
| [01_repo_structure](doc/01_repo_structure.md) | 仓库目录结构 |
| [02_tech_stack](doc/02_tech_stack.md) | 技术栈（落地版） |
| [03_dev_process](doc/03_dev_process.md) | 开发流程与里程碑 |
| [04_tooling_spec](doc/04_tooling_spec.md) | 工具调用统一规范 |
| [05_tool_catalog](doc/05_tool_catalog.md) | 平台级工具目录（23 个） |
| [06_evidence_audit](doc/06_evidence_audit.md) | Evidence Snapshot 审计 |
| [07_draft_order](doc/07_draft_order.md) | Draft Order 状态机 |
| [08_aroc_schema](doc/08_aroc_schema.md) | AROC Schema 设计 |
| [09_kg_design](doc/09_kg_design.md) | 知识图谱设计 |
| [10_rag_graphrag](doc/10_rag_graphrag.md) | RAG/GraphRAG 检索 |
| [11_multi_agent](doc/11_multi_agent.md) | Multi-Agent 编排 |
| [12_mcp_design](doc/12_mcp_design.md) | MCP Server 设计 |
| [13_security_risk](doc/13_security_risk.md) | 安全与风控 |
| [14_cold_start](doc/14_cold_start.md) | 冷启动策略 |
| [15_llm_selection](doc/15_llm_selection.md) | LLM 选型指南 |
| [16_cost_estimation](doc/16_cost_estimation.md) | 成本估算 |
| [17_progress](doc/17_progress.md) | **开发进度 (98%)** |
| [18_deployment](doc/18_deployment.md) | **部署指南** |

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
| **可审计** | 关键决策点必须产出 Evidence Snapshot，可回放 |
| **RAG 只做证据补全** | 说明书/QA/评价洞察必须带引用，且不替代强事实 |

### 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| **Agent 编排** | Python + LangGraph | 7 节点状态机 |
| **Tool Gateway** | TypeScript + Fastify | 23 个工具端点 |
| **前端** | Next.js + Tailwind | 现代 UI |
| **数据库** | PostgreSQL + pgvector | 向量 + 全文搜索 |
| **缓存** | Redis | 会话 + 幂等性 |
| **LLM** | GPT-4o-mini + GPT-4o | 分层使用 |

### 一键部署

```bash
# 克隆项目
git clone https://github.com/fql9/Multi-AI-Agent4OnlineShopping.git
cd Multi-AI-Agent4OnlineShopping

# 配置
cp .env.example .env
# 编辑 .env，设置 OPENAI_API_KEY

# 启动所有服务
docker compose -f docker-compose.full.yml up -d

# 访问
open http://localhost:3001
```

### 项目进度 (98%)

| 模块 | 进度 | 状态 |
|------|------|------|
| 基础设施 | 100% | ✅ |
| 工具层 | 100% | ✅ |
| Agent 层 | 100% | ✅ |
| RAG 检索 | 100% | ✅ |
| Docker 部署 | 100% | ✅ |
| 前端 | 80% | ✅ Demo |
| 支付集成 | 80% | ⏳ |

### MVP 检查清单

- [x] 类目树 + 属性定义导入 *(12 类目)*
- [x] 合规规则导入 *(6 条规则)*
- [x] 样例 AROC 导入 *(14 商品 / 22 SKU)*
- [x] Tool Gateway 实现 *(23 个端点)*
- [x] core-mcp 实现 *(catalog/pricing/shipping/compliance/knowledge)*
- [x] checkout-mcp 实现 *(cart/checkout/evidence)*
- [x] LangGraph Agent *(7 节点状态机)*
- [x] Draft Order 可回放证据
- [x] RAG 混合检索 *(BM25 + 向量)*
- [x] XOOBAY 产品集成
- [x] LLM 集成 *(GPT-4o-mini + GPT-4o)*
- [x] 端到端测试 *(10 tests)*
- [x] 前端 Web App
- [x] Docker 完整打包 *(8 服务)*
- [x] 部署文档
- [ ] 支付集成 *(Stripe/PayPal)*
- [ ] K8s 部署

---

## Repository Conventions

- **Contract First**: Tool schemas, error codes, TTL, and evidence formats are defined before implementations.
- **Least Privilege**: Payment capture is never callable by agents; user confirmation is mandatory.
- **Python (Agent) + TypeScript (API)**: LLM ecosystem is more mature in Python; API layer uses TypeScript for type safety.

---

## MCP: GitHub CI & Docker Jobs (Python)

本项目包含一个 Python MCP Server，提供 GitHub Actions CI 管理和本地 Docker Job 执行能力。

### 功能特性

**CI 工具（6 个）**:
- `ci_trigger` - 触发 workflow_dispatch（自动注入 correlation_id）
- `ci_find_latest_run` - 查找最新 run（支持 correlation_id 过滤）
- `ci_get_run` - 获取 run 详情
- `ci_get_run_jobs` - 获取 jobs/steps 结构化信息
- `ci_get_failure_summary` - 获取失败日志 tail
- `ci_comment_pr` - 在 PR 上评论

**Docker Job 工具（7 个）**:
- `job_start` - 启动 Docker 容器（带安全约束）
- `job_status` - 查询 job 状态
- `job_logs` - 获取容器日志
- `job_cancel` - 取消运行中的 job
- `job_artifacts` - 列出产物
- `job_list` - 列出所有 jobs
- `job_cleanup` - 清理旧 jobs

详细文档：[`tools/mcp-gh-ci-jobs/README.md`](tools/mcp-gh-ci-jobs/README.md)

---

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
