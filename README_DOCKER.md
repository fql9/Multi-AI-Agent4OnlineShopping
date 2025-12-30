# 🐳 Docker 快速开始

## 一键部署

### Windows (PowerShell)

```powershell
# 1. 构建所有镜像
.\docker-build.ps1

# 2. 启动所有服务
.\docker-start.ps1
```

### Linux/Mac

```bash
# 1. 构建所有镜像
chmod +x docker-build.sh
./docker-build.sh

# 2. 启动所有服务
docker compose -f docker-compose.full.yml up -d
```

## 访问服务

- **Web App**: http://localhost:3001
- **Tool Gateway**: http://localhost:3000/health
- **数据库**: localhost:5433

## 详细文档

- [完整打包指南](./DOCKER_PACKAGE.md)
- [Docker 部署指南](./DOCKER_DEPLOY.md)
- [环境变量配置](./ENV_SETUP.md)
