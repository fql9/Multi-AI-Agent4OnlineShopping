# 🐳 Docker 完整打包指南

本指南将帮助你将整个项目打包到 Docker 中，实现一键部署。

## 📋 目录

- [前置要求](#前置要求)
- [快速开始](#快速开始)
- [手动构建](#手动构建)
- [服务说明](#服务说明)
- [环境变量配置](#环境变量配置)
- [常用命令](#常用命令)
- [故障排查](#故障排查)

## 🔧 前置要求

### 必需软件

1. **Docker Desktop** (Windows/Mac) 或 **Docker Engine** (Linux)
   - 版本: 20.10+
   - 下载: https://www.docker.com/products/docker-desktop

2. **Docker Compose**
   - 通常随 Docker Desktop 一起安装
   - 版本: 2.0+

### 系统要求

- **内存**: 至少 4GB RAM（推荐 8GB+）
- **磁盘空间**: 至少 10GB 可用空间
- **CPU**: 2 核心以上（推荐 4 核心+）

## 🚀 快速开始

### 方法 1: 使用一键脚本（推荐）

#### Windows (PowerShell)

```powershell
# 1. 构建所有镜像
.\docker-build.ps1

# 2. 启动所有服务
.\docker-start.ps1
```

#### Linux/Mac (Bash)

```bash
# 1. 构建所有镜像
chmod +x docker-build.sh
./docker-build.sh

# 2. 启动所有服务
docker compose -f docker-compose.full.yml up -d
```

### 方法 2: 使用 Docker Compose 命令

```bash
# 1. 构建所有镜像
docker compose -f docker-compose.full.yml build

# 2. 启动所有服务
docker compose -f docker-compose.full.yml up -d

# 3. 查看服务状态
docker compose -f docker-compose.full.yml ps
```

## 📦 手动构建

### 构建单个服务

```bash
# 构建 Tool Gateway
docker compose -f docker-compose.full.yml build tool-gateway

# 构建 Core MCP Server
docker compose -f docker-compose.full.yml build core-mcp

# 构建 Checkout MCP Server
docker compose -f docker-compose.full.yml build checkout-mcp

# 构建 Web App
docker compose -f docker-compose.full.yml build web-app

# 构建 Python Agent
docker compose -f docker-compose.full.yml build agent
```

### 构建所有服务（并行）

```bash
docker compose -f docker-compose.full.yml build --parallel
```

## 🏗️ 服务说明

### 1. PostgreSQL 数据库

- **镜像**: `pgvector/pgvector:pg16`
- **端口**: `5433:5432` (外部:内部)
- **数据卷**: `pgdata`
- **健康检查**: 自动执行

### 2. Tool Gateway

- **Dockerfile**: `apps/tool-gateway/Dockerfile`
- **端口**: `3000:3000`
- **功能**: 统一工具网关，提供 REST API
- **依赖**: PostgreSQL

### 3. Core MCP Server

- **Dockerfile**: `apps/mcp-servers/core-mcp/Dockerfile`
- **端口**: `3010:3010` (健康检查)
- **功能**: Catalog, Pricing, Shipping, Tax, Compliance
- **协议**: stdio (MCP)

### 4. Checkout MCP Server

- **Dockerfile**: `apps/mcp-servers/checkout-mcp/Dockerfile`
- **端口**: `3011:3011` (健康检查)
- **功能**: Cart, Checkout, Evidence
- **协议**: stdio (MCP)

### 5. Web App

- **Dockerfile**: `apps/web-app/Dockerfile`
- **端口**: `3001:3001`
- **功能**: Next.js 前端界面
- **依赖**: Tool Gateway

### 6. Python Agent

- **Dockerfile**: `agents/Dockerfile`
- **端口**: 无（内部服务）
- **功能**: LangGraph 编排层
- **依赖**: PostgreSQL, Tool Gateway

## 🔐 环境变量配置

### 创建环境变量文件

在项目根目录创建 `.env` 文件：

```env
# LLM 配置（必需）
OPENAI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL_PLANNER=gpt-4o-mini
OPENAI_MODEL_VERIFIER=gpt-4o

# 可选配置
TOKEN_BUDGET_TOTAL=50000
MOCK_TOOLS=false
```

### 环境变量说明

| 变量名 | 必需 | 说明 | 默认值 |
|--------|------|------|--------|
| `OPENAI_API_KEY` | ✅ | LLM API Key | - |
| `OPENAI_BASE_URL` | ❌ | API 地址 | `https://api.openai.com/v1` |
| `OPENAI_MODEL_PLANNER` | ❌ | 规划模型 | `gpt-4o-mini` |
| `OPENAI_MODEL_VERIFIER` | ❌ | 验证模型 | `gpt-4o` |
| `TOKEN_BUDGET_TOTAL` | ❌ | Token 预算 | `50000` |
| `MOCK_TOOLS` | ❌ | 使用模拟工具 | `false` |

## 📝 常用命令

### 服务管理

```bash
# 启动所有服务
docker compose -f docker-compose.full.yml up -d

# 停止所有服务
docker compose -f docker-compose.full.yml stop

# 停止并删除容器
docker compose -f docker-compose.full.yml down

# 停止并删除所有（包括数据卷）⚠️
docker compose -f docker-compose.full.yml down -v

# 重启所有服务
docker compose -f docker-compose.full.yml restart

# 重启特定服务
docker compose -f docker-compose.full.yml restart web-app
```

### 查看日志

```bash
# 查看所有服务日志
docker compose -f docker-compose.full.yml logs -f

# 查看特定服务日志
docker compose -f docker-compose.full.yml logs -f web-app
docker compose -f docker-compose.full.yml logs -f agent
docker compose -f docker-compose.full.yml logs -f tool-gateway

# 查看最近 100 行日志
docker compose -f docker-compose.full.yml logs --tail=100 web-app
```

### 查看状态

```bash
# 查看服务状态
docker compose -f docker-compose.full.yml ps

# 查看资源使用
docker stats

# 查看镜像列表
docker images | grep multi-ai-agent4onlineshopping
```

### 进入容器

```bash
# 进入 Web App 容器
docker exec -it agent-web-app sh

# 进入 Python Agent 容器
docker exec -it agent-python bash

# 进入数据库容器
docker exec -it agent-postgres psql -U agent -d agent_db
```

### 重建服务

```bash
# 重建并启动服务
docker compose -f docker-compose.full.yml up -d --build

# 强制重建（不使用缓存）
docker compose -f docker-compose.full.yml build --no-cache
docker compose -f docker-compose.full.yml up -d
```

## 🐛 故障排查

### 问题 1: 构建失败

**可能原因**:
- 网络问题导致依赖下载失败
- Docker 内存不足
- 磁盘空间不足

**解决方法**:
```bash
# 清理 Docker 缓存
docker system prune -a

# 增加 Docker 内存限制（Docker Desktop 设置）
# 检查磁盘空间
df -h  # Linux/Mac
Get-PSDrive C  # Windows PowerShell
```

### 问题 2: 服务无法启动

**检查步骤**:
```bash
# 1. 查看服务状态
docker compose -f docker-compose.full.yml ps

# 2. 查看错误日志
docker compose -f docker-compose.full.yml logs [service-name]

# 3. 检查端口占用
netstat -ano | findstr ":3000 :3001 :5433"  # Windows
lsof -i :3000 -i :3001 -i :5433  # Linux/Mac
```

### 问题 3: 数据库连接失败

**解决方法**:
```bash
# 1. 检查数据库是否运行
docker ps | grep agent-postgres

# 2. 测试数据库连接
docker exec agent-postgres psql -U agent -d agent_db -c "SELECT 1;"

# 3. 检查网络连接
docker network inspect agent-network
```

### 问题 4: 镜像构建缓慢

**优化方法**:
```bash
# 1. 使用构建缓存
docker compose -f docker-compose.full.yml build

# 2. 并行构建
docker compose -f docker-compose.full.yml build --parallel

# 3. 使用国内镜像源（在 Dockerfile 中配置）
```

## 📊 镜像大小

构建完成后，各服务镜像大小约为：

- Tool Gateway: ~200MB
- Core MCP: ~180MB
- Checkout MCP: ~180MB
- Web App: ~300MB
- Python Agent: ~500MB
- PostgreSQL: ~400MB (使用官方镜像)

**总计**: ~1.8GB

## 🔄 更新服务

### 更新代码后重新部署

```bash
# 1. 停止服务
docker compose -f docker-compose.full.yml down

# 2. 重新构建（使用缓存）
docker compose -f docker-compose.full.yml build

# 3. 启动服务
docker compose -f docker-compose.full.yml up -d
```

### 仅更新特定服务

```bash
# 重建并重启特定服务
docker compose -f docker-compose.full.yml up -d --build web-app
```

## 📚 相关文档

- [Docker 部署指南](./DOCKER_DEPLOY.md)
- [环境变量配置](./ENV_SETUP.md)
- [访问指南](./ACCESS_GUIDE.md)
- [故障排查](./TROUBLESHOOTING.md)

## 🎯 下一步

1. ✅ 构建所有 Docker 镜像
2. ✅ 配置环境变量（`.env` 文件）
3. ✅ 启动所有服务
4. ✅ 访问 http://localhost:3001 测试 Web App
5. ✅ 查看日志确认服务正常运行

---

**提示**: 首次构建可能需要 10-20 分钟，取决于网络速度。后续构建会使用缓存，速度会快很多。
