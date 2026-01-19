# Docker 一键构建脚本 (PowerShell)
# 用于构建所有服务的 Docker 镜像

Write-Host "🚀 开始构建所有 Docker 镜像..." -ForegroundColor Cyan
Write-Host ""

# 构建所有服务
Write-Host "📦 构建 Tool Gateway..." -ForegroundColor Yellow
docker compose -f docker-compose.full.yml build tool-gateway
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "📦 构建 Core MCP Server..." -ForegroundColor Yellow
docker compose -f docker-compose.full.yml build core-mcp
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "📦 构建 Checkout MCP Server..." -ForegroundColor Yellow
docker compose -f docker-compose.full.yml build checkout-mcp
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "📦 构建 Web App..." -ForegroundColor Yellow
docker compose -f docker-compose.full.yml build web-app
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "📦 构建 Python Agent..." -ForegroundColor Yellow
docker compose -f docker-compose.full.yml build agent
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "✅ 所有镜像构建完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📋 查看镜像列表:" -ForegroundColor Cyan
docker images | Select-String "multi-ai-agent4onlineshopping"

Write-Host ""
Write-Host "🚀 启动所有服务:" -ForegroundColor Cyan
Write-Host "   docker compose -f docker-compose.full.yml up -d"
Write-Host ""
Write-Host "📊 查看服务状态:" -ForegroundColor Cyan
Write-Host "   docker compose -f docker-compose.full.yml ps"
Write-Host ""
