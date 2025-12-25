# 02｜技术栈（落地版：分阶段演进 + 官方推荐）

> 目标是"能交易落地 + 可审计回放 + 跨境合规"。  
> 本文档给出 **MVP → 中期 → 成熟期** 的分阶段技术栈演进路径，避免一开始就过度复杂。

---

## 核心原则

1. **MVP 极简**：能用一个组件解决的不引入多个；PostgreSQL + pgvector 能覆盖 80% 需求
2. **Python 做 Agent，TypeScript 做 API**：LLM Agent 生态 Python 更成熟；API/前端 TypeScript 类型更安全
3. **Contract First**：无论什么语言，工具 schema 先定义、后实现
4. **可审计优先**：所有关键路径必须可追溯

---

## 一、语言与运行时

| 层 | 语言 | 理由 |
|----|------|------|
| **Agent 编排层** | **Python 3.11+** | LangGraph/LangChain 官方主力；Pydantic 强类型；LLM SDK 生态完整 |
| **Tool Gateway / MCP Servers** | **TypeScript (Node.js 20 LTS)** | 强类型 API、Contract 生成友好、前后端一致 |
| **Web 前端** | **TypeScript + React/Next.js** | 类型安全、SSR、生态成熟 |
| **离线管道** | **Python** | 评价聚类、AROC 抽取、模型评估、数据清洗 |

---

## 二、LLM 与 Agent 框架

### 2.1 LLM 选型（推荐）

| 用途 | 推荐模型 | 备选 | Token 成本参考 |
|------|----------|------|----------------|
| **Orchestrator / Planner** | GPT-4o-mini | Claude 3.5 Haiku, Gemini 1.5 Flash | $0.15/$0.60 per 1M |
| **深度核验 / 长上下文对比** | GPT-4o | Claude 3.5 Sonnet | $2.5/$10 per 1M |
| **向量嵌入** | text-embedding-3-small | Cohere embed-v3 | $0.02 per 1M |
| **私有化部署（可选）** | Qwen2.5-72B / DeepSeek-V3 | LLaMA 3.1 70B | 自建成本 |

### 2.2 Agent 框架选型

| 框架 | 推荐度 | 理由 |
|------|--------|------|
| **LangGraph** | ✅ 强烈推荐 | 官方维护、状态机驱动、可控、支持人工介入、可持久化 |
| LangChain | ⚠️ 仅用于工具封装 | 直接用 LangGraph 编排，LangChain 做底层工具封装 |
| AutoGen | ❌ 不推荐 | 多 Agent 对话太自由，不适合交易场景 |
| CrewAI | ❌ 不推荐 | 控制力不足 |
| 自研状态机 | ⚠️ 备选 | 工作量大，但完全可控 |

**推荐组合**：`LangGraph` + `LangChain Tools` + `Pydantic` 强类型

---

## 三、存储与检索（分阶段演进）

### 3.1 MVP 阶段（极简：只用 PostgreSQL）

| 角色 | MVP 方案 | 说明 |
|------|----------|------|
| 关系存储 | **PostgreSQL 16** | AROC、Evidence、Mission、DraftOrder、用户、商家 |
| 向量检索 | **pgvector** 扩展 | 说明书/条款 embedding，够用 |
| 关键词检索 | **PostgreSQL tsvector** | 型号、标准号、条款关键字 |
| 图谱查询 | **PostgreSQL + JSON + 递归 CTE** | 模拟图谱（兼容/替代关系），MVP 够用 |
| 缓存 | 不用 Redis | 先不引入，PostgreSQL 查询足够快 |
| 对象存储 | 本地文件系统 | 说明书/证书 PDF |
| 事件流 | 不用 Kafka | 用 PostgreSQL 表 + 轮询 |

**MVP 只需部署一个 PostgreSQL（带 pgvector 扩展）即可跑通核心链路。**

### 3.2 中期阶段（按需扩展）

| 角色 | 中期方案 | 触发条件 |
|------|----------|----------|
| 缓存 | + **Redis** | 报价/可售性需要 <10ms 响应 |
| 向量检索 | + **Milvus** 或 **Qdrant** | 向量规模 >1M 或 QPS >100 |
| 全文检索 | + **OpenSearch** | 复杂查询、分词、高亮需求 |
| 对象存储 | + **MinIO / S3** | 文件量大、需要分布式 |

### 3.3 成熟期（完整架构）

| 角色 | 成熟方案 | 触发条件 |
|------|----------|----------|
| 图谱 | + **Neo4j** 或 **Amazon Neptune** | 复杂图查询、多跳推理、规模 >10M 节点 |
| 事件流 | + **Kafka / Pulsar** | 价格/库存实时同步、事件驱动架构 |
| CDC | + **Debezium** | 需要捕获数据库变更 |

---

## 四、API / 合约 / 代码生成

| 技术 | 用途 | 阶段 |
|------|------|------|
| **OpenAPI 3.1 + JSON Schema** | Tool 输入输出与错误码定义（Contract First） | MVP |
| **Pydantic** (Python) | Agent 层强类型数据模型 | MVP |
| **Zod** (TypeScript) | API 层强类型校验 | MVP |
| **TypeScript SDK 生成** | 从 contracts 自动生成 typesafe client | MVP |
| Protobuf（可选） | 内部高频服务间通信 | 成熟期 |

---

## 五、观测与审计

| 技术 | 用途 | 阶段 |
|------|------|------|
| **OpenTelemetry** | trace/span 贯穿全链路 | MVP |
| **Prometheus + Grafana** | 指标与告警 | MVP |
| PostgreSQL 表 | Evidence Snapshot 存储（元数据） | MVP |
| Loki / ELK | 日志检索 | 中期 |
| S3/MinIO | Evidence 大 payload 存储 | 中期 |

---

## 六、认证 / 鉴权 / 权限

| 技术 | 用途 | 阶段 |
|------|------|------|
| **OAuth2 / OIDC** | 用户认证 | MVP |
| **JWT** | 服务间认证（含 scope） | MVP |
| 工具级权限白名单 | `tool:<domain>:read\|write` + Agent 绑定 | MVP |
| mTLS | 服务间加密（生产环境） | 成熟期 |

---

## 七、前端技术栈

| 场景 | 推荐技术 | 说明 |
|------|----------|------|
| **用户端（购物/下单）** | Next.js 14 + Tailwind + shadcn/ui | SSR、SEO、现代 UI |
| **内部控制台** | React + Ant Design / Radix | Evidence 回放、仲裁、监控 |
| **实时对话** | Server-Sent Events (SSE) | 流式输出 Agent 响应 |
| **状态管理** | Zustand / Jotai | 轻量、TypeScript 友好 |

---

## 八、部署与交付

| 阶段 | 方案 |
|------|------|
| **本地开发** | Docker Compose（PostgreSQL + pgvector） |
| **MVP 部署** | 单机 Docker Compose 或云托管 PostgreSQL |
| **生产环境** | Kubernetes + Helm |
| **CI/CD** | GitHub Actions（lint/test/contract-check/build/deploy） |

### Docker Compose（MVP 版）

```yaml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: agent
      POSTGRES_DB: agent
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## 九、技术栈总览图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           前端层                                     │
│  Next.js 14 + TypeScript + Tailwind + shadcn/ui                     │
│  (用户端 + 内部控制台)                                               │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Tool Gateway                                  │
│  TypeScript + Fastify + Zod + OpenTelemetry                         │
│  (Envelope/鉴权/幂等/限流/审计)                                      │
└─────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ Agent 编排层       │ │ MCP Servers       │ │ 数据管道          │
│ Python 3.11+      │ │ TypeScript        │ │ Python            │
│ LangGraph         │ │ Fastify           │ │ (AROC/KG/聚类)    │
│ Pydantic          │ │ (catalog/checkout)│ │                   │
│ LangChain Tools   │ │                   │ │                   │
└───────────────────┘ └───────────────────┘ └───────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          数据层                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ MVP: PostgreSQL 16 + pgvector                               │    │
│  │ (关系 + 向量 + 全文 + 图谱模拟)                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  成熟期扩展:                                                        │
│  + Redis (缓存) + Neo4j (图谱) + OpenSearch (全文) + Kafka (事件)   │
└─────────────────────────────────────────────────────────────────────┘
```

