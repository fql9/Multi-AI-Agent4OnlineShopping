# 01｜仓库结构（落地版：Python Agent + TypeScript API + Monorepo）

> 本文档给出一个**可直接照抄创建**的目录结构，围绕"Contract First + Python Agent + TypeScript API"组织。

---

## 核心原则

1. **Python 做 Agent 编排**：LangGraph + Pydantic，LLM 生态更成熟
2. **TypeScript 做 Tool Gateway / MCP**：强类型 API，前后端一致
3. **Contract First**：所有工具先定义 schema，Python/TypeScript 各自生成 typesafe client
4. **Monorepo**：便于 Contract 共享与一致性校验

---

## 目录树（建议）

```
/
├── README.md
├── doc/                              # 设计与规范文档
│
├── contracts/                        # 🔴 核心：Contract First
│   ├── openapi/                      # OpenAPI 3.1 定义
│   │   ├── tool-gateway.yaml         # Tool Gateway API
│   │   ├── catalog-mcp.yaml          # Catalog MCP
│   │   └── checkout-mcp.yaml         # Checkout MCP
│   ├── json-schema/                  # 共享 JSON Schema
│   │   ├── mission.schema.json
│   │   ├── draft-order.schema.json
│   │   ├── evidence.schema.json
│   │   ├── aroc.schema.json
│   │   └── envelope.schema.json      # 统一请求/响应 Envelope
│   └── error-codes.yaml              # 统一错误码定义
│
├── packages/                         # 共享包（TypeScript）
│   ├── contracts-ts/                 # 从 contracts 生成的 TypeScript 类型
│   ├── common/                       # 日志、错误码、Envelope、trace
│   └── sdk/                          # 给前端/其他服务用的 SDK
│
├── agents/                           # 🐍 Python：Agent 编排层
│   ├── pyproject.toml                # Python 项目配置（uv/poetry）
│   ├── src/
│   │   ├── orchestrator/             # Orchestrator Agent（LangGraph）
│   │   ├── intent/                   # Intent & Preference Agent
│   │   ├── candidate/                # Candidate Generation Agent
│   │   ├── verifier/                 # Verification/Critic Agent
│   │   ├── compliance/               # Cross-border Compliance Agent
│   │   ├── execution/                # Checkout/Execution Agent
│   │   ├── tools/                    # LangChain Tools 封装（调用 MCP）
│   │   ├── models/                   # Pydantic 数据模型（从 contracts 生成）
│   │   └── graph/                    # LangGraph 状态机定义
│   └── tests/
│
├── apps/                             # 🟦 TypeScript：API / MCP / 前端
│   ├── tool-gateway/                 # 统一 Tool Gateway
│   │   ├── src/
│   │   │   ├── middleware/           # Envelope/鉴权/幂等/限流/审计
│   │   │   ├── routes/               # 工具路由
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── mcp-servers/                  # MCP Servers
│   │   ├── core-mcp/                 # MVP：合并 catalog/pricing/shipping/compliance
│   │   │   ├── src/
│   │   │   │   ├── catalog/
│   │   │   │   ├── pricing/
│   │   │   │   ├── shipping/
│   │   │   │   ├── compliance/
│   │   │   │   └── index.ts
│   │   │   └── package.json
│   │   │
│   │   └── checkout-mcp/             # 高敏感：单独分离
│   │       ├── src/
│   │       │   ├── cart/
│   │       │   ├── checkout/
│   │       │   ├── payment/
│   │       │   ├── evidence/
│   │       │   └── index.ts
│   │       └── package.json
│   │
│   ├── web-console/                  # 内部控制台（React）
│   │   ├── src/
│   │   └── package.json
│   │
│   └── web-app/                      # 用户端（Next.js）
│       ├── src/
│       │   ├── app/                  # App Router
│       │   ├── components/
│       │   └── lib/
│       └── package.json
│
├── data/                             # 🐍 Python：数据管道
│   ├── pipelines/
│   │   ├── aroc_generator/           # AROC 生成
│   │   ├── kg_builder/               # KG 构建
│   │   ├── review_clustering/        # 评价聚类
│   │   └── evidence_indexer/         # 证据索引构建
│   ├── migrations/                   # DB schema 迁移（Alembic）
│   └── seeds/                        # 种子数据
│
├── infra/                            # 基础设施
│   ├── docker/
│   │   ├── docker-compose.yml        # 本地开发
│   │   └── docker-compose.prod.yml
│   ├── k8s/                          # Kubernetes 配置
│   └── terraform/                    # 云资源（可选）
│
├── scripts/                          # 开发脚本
│   ├── generate-sdk.sh               # 从 contracts 生成 SDK
│   ├── replay-evidence.py            # 回放 evidence
│   └── import-sample-data.py         # 导入样例数据
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # CI（lint/test/contract-check）
│   │   └── deploy.yml                # 部署
│   └── ISSUE_TEMPLATE/
│
├── package.json                      # Monorepo 根配置（pnpm workspace）
├── pnpm-workspace.yaml
└── turbo.json                        # Turborepo 配置（可选）
```

---

## 组件职责边界（强制）

| 组件 | 职责 | 禁止 |
|------|------|------|
| `contracts/` | 定义工具 schema、错误码、数据模型 | 不含业务逻辑 |
| `agents/` | Agent 编排、LLM 调用、状态机、任务拆解 | 不直接访问数据库；强事实必须来自工具 |
| `tool-gateway/` | Envelope、鉴权、幂等、限流、审计、trace | 不做业务决策 |
| `mcp-servers/` | 领域服务编排，输出强事实与 evidence | 不直接暴露给前端 |
| `data/pipelines/` | 离线/准实时构建 AROC/KG/索引 | 不绕开证据与版本管理 |
| `web-app/` | 用户交互、展示、支付确认 | 不直接调用 Agent |

---

## MVP 最小启动

MVP 只需启动以下组件：

```
┌─────────────────┐
│   web-app       │ ← Next.js（用户端）
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│  tool-gateway   │ ← TypeScript（统一入口）
└────────┬────────┘
         │ HTTP
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────────┐
│agents │ │mcp-servers│
│(Python)│ │(TypeScript)│
└───┬───┘ └─────┬─────┘
    │           │
    └─────┬─────┘
          ▼
   ┌──────────────┐
   │ PostgreSQL   │
   │ + pgvector   │
   └──────────────┘
```

---

## Monorepo 工具推荐

| 工具 | 用途 |
|------|------|
| **pnpm** | TypeScript 包管理（workspace） |
| **Turborepo** | 构建缓存与任务编排 |
| **uv** 或 **poetry** | Python 依赖管理 |
| **Alembic** | 数据库迁移 |

---

## Contract First 工作流

```
1. 在 contracts/ 定义 OpenAPI / JSON Schema
       ↓
2. 运行 scripts/generate-sdk.sh
       ↓
3. 自动生成：
   - packages/contracts-ts/（TypeScript 类型）
   - agents/src/models/（Pydantic 模型）
       ↓
4. MCP Server / Agent 使用生成的类型开发
       ↓
5. CI 运行 contract-check：确保实现与 schema 一致
```

