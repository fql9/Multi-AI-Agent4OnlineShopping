# 故障排查指南

## 🚨 最常见问题：429 错误 / 健康检查失败

### 症状
- Docker 容器状态显示 `unhealthy`
- 前端报 429 Too Many Requests 错误
- 健康检查 `/health` 返回 429

### 原因
Rate Limiting 把 `/health` 健康检查也计入限流，导致 Docker 健康检查被 429 拦截。

### 解决方案

```bash
# 1. 检查当前限流配置
docker exec agent-tool-gateway env | grep RATE_LIMIT

# 2. 开发环境：在 .env 中关闭限流
RATE_LIMIT_ENABLED=false

# 3. 生产环境：提高限流阈值
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=1000

# 4. 重启服务
docker compose -f docker-compose.full.yml restart tool-gateway
```

---

## 🔍 服务访问问题排查

### 默认端口（与 `doc/18_deployment.md` / `doc/19_ops_runbook.md` 保持一致）

- Tool Gateway：`http://localhost:28000`
- Core MCP：`http://localhost:28001`
- Checkout MCP：`http://localhost:28002`
- Python Agent：`http://localhost:28003`
- Web App：`http://localhost:28004`

### 如果浏览器访问不了，可能的原因和解决方法

#### 1. 服务是否真的在运行（第一优先级）

```bash
# 应该看到 postgres/redis/tool-gateway/core-mcp/checkout-mcp/agent/web-app
docker compose -f docker-compose.full.yml ps
```

如果某个容器一直 `Restarting` 或 `Exited`：

```bash
docker compose -f docker-compose.full.yml logs --tail 200 web-app
docker compose -f docker-compose.full.yml logs --tail 200 tool-gateway
docker compose -f docker-compose.full.yml logs --tail 200 agent
```

#### 2. 端口是否被占用 / 映射是否正确

先看容器端口映射（以 web-app 为例）：

```bash
docker port agent-web-app
```

再检查宿主机端口占用（按你的 OS 选一种）：

```bash
# macOS
lsof -nP -iTCP:28004 -sTCP:LISTEN || true

# Linux
ss -ltnp | grep ':28004' || true

# Windows (PowerShell)
netstat -ano | findstr ":28004"
```

#### 3. 健康检查（HTTP）

```bash
curl -fsS http://localhost:28000/health && echo
curl -fsS http://localhost:28001/health && echo
curl -fsS http://localhost:28002/health && echo
curl -fsS http://localhost:28003/health && echo
```

如果 `28000/health` 频繁返回 429，优先按本文顶部“429/健康检查失败”处理（开发环境直接关限流）。

#### 4. Docker 网络 / 容器名冲突（同一台机器重复部署时常见）

`docker-compose.full.yml` 使用了固定的 `container_name: agent-...`。如果你在同一台机器上重复部署/切换目录运行，容易因容器名冲突导致启动失败。

```bash
# 建议先彻底停掉旧的那套（保留数据卷）
docker compose -f docker-compose.full.yml down --remove-orphans
```

---

## 🧪 快速自检（最少命令）

```bash
docker compose -f docker-compose.full.yml ps
curl -fsS http://localhost:28000/health && echo
curl -fsSI http://localhost:28004 | head -n 15
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
