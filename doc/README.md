# 文档索引（从这里开始）

本目录给出 "AI 生成可执行草稿订单（Draft Order）" 平台的**完整工程化设计**：仓库结构、技术栈、开发流程、工具目录（Tool Calls）、证据审计（Evidence Snapshot）、AROC（AI-Ready Offer Card）、知识图谱（KG）、GraphRAG、MCP 工具服务器拆分、多 Agent 编排与权限风控。

---

## ⚡ 快速开始（建议阅读顺序）

1. [`00_overview.md`](./00_overview.md) - 项目概览与三层架构
2. [`02_tech_stack.md`](./02_tech_stack.md) - **技术栈（落地版）**
3. [`01_repo_structure.md`](./01_repo_structure.md) - **仓库结构（落地版）**
4. [`18_deployment.md`](./18_deployment.md) - **🐳 部署指南（Docker 一键启动）**
5. [`19_ops_runbook.md`](./19_ops_runbook.md) - **🧰 运维 Runbook（命令手册）**
6. [`17_progress.md`](./17_progress.md) - **开发进度（100%）**

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

### 项目管理与部署

| 文档 | 说明 |
|------|------|
| [`17_progress.md`](./17_progress.md) | **开发进度追踪（100% 完成）** |
| [`18_deployment.md`](./18_deployment.md) | **🐳 部署指南（Docker 完整打包）** |
| [`19_ops_runbook.md`](./19_ops_runbook.md) | **🧰 运维 Runbook（命令手册）** |

---

## ✅ 你可能常用的入口

- **部署**：[`18_deployment.md`](./18_deployment.md)
- **运维命令（Runbook）**：[`19_ops_runbook.md`](./19_ops_runbook.md)
- **项目进度**：[`17_progress.md`](./17_progress.md)
