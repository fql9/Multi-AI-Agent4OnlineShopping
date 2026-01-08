# 运维 Runbook（命令手册）

> 适用场景：已在服务器上完成 Docker 部署（推荐 `docker-compose.full.yml`）。
>
> 约定：以下命令默认在仓库根目录执行，且已准备好 `.env`（参考 `.env.example`）。

---

## 0. 快速定位（我现在要做什么？）

- **启动全套服务**：
  - `docker compose -f docker-compose.full.yml up -d`
- **看服务状态**：
  - `docker compose -f docker-compose.full.yml ps`
- **看日志（全量）**：
  - `docker compose -f docker-compose.full.yml logs -f`
- **健康检查**：
  - Tool Gateway：`curl -fsS http://localhost:3000/health`
  - Core MCP：`curl -fsS http://localhost:3010/health`
  - Checkout MCP：`curl -fsS http://localhost:3011/health`
  - Python Agent：`curl -fsS http://localhost:8000/health`
- **进数据库排查**（容器内 psql，不依赖宿主机安装）：
  - `docker exec -it agent-postgres psql -U agent -d agent_db`

---

## 1. 约定与关键参数（默认值）

### 1.1 关键容器名（来自 `docker-compose.full.yml`）

- `agent-postgres`
- `agent-redis`
- `agent-tool-gateway`
- `agent-core-mcp`
- `agent-checkout-mcp`
- `agent-python`
- `agent-web-app`
- 可选工具：
  - `agent-adminer`
  - `agent-redis-commander`

### 1.2 默认端口（可通过 `.env` 覆盖）

- PostgreSQL：宿主机 `POSTGRES_PORT`（默认 5433）→ 容器 5432
- Redis：宿主机 `REDIS_PORT`（默认 6379）→ 容器 6379
- Tool Gateway：`TOOL_GATEWAY_PORT`（默认 3000）
- Core MCP：`CORE_MCP_PORT`（默认 3010）
- Checkout MCP：`CHECKOUT_MCP_PORT`（默认 3011）
- Web App：`WEB_APP_PORT`（默认 3001）
- Python Agent：`AGENT_PORT`（默认 8000）

---

## 2. 服务生命周期（Start / Stop / Restart）

### 2.1 启动/停止全套服务

```bash
# 启动（后台）
docker compose -f docker-compose.full.yml up -d

# 查看状态
docker compose -f docker-compose.full.yml ps

# 停止（保留数据卷）
docker compose -f docker-compose.full.yml down

# 停止并删除数据卷（⚠️ 会清空 PostgreSQL/Redis 数据）
docker compose -f docker-compose.full.yml down -v
```

### 2.2 重启单个服务

```bash
docker compose -f docker-compose.full.yml restart tool-gateway
docker compose -f docker-compose.full.yml restart agent
docker compose -f docker-compose.full.yml restart web-app
```

### 2.3 只启动/停止某几个服务

```bash
docker compose -f docker-compose.full.yml up -d postgres redis
docker compose -f docker-compose.full.yml up -d tool-gateway core-mcp checkout-mcp
docker compose -f docker-compose.full.yml up -d agent web-app
```

---

## 3. 日志与运行态诊断

### 3.1 查看日志

```bash
# 全量（跟随）
docker compose -f docker-compose.full.yml logs -f

# 单服务（跟随）
docker compose -f docker-compose.full.yml logs -f tool-gateway
docker compose -f docker-compose.full.yml logs -f agent
docker compose -f docker-compose.full.yml logs -f web-app

# 只看最近 N 行
docker compose -f docker-compose.full.yml logs --tail 200 tool-gateway
```

### 3.2 容器层面排查

```bash
# 列出本项目相关容器
docker ps --filter "name=agent-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 资源占用
docker stats --no-stream

# 进入容器（交互式 shell）
docker exec -it agent-tool-gateway sh
docker exec -it agent-python sh
```

---

## 4. 健康检查（Healthcheck / 端口连通）

### 4.1 HTTP 健康检查

```bash
curl -fsS http://localhost:3000/health && echo
curl -fsS http://localhost:3010/health && echo
curl -fsS http://localhost:3011/health && echo
curl -fsS http://localhost:8000/health && echo
```

### 4.2 PostgreSQL / Redis 健康检查（容器内）

```bash
docker exec -it agent-postgres pg_isready -U agent -d agent_db
docker exec -it agent-redis redis-cli -a redis_dev_password ping
```

> 如果你在 `.env` 修改了 Redis 密码，请同步替换 `redis_dev_password`。

---

## 5. 数据库运维（PostgreSQL）

### 5.1 进入 psql（容器内）

```bash
docker exec -it agent-postgres psql -U agent -d agent_db
```

### 5.2 常用 psql 命令

```sql
-- schema / tables
\dn
\dt agent.*

-- table schema
\d agent.offers
\d agent.skus
\d agent.carts
\d agent.draft_orders
\d agent.evidence_snapshots
\d agent.evidence_chunks

-- quick counts
SELECT
  (SELECT COUNT(*) FROM agent.offers) AS offers,
  (SELECT COUNT(*) FROM agent.skus) AS skus,
  (SELECT COUNT(*) FROM agent.carts) AS carts,
  (SELECT COUNT(*) FROM agent.draft_orders) AS draft_orders,
  (SELECT COUNT(*) FROM agent.evidence_snapshots) AS evidence_snapshots,
  (SELECT COUNT(*) FROM agent.evidence_chunks) AS evidence_chunks;
```

### 5.3 常用查询（命令行一把梭）

```bash
# 列表/表结构
docker exec -it agent-postgres psql -U agent -d agent_db -c "\dt agent.*"

# 近期草稿订单
docker exec -it agent-postgres psql -U agent -d agent_db -c "
SELECT id, user_id, status, payable_amount, currency, expires_at, created_at
FROM agent.draft_orders
ORDER BY created_at DESC
LIMIT 20;"
```

### 5.4 迁移、导入、同步（compose profiles）

```bash
# 数据库迁移（profile: migrate）
docker compose -f docker-compose.full.yml --profile migrate up db-migrate

# 导入种子数据（profile: seed）
docker compose -f docker-compose.full.yml --profile seed up seed-data

# XOOBAY 产品同步（profile: sync）
docker compose -f docker-compose.full.yml --profile sync up xoobay-sync
```

### 5.5 备份与恢复

```bash
# 备份（导出到当前目录）
docker exec agent-postgres pg_dump -U agent agent_db > backup.sql

# 恢复（⚠️ 会执行 SQL，注意环境）
docker exec -i agent-postgres psql -U agent agent_db < backup.sql
```

---

## 6. Redis 运维

```bash
# 进入 redis-cli（容器内）
docker exec -it agent-redis redis-cli -a redis_dev_password
```

```redis
PING
INFO
DBSIZE
CLIENT LIST
```

危险命令（谨慎）：

```redis
FLUSHALL
```

---

## 7. 运维辅助工具（可选）

```bash
# 启动 Adminer + Redis Commander
docker compose -f docker-compose.full.yml --profile tools up -d

# 关闭（只关闭工具容器）
docker compose -f docker-compose.full.yml stop adminer redis-commander
```

访问地址（按需改为服务器域名/内网 IP）：

- Adminer：`http://localhost:8080`
- Redis Commander：`http://localhost:8081`

---

## 8. 常见排障套路（Checklist）

### 8.1 “前端/Agent 报连接失败”

```bash
docker compose -f docker-compose.full.yml ps
docker compose -f docker-compose.full.yml logs --tail 200 tool-gateway
curl -fsS http://localhost:3000/health && echo
```

### 8.2 “数据库连接失败/迁移失败”

```bash
docker exec -it agent-postgres pg_isready -U agent -d agent_db
docker compose -f docker-compose.full.yml logs --tail 200 postgres
docker compose -f docker-compose.full.yml --profile migrate up db-migrate
```

### 8.3 “429/限流导致前端异常”

```bash
# 检查网关限流配置
docker exec -it agent-tool-gateway env | grep RATE_LIMIT
```

> 开发/演示环境建议 `RATE_LIMIT_ENABLED=false` 或调大 `RATE_LIMIT_MAX`。

---

## 9. 清理与回收（谨慎）

```bash
# 删除停止的容器、无用网络（不会删除数据卷）
docker system prune -f

# 查看数据卷
docker volume ls | grep pgdata || true
docker volume ls | grep redisdata || true
```

> 如需“彻底清库”，用 `docker compose -f docker-compose.full.yml down -v`（会删除 `pgdata/redisdata`）。


