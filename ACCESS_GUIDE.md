# 服务访问指南

## 🌐 服务访问地址

### 1. Web App (前端界面)

**地址**: http://localhost:3001

**状态**: ✅ 运行中

**如果无法访问，请尝试**:
- http://127.0.0.1:3001
- 检查浏览器控制台（F12）是否有错误
- 尝试无痕模式
- 检查防火墙设置

### 2. Tool Gateway (API 网关)

**健康检查**: http://localhost:3000/health

**状态**: ✅ 运行中

**测试命令**:
```powershell
Invoke-WebRequest -Uri http://localhost:3000/health
```

### 3. 数据库

**连接信息**:
- 主机: localhost
- 端口: 5433
- 数据库: agent_db
- 用户: agent
- 密码: agent_dev_password

**连接字符串**:
```
postgresql://agent:agent_dev_password@localhost:5433/agent_db
```

## 🔍 故障排查步骤

### 步骤 1: 检查服务是否运行

```bash
docker compose -f docker-compose.full.yml ps
```

所有服务应该显示 "Up" 状态。

### 步骤 2: 检查端口是否监听

```bash
netstat -ano | findstr ":3000 :3001"
```

应该看到端口在监听。

### 步骤 3: 测试服务响应

```powershell
# 测试 Tool Gateway
Invoke-WebRequest -Uri http://localhost:3000/health

# 测试 Web App
Invoke-WebRequest -Uri http://localhost:3001
```

### 步骤 4: 查看服务日志

```bash
# Web App 日志
docker logs agent-web-app

# Tool Gateway 日志
docker logs agent-tool-gateway

# Python Agent 日志
docker logs agent-python
```

## 🐛 常见问题

### 问题 1: 浏览器显示 "无法访问此网站"

**可能原因**:
- 防火墙阻止
- 端口被占用
- 服务未启动

**解决方法**:
```bash
# 1. 检查服务状态
docker ps | findstr "agent-web-app"

# 2. 重启服务
docker compose -f docker-compose.full.yml restart web-app

# 3. 检查端口
netstat -ano | findstr ":3001"
```

### 问题 2: 页面加载但显示空白

**可能原因**:
- JavaScript 错误
- API 连接失败
- 环境变量未配置

**解决方法**:
1. 打开浏览器开发者工具（F12）
2. 查看 Console 标签页的错误信息
3. 查看 Network 标签页的请求状态

### 问题 3: 功能不工作（按钮点击无反应）

**当前状态**: Web App 使用模拟数据，尚未连接到真实后端

**说明**: 这是正常的，Web App 目前是演示版本，使用前端模拟数据。

## 📝 当前功能状态

### ✅ 已实现

- Web App 界面显示
- 状态机可视化
- 模拟购物流程

### ⏸️ 待实现

- 连接到真实 Tool Gateway API
- 连接到 Python Agent
- 实时数据流

## 🔧 快速修复命令

```bash
# 重启所有服务
docker compose -f docker-compose.full.yml restart

# 重启特定服务
docker compose -f docker-compose.full.yml restart web-app

# 查看实时日志
docker compose -f docker-compose.full.yml logs -f web-app
```

## 📞 需要帮助？

如果以上方法都无法解决问题，请提供：

1. **浏览器错误信息**: 打开 F12 开发者工具，查看 Console 和 Network 标签
2. **服务状态**: `docker compose -f docker-compose.full.yml ps`
3. **服务日志**: `docker logs agent-web-app`

---

**提示**: 服务实际上是可以访问的（测试返回 200 状态码）。如果浏览器无法打开，可能是浏览器或网络配置问题。
