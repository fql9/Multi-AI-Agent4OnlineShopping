# 数据架构说明

## 📊 当前数据架构

### 1. 本地 Docker 数据库（PostgreSQL）

**位置**: Docker 容器 `agent-postgres`

**用途**:
- 存储项目自己的数据
- 存储用户数据、订单数据等
- 存储本地产品数据（如果有）

**特点**:
- 本地部署，速度快
- 完全控制
- 数据在本地

### 2. XOOBAY API（公司接口）

**位置**: 外部 HTTP API `https://www.xoobay.com`

**用途**:
- 通过 HTTP API 调用获取公司产品数据
- 提供 47,000+ 真实产品
- 实时产品信息

**特点**:
- 外部服务，需要网络连接
- 实时数据，无需同步
- 通过 API Key 认证

---

## 🔄 数据流程

### 搜索产品流程

```
用户搜索请求
    ↓
1. 查询本地 Docker 数据库
    ↓
2. 如果结果不足 或 启用了 XOOBAY
    ↓
3. 调用 XOOBAY API（公司接口）
    ↓
4. 合并数据库结果 + XOOBAY 结果
    ↓
返回给用户
```

### 获取产品详情流程

```
用户请求产品详情
    ↓
1. 查询本地 Docker 数据库
    ↓
2. 如果找不到 且 是 XOOBAY 产品（ID 以 xoobay_ 开头）
    ↓
3. 调用 XOOBAY API（公司接口）实时获取
    ↓
4. 转换为项目格式
    ↓
返回给用户
```

---

## 🎯 关键理解

### ✅ 正确理解

1. **本地数据库仍然存在**
   - Docker PostgreSQL 数据库继续运行
   - 用于存储项目自己的数据

2. **XOOBAY API 是外部接口**
   - 不是直接访问公司数据库
   - 是通过 HTTP API 调用公司的产品服务
   - 类似于调用第三方 API

3. **混合数据源架构**
   - 本地数据库 + XOOBAY API
   - 自动合并结果
   - 智能去重

### ❌ 需要澄清

- **XOOBAY API ≠ 直接访问公司数据库**
  - 它是通过 HTTP API 调用
  - 不是数据库连接
  - 是 RESTful API 服务

---

## 📋 数据来源对比

| 数据源 | 类型 | 位置 | 数据量 | 速度 | 控制 |
|--------|------|------|--------|------|------|
| **本地 Docker 数据库** | PostgreSQL | Docker 容器 | 有限（需要导入） | 快 | 完全控制 |
| **XOOBAY API** | HTTP API | 外部服务 | 47,034+ | 中等（网络延迟） | 只读 |

---

## 🔧 当前配置

### 本地数据库
```env
DB_HOST=postgres
DB_PORT=5432
DB_USER=agent
DB_PASSWORD=agent_dev_password
DB_NAME=agent_db
```

### XOOBAY API
```env
XOOBAY_ENABLED=true
XOOBAY_API_KEY=xoobay_api_ai_geo
XOOBAY_BASE_URL=https://www.xoobay.com
XOOBAY_LANG=en
```

---

## 💡 使用场景

### 场景 1: 只有本地数据库
- 查询本地存储的产品
- 速度快，但数据有限

### 场景 2: 只有 XOOBAY API
- 实时获取公司产品数据
- 数据量大，但依赖网络

### 场景 3: 混合模式（当前）
- ✅ 优先使用本地数据库（快）
- ✅ 结果不足时补充 XOOBAY API（数据多）
- ✅ 最佳性能和数据覆盖

---

## 🎯 总结

**你的理解基本正确，但需要澄清：**

✅ **正确部分**:
- 之前使用的是 Docker 本地数据库
- 现在可以通过 XOOBAY API 获取公司产品数据

⚠️ **需要澄清**:
- XOOBAY API 不是直接访问公司数据库
- 它是通过 HTTP API 调用公司的产品服务
- 本地数据库仍然存在，用于存储项目数据
- 现在是**混合架构**：本地数据库 + XOOBAY API

---

**架构**: 🟢 **混合数据源（本地数据库 + 公司 API）**
