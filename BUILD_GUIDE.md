# 🏗️ Docker 构建指南

## 快速开始

### 方法 1: 使用一键脚本（推荐）⭐

#### Windows PowerShell

```powershell
# 在项目根目录执行
.\docker-build.ps1
```

这个脚本会：
1. 依次构建所有 5 个服务镜像
2. 显示构建进度
3. 构建完成后显示镜像列表

#### Linux/Mac

```bash
# 添加执行权限
chmod +x docker-build.sh

# 执行构建
./docker-build.sh
```

### 方法 2: 使用 Docker Compose（推荐用于并行构建）

```powershell
# 构建所有服务（并行，更快）
docker compose -f docker-compose.full.yml build --parallel

# 或者顺序构建
docker compose -f docker-compose.full.yml build
```

### 方法 3: 构建单个服务

如果需要只构建某个服务：

```powershell
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

## 📋 构建步骤详解

### 步骤 1: 检查 Docker 是否运行

```powershell
# 检查 Docker 状态
docker info
```

如果显示错误，请先启动 Docker Desktop。

### 步骤 2: 构建镜像

选择以下任一方法：

**选项 A - 使用脚本（最简单）:**
```powershell
.\docker-build.ps1
```

**选项 B - 使用 Docker Compose:**
```powershell
docker compose -f docker-compose.full.yml build --parallel
```

### 步骤 3: 验证构建结果

```powershell
# 查看所有构建的镜像
docker images | Select-String "multi-ai-agent4onlineshopping"
```

应该看到 5 个镜像：
- `multi-ai-agent4onlineshopping-tool-gateway`
- `multi-ai-agent4onlineshopping-core-mcp`
- `multi-ai-agent4onlineshopping-checkout-mcp`
- `multi-ai-agent4onlineshopping-web-app`
- `multi-ai-agent4onlineshopping-agent`

## ⏱️ 构建时间估算

- **首次构建**: 10-20 分钟（取决于网络速度）
- **后续构建**: 2-5 分钟（使用缓存）

## 🔧 构建选项

### 强制重新构建（不使用缓存）

```powershell
docker compose -f docker-compose.full.yml build --no-cache
```

### 仅构建特定服务

```powershell
docker compose -f docker-compose.full.yml build web-app
```

### 构建并启动

```powershell
docker compose -f docker-compose.full.yml up -d --build
```

## 🐛 常见问题

### 问题 1: 构建失败 - 网络错误

**症状**: 下载依赖时超时或失败

**解决方法**:
```powershell
# 重试构建
docker compose -f docker-compose.full.yml build --parallel

# 或者清理缓存后重试
docker system prune -f
docker compose -f docker-compose.full.yml build --parallel
```

### 问题 2: 构建失败 - 内存不足

**症状**: 构建过程中 Docker 崩溃

**解决方法**:
1. 打开 Docker Desktop
2. 进入 Settings → Resources
3. 增加 Memory 限制（推荐 4GB+）

### 问题 3: 构建失败 - 磁盘空间不足

**症状**: 构建失败，提示磁盘空间不足

**解决方法**:
```powershell
# 清理未使用的镜像和容器
docker system prune -a

# 查看磁盘使用情况
docker system df
```

### 问题 4: 权限错误（Linux/Mac）

**症状**: `permission denied`

**解决方法**:
```bash
# 添加执行权限
chmod +x docker-build.sh

# 或者使用 sudo（不推荐）
sudo docker compose -f docker-compose.full.yml build
```

## 📊 构建过程说明

构建过程会依次执行：

1. **Tool Gateway** (~3-5 分钟)
   - 安装 Node.js 依赖
   - 构建 TypeScript 代码
   - 创建生产镜像

2. **Core MCP Server** (~3-5 分钟)
   - 安装 Node.js 依赖
   - 构建 TypeScript 代码
   - 创建生产镜像

3. **Checkout MCP Server** (~3-5 分钟)
   - 安装 Node.js 依赖
   - 构建 TypeScript 代码
   - 创建生产镜像

4. **Web App** (~5-8 分钟)
   - 安装 Node.js 依赖
   - 构建 Next.js 应用
   - 创建生产镜像

5. **Python Agent** (~5-8 分钟)
   - 安装系统依赖
   - 安装 Python 包
   - 创建生产镜像

## ✅ 构建成功标志

构建成功时，你会看到：

```
✅ 所有镜像构建完成！

📋 查看镜像列表:
REPOSITORY                                    TAG       IMAGE ID       SIZE
multi-ai-agent4onlineshopping-tool-gateway    latest    ...           200MB
multi-ai-agent4onlineshopping-core-mcp        latest    ...           180MB
multi-ai-agent4onlineshopping-checkout-mcp    latest    ...           180MB
multi-ai-agent4onlineshopping-web-app         latest    ...           300MB
multi-ai-agent4onlineshopping-agent           latest    ...           500MB
```

## 🚀 构建完成后

构建完成后，可以启动服务：

```powershell
# 使用启动脚本
.\docker-start.ps1

# 或使用 Docker Compose
docker compose -f docker-compose.full.yml up -d
```

## 📚 相关文档

- [Docker 打包指南](./DOCKER_PACKAGE.md)
- [快速开始](./README_DOCKER.md)
- [环境变量配置](./ENV_SETUP.md)

---

**提示**: 首次构建需要下载基础镜像和依赖，请确保网络连接稳定。
