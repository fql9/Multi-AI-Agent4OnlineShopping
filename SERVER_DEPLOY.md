# 🚀 服务器部署指南

本指南将帮助你将项目部署到生产服务器上。

## 📋 前置要求

### 服务器要求

- **操作系统**: Linux (Ubuntu 20.04+ / CentOS 7+ / Debian 10+)
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **内存**: 至少 4GB RAM（推荐 8GB+）
- **磁盘空间**: 至少 20GB 可用空间
- **CPU**: 2 核心以上（推荐 4 核心+）

### 网络要求

- 开放端口：
  - `3000` - Tool Gateway
  - `3001` - Web App
  - `5432` - PostgreSQL（建议仅内网访问）
  - `3010` - Core MCP（可选）
  - `3011` - Checkout MCP（可选）

## 🔧 服务器准备

### 1. 安装 Docker 和 Docker Compose

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker compose version
```

### 2. 克隆项目

```bash
# 克隆项目
git clone https://github.com/jhx666oo/Multi-AI-Agent4OnlineShopping.git
cd Multi-AI-Agent4OnlineShopping
```

### 3. 配置环境变量

```bash
# 复制生产环境变量模板
cp env.prod.example .env

# 编辑环境变量
nano .env
# 或使用 vim
vim .env
```

**重要配置项**：

```env
# 数据库密码（必须修改为强密码）
DB_PASSWORD=your-very-strong-password-here

# LLM API Key
OPENAI_API_KEY=your-api-key-here

# Web App 访问地址（改为服务器 IP 或域名）
NEXT_PUBLIC_TOOL_GATEWAY_URL=http://your-server-ip:3000

# CORS 配置（允许的前端域名）
CORS_ORIGINS=http://your-server-ip:3001,https://yourdomain.com
```

## 🚀 部署步骤

### 方法 1: 使用生产配置（推荐）

```bash
# 1. 构建所有镜像
docker compose -f docker-compose.prod.yml build

# 2. 启动所有服务
docker compose -f docker-compose.prod.yml up -d

# 3. 查看服务状态
docker compose -f docker-compose.prod.yml ps

# 4. 查看日志
docker compose -f docker-compose.prod.yml logs -f
```

### 方法 2: 使用完整配置（开发/测试）

```bash
# 使用 docker-compose.full.yml（适合测试环境）
docker compose -f docker-compose.full.yml up -d --build
```

## 🔍 验证部署

### 1. 检查服务状态

```bash
docker compose -f docker-compose.prod.yml ps
```

所有服务应该显示 "Up" 状态。

### 2. 测试服务访问

```bash
# 测试 Tool Gateway
curl http://localhost:3000/health

# 测试 Web App
curl http://localhost:3001

# 测试数据库连接
docker exec agent-postgres-prod psql -U agent -d agent_db -c "SELECT 1;"
```

### 3. 检查日志

```bash
# 查看所有服务日志
docker compose -f docker-compose.prod.yml logs -f

# 查看特定服务日志
docker compose -f docker-compose.prod.yml logs -f tool-gateway
docker compose -f docker-compose.prod.yml logs -f web-app
docker compose -f docker-compose.prod.yml logs -f agent
```

## 🔐 安全配置

### 1. 防火墙配置

```bash
# Ubuntu/Debian (UFW)
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
sudo ufw enable

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

### 2. 数据库安全

- **不要暴露数据库端口到公网**（仅内网访问）
- **使用强密码**
- **定期备份数据库**

### 3. 启用认证（可选）

在 `.env` 文件中：

```env
AUTH_ENABLED=true
JWT_SECRET=your-very-secure-jwt-secret-key
```

## 🌐 使用 Nginx 反向代理（推荐）

### 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

### 配置 Nginx

创建配置文件 `/etc/nginx/sites-available/multi-ai-agent`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Web App
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Tool Gateway API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/multi-ai-agent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 📊 监控和维护

### 查看资源使用

```bash
# 查看容器资源使用
docker stats

# 查看磁盘使用
docker system df
```

### 备份数据库

```bash
# 创建备份
docker exec agent-postgres-prod pg_dump -U agent agent_db > backup_$(date +%Y%m%d).sql

# 恢复备份
docker exec -i agent-postgres-prod psql -U agent agent_db < backup_20251230.sql
```

### 更新服务

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重新构建镜像
docker compose -f docker-compose.prod.yml build

# 3. 重启服务
docker compose -f docker-compose.prod.yml up -d

# 4. 清理旧镜像（可选）
docker system prune -a
```

## 🐛 故障排查

### 服务无法启动

```bash
# 查看详细日志
docker compose -f docker-compose.prod.yml logs [service-name]

# 检查端口占用
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :3001
```

### 数据库连接失败

```bash
# 检查数据库是否运行
docker ps | grep postgres

# 测试数据库连接
docker exec agent-postgres-prod psql -U agent -d agent_db -c "SELECT 1;"

# 检查网络
docker network inspect agent-network-prod
```

### 内存不足

```bash
# 查看内存使用
free -h

# 如果内存不足，可以：
# 1. 增加服务器内存
# 2. 减少服务资源限制（在 docker-compose.prod.yml 中）
# 3. 只启动必要的服务
```

## 📝 生产环境检查清单

- [ ] 修改数据库密码为强密码
- [ ] 配置正确的 `NEXT_PUBLIC_TOOL_GATEWAY_URL`
- [ ] 配置 CORS 允许的域名
- [ ] 配置防火墙规则
- [ ] 设置数据库备份计划
- [ ] 配置日志轮转
- [ ] 设置监控和告警（可选）
- [ ] 配置 SSL/TLS 证书（如果使用 HTTPS）
- [ ] 测试所有服务功能
- [ ] 文档化部署流程

## 🎯 快速部署脚本

创建 `deploy.sh`：

```bash
#!/bin/bash
set -e

echo "🚀 开始部署..."

# 检查环境变量文件
if [ ! -f .env ]; then
    echo "❌ .env 文件不存在，请先配置环境变量"
    exit 1
fi

# 构建镜像
echo "📦 构建 Docker 镜像..."
docker compose -f docker-compose.prod.yml build

# 启动服务
echo "🚀 启动服务..."
docker compose -f docker-compose.prod.yml up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo "📊 服务状态:"
docker compose -f docker-compose.prod.yml ps

echo "✅ 部署完成！"
echo "🌐 访问地址:"
echo "   Web App: http://$(hostname -I | awk '{print $1}'):3001"
echo "   Tool Gateway: http://$(hostname -I | awk '{print $1}'):3000/health"
```

使用：

```bash
chmod +x deploy.sh
./deploy.sh
```

## 📚 相关文档

- [Docker 打包指南](./DOCKER_PACKAGE.md)
- [构建指南](./BUILD_GUIDE.md)
- [环境变量配置](./ENV_SETUP.md)
- [故障排查](./TROUBLESHOOTING.md)

---

**提示**: 首次部署建议先在测试环境验证，确认无误后再部署到生产环境。
