#!/bin/bash
# Docker 一键构建脚本
# 用于构建所有服务的 Docker 镜像

set -e

echo "🚀 开始构建所有 Docker 镜像..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 构建所有服务
echo -e "${YELLOW}📦 构建 Tool Gateway...${NC}"
docker compose -f docker-compose.full.yml build tool-gateway

echo -e "${YELLOW}📦 构建 Core MCP Server...${NC}"
docker compose -f docker-compose.full.yml build core-mcp

echo -e "${YELLOW}📦 构建 Checkout MCP Server...${NC}"
docker compose -f docker-compose.full.yml build checkout-mcp

echo -e "${YELLOW}📦 构建 Web App...${NC}"
docker compose -f docker-compose.full.yml build web-app

echo -e "${YELLOW}📦 构建 Python Agent...${NC}"
docker compose -f docker-compose.full.yml build agent

echo ""
echo -e "${GREEN}✅ 所有镜像构建完成！${NC}"
echo ""
echo "📋 查看镜像列表:"
docker images | grep multi-ai-agent4onlineshopping

echo ""
echo "🚀 启动所有服务:"
echo "   docker compose -f docker-compose.full.yml up -d"
echo ""
echo "📊 查看服务状态:"
echo "   docker compose -f docker-compose.full.yml ps"
echo ""
