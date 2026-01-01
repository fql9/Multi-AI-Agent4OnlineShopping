# XOOBAY API 快速配置和测试脚本
# 使用: .\scripts\setup-xoobay.ps1

$ErrorActionPreference = "Continue"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "XOOBAY API 配置和测试" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

# 步骤 1: 检查 .env 文件
Write-Host "步骤 1: 检查环境变量配置..." -ForegroundColor Cyan
if (Test-Path ".env") {
    $xoobayEnabled = Select-String -Path .env -Pattern "XOOBAY_ENABLED" | ForEach-Object { $_.Line -match "XOOBAY_ENABLED=true" }
    if ($xoobayEnabled) {
        Write-Host "✅ XOOBAY 已启用" -ForegroundColor Green
    } else {
        Write-Host "⚠️  XOOBAY 未启用，正在启用..." -ForegroundColor Yellow
        (Get-Content .env) -replace 'XOOBAY_ENABLED=false', 'XOOBAY_ENABLED=true' | Set-Content .env
        Write-Host "✅ 已启用 XOOBAY" -ForegroundColor Green
    }
} else {
    Write-Host "❌ .env 文件不存在，请先创建" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 步骤 2: 检查 Docker 服务
Write-Host "步骤 2: 检查 Docker 服务..." -ForegroundColor Cyan
try {
    $dockerRunning = docker ps 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker 正在运行" -ForegroundColor Green
        
        $toolGateway = docker ps --filter "name=agent-tool-gateway" --format "{{.Names}}" 2>&1
        if ($toolGateway) {
            Write-Host "✅ tool-gateway 容器正在运行" -ForegroundColor Green
        } else {
            Write-Host "⚠️  tool-gateway 容器未运行" -ForegroundColor Yellow
            Write-Host "   运行: docker compose -f docker-compose.full.yml up -d tool-gateway" -ForegroundColor Gray
        }
    } else {
        Write-Host "❌ Docker 未运行" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ 无法检查 Docker 状态" -ForegroundColor Red
}

Write-Host ""

# 步骤 3: 测试 API 连接
Write-Host "步骤 3: 测试 XOOBAY API 连接..." -ForegroundColor Cyan
try {
    $apiUrl = "https://www.xoobay.com/api-geo/product-list?pageNo=1&lang=en&apiKey=xoobay_api_ai_geo"
    $response = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 10
    $json = $response.Content | ConvertFrom-Json
    if ($json.code -eq 200) {
        Write-Host "✅ XOOBAY API 连接成功" -ForegroundColor Green
        Write-Host "   总产品数: $($json.data.pager.count)" -ForegroundColor Gray
    } else {
        Write-Host "❌ API 返回错误: $($json.msg)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ API 连接失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 步骤 4: 测试集成功能（如果服务运行）
Write-Host "步骤 4: 测试集成功能..." -ForegroundColor Cyan
$toolGatewayRunning = docker ps --filter "name=agent-tool-gateway" --format "{{.Names}}" 2>&1
if ($toolGatewayRunning) {
    try {
        $body = @{
            params = @{
                query = "test"
                limit = 5
            }
        } | ConvertTo-Json

        $response = Invoke-WebRequest -Uri "http://localhost:3000/tools/catalog/search_offers" `
            -Method POST `
            -ContentType "application/json" `
            -Body $body `
            -UseBasicParsing `
            -TimeoutSec 5

        $result = $response.Content | ConvertFrom-Json
        if ($result.success) {
            Write-Host "✅ 搜索功能正常" -ForegroundColor Green
            Write-Host "   找到产品: $($result.data.offer_ids.Count) 个" -ForegroundColor Gray
        } else {
            Write-Host "⚠️  搜索返回错误: $($result.error)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  无法测试集成功能（服务可能未完全启动）" -ForegroundColor Yellow
        Write-Host "   错误: $($_.Exception.Message)" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️  tool-gateway 未运行，跳过集成测试" -ForegroundColor Yellow
    Write-Host "   启动服务后运行: .\scripts\test-integration.ps1" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "配置检查完成" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "📋 下一步:" -ForegroundColor Cyan
Write-Host "   1. 如果服务未运行: docker compose -f docker-compose.full.yml up -d" -ForegroundColor White
Write-Host "   2. 测试集成功能: .\scripts\test-integration.ps1" -ForegroundColor White
Write-Host "   3. 查看详细指南: XOOBAY_SETUP_GUIDE.md`n" -ForegroundColor White
