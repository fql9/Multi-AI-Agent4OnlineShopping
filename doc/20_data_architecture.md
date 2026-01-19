# 20｜数据源与数据流（PostgreSQL + XOOBAY）

本文档说明本项目的“强事实数据源”来自哪里、请求链路如何走，以及常见误解澄清。

---

## 📊 当前数据架构

### 1) 本地数据库（PostgreSQL / pgvector）

- **位置**：Docker 容器 `agent-postgres`
- **用途**：
  - 存储项目自身数据（例如订单草稿、证据快照、知识库 chunk、知识图谱派生数据等）
  - 存储已同步/导入的商品数据（若你跑了同步）
- **特点**：
  - 本地/内网部署、速度快
  - 可控（迁移、索引、数据增强可演进）

### 2) XOOBAY API（外部 HTTP 产品数据源）

- **位置**：外部 HTTP API `https://www.xoobay.com`
- **用途**：
  - 实时拉取产品列表/详情/店铺信息（只读）
  - 在数据库数据不足时补充召回
- **特点**：
  - 外部服务，依赖网络与可用性
  - 通过 API Key 鉴权
  - 多语言（`XOOBAY_LANG`）

---

## 🔄 数据流程

### 搜索产品（catalog.search_offers）

```
用户搜索请求
    ↓
1. 查询本地 PostgreSQL
    ↓
2. 如果结果不足 或 允许使用 XOOBAY（XOOBAY_ENABLED=true）
    ↓
3. 调用 XOOBAY API 补充召回
    ↓
4. 合并结果 + 去重 + 排序
    ↓
返回给用户/Agent
```

### 获取产品详情（catalog.get_offer_card）

```
用户请求产品详情
    ↓
1. 查询本地 PostgreSQL
    ↓
2. 如果找不到 且 是 XOOBAY 产品（offer_id 以 xoobay_ 开头）
    ↓
3. 调用 XOOBAY API 实时获取详情
    ↓
4. 转换为 AROC（AI-Ready Offer Card）格式返回
```

---

## 🎯 关键澄清（避免误解）

### ✅ 正确理解

1) **本地数据库仍然存在**  
用于存储项目数据与（可选）商品同步后的数据。

2) **XOOBAY API ≠ 直接访问公司数据库**  
它是一个外部 HTTP API（类似第三方 API 调用），不是数据库直连。

3) **混合数据源架构**  
系统可同时利用数据库与 XOOBAY，自动合并并尽量提升召回与体验。

---

## 📋 数据来源对比

| 数据源 | 类型 | 位置 | 数据量 | 延迟 | 控制 |
|--------|------|------|--------|------|------|
| 本地数据库 | PostgreSQL | Docker/内网 | 取决于导入/同步 | 低 | 完全控制 |
| XOOBAY | HTTP API | 外部服务 | 47k+ | 中（网络） | 只读 |

---

## 🔧 配置入口（环境变量）

XOOBAY 与数据库配置入口详见：

- `doc/18_deployment.md`（Docker 部署与 `.env` 配置）
- `doc/19_ops_runbook.md`（XOOBAY 同步与排障命令）
- `doc/21_xoobay_integration.md`（XOOBAY 集成说明与测试方法）

