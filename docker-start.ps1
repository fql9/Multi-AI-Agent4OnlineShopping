# Docker 一键启动脚本 (PowerShell)
# 用于启动所有服务

Write-Host "🚀 启动所有 Docker 服务..." -ForegroundColor Cyan
Write-Host ""

# 检查 Docker 是否运行
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker 未运行，请先启动 Docker Desktop" -ForegroundColor Red
    exit 1
}

# 启动所有服务
Write-Host "📦 启动服务..." -ForegroundColor Yellow
docker compose -f docker-compose.full.yml up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ 所有服务启动成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 服务状态:" -ForegroundColor Cyan
    docker compose -f docker-compose.full.yml ps
    Write-Host ""
    Write-Host "🌐 访问地址:" -ForegroundColor Cyan
    Write-Host "   Web App: http://localhost:3001" -ForegroundColor Green
    Write-Host "   Tool Gateway: http://localhost:3000/health" -ForegroundColor Green
    Write-Host "   数据库: localhost:5433" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 查看日志:" -ForegroundColor Cyan
    Write-Host "   docker compose -f docker-compose.full.yml logs -f"
    Write-Host ""
} else {
    Write-Host "❌ 服务启动失败" -ForegroundColor Red
    exit 1
}
