# 故障排查指南

## 🔍 服务访问问题排查

### 当前服务状态

根据测试，服务实际上是可以访问的：

- ✅ **Tool Gateway** (http://localhost:3000/health) - 返回 200 状态码
- ✅ **Web App** (http://localhost:3001) - 返回 200 状态码，内容长度 10893 字节

### 如果浏览器访问不了，可能的原因和解决方法

#### 1. 浏览器访问问题

**症状**: 浏览器无法打开 http://localhost:3001

**解决方法**:

```bash
# 检查服务是否真的在运行
docker compose -f docker-compose.full.yml ps

# 检查端口是否被占用
netstat -ano | findstr ":3001"

# 尝试使用 IP 地址访问
http://127.0.0.1:3001
```

#### 2. 防火墙阻止

**症状**: 服务运行但无法访问

**解决方法**:

```powershell
# Windows 防火墙 - 检查是否阻止了端口
# 打开 Windows Defender 防火墙设置
# 允许端口 3000 和 3001 通过防火墙
```

#### 3. Docker 网络问题

**症状**: 容器运行但无法从主机访问

**解决方法**:

```bash
# 检查端口映射
docker ps | findstr "3000 3001"

# 应该看到类似：
# 0.0.0.0:3000->3000/tcp
# 0.0.0.0:3001->3001/tcp
```

#### 4. 服务启动但立即退出

**症状**: 容器状态显示 "Restarting" 或 "Exited"

**解决方法**:

```bash
# 查看详细日志
docker logs agent-web-app
docker logs agent-tool-gateway

# 重启服务
docker compose -f docker-compose.full.yml restart web-app
```

## 🧪 测试服务访问

### 方法 1: 使用 PowerShell 测试

```powershell
# 测试 Tool Gateway
Invoke-WebRequest -Uri http://localhost:3000/health

# 测试 Web App
Invoke-WebRequest -Uri http://localhost:3001
```

### 方法 2: 使用浏览器

- Tool Gateway: http://localhost:3000/health
- Web App: http://localhost:3001

### 方法 3: 使用 curl (如果已安装)

```bash
curl http://localhost:3000/health
curl http://localhost:3001
```

## 🔧 常见问题修复

### 问题 1: Web App 无法访问

**检查步骤**:

```bash
# 1. 检查容器状态
docker ps | findstr agent-web-app

# 2. 查看日志
docker logs agent-web-app

# 3. 检查端口映射
docker port agent-web-app

# 4. 重启服务
docker compose -f docker-compose.full.yml restart web-app
```

### 问题 2: Tool Gateway 返回 400 错误

**可能原因**: 请求格式不正确

**解决方法**: 检查请求是否符合 API 规范（见 `doc/04_tooling_spec.md`）

### 问题 3: 端口被占用

**症状**: 启动失败，提示端口已被占用

**解决方法**:

```bash
# 查找占用端口的进程
netstat -ano | findstr ":3001"

# 修改 docker-compose.full.yml 中的端口映射
# 例如改为 3002:3001
```

### 问题 4: 容器无法连接到数据库

**症状**: 服务启动但无法连接数据库

**解决方法**:

```bash
# 检查数据库是否运行
docker ps | findstr agent-postgres

# 检查网络连接
docker network inspect agent-network

# 测试数据库连接
docker exec agent-postgres psql -U agent -d agent_db -c "SELECT 1;"
```

## 📊 服务健康检查

### 快速检查脚本

```powershell
# 检查所有服务
Write-Host "=== 服务状态检查 ===" -ForegroundColor Cyan

# Tool Gateway
try {
    $r = Invoke-WebRequest -Uri http://localhost:3000/health -UseBasicParsing
    Write-Host "✅ Tool Gateway: OK ($($r.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Tool Gateway: FAILED" -ForegroundColor Red
}

# Web App
try {
    $r = Invoke-WebRequest -Uri http://localhost:3001 -UseBasicParsing
    Write-Host "✅ Web App: OK ($($r.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Web App: FAILED" -ForegroundColor Red
}

# 数据库
$db = docker exec agent-postgres psql -U agent -d agent_db -c "SELECT 1;" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database: OK" -ForegroundColor Green
} else {
    Write-Host "❌ Database: FAILED" -ForegroundColor Red
}
```

## 🆘 获取帮助

如果以上方法都无法解决问题：

1. **查看完整日志**:
   ```bash
   docker compose -f docker-compose.full.yml logs > all-logs.txt
   ```

2. **检查容器状态**:
   ```bash
   docker compose -f docker-compose.full.yml ps -a
   ```

3. **重启所有服务**:
   ```bash
   docker compose -f docker-compose.full.yml down
   docker compose -f docker-compose.full.yml up -d
   ```

## 📝 报告问题

如果问题持续存在，请提供：

1. 服务状态: `docker compose -f docker-compose.full.yml ps`
2. 相关日志: `docker logs [service-name]`
3. 错误信息: 浏览器或命令行返回的具体错误
4. 访问方式: 浏览器、curl、还是其他方式
