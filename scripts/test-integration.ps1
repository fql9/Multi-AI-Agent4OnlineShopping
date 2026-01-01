# 测试 XOOBAY API 集成功能
# 使用: .\scripts\test-integration.ps1

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "XOOBAY API 集成功能测试" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:3000"

# 测试 1: 搜索产品（应该包含 XOOBAY 结果）
Write-Host "📦 测试 1: 搜索产品..." -ForegroundColor Cyan
try {
    $searchBody = @{
        params = @{
            query = "charger"
            limit = 10
        }
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri "$baseUrl/tools/catalog/search_offers" `
        -Method POST `
        -ContentType "application/json" `
        -Body $searchBody `
        -UseBasicParsing

    $result = $response.Content | ConvertFrom-Json
    
    if ($result.success) {
        Write-Host "✅ 搜索成功!" -ForegroundColor Green
        Write-Host "   找到产品数: $($result.data.offer_ids.Count)" -ForegroundColor White
        Write-Host "   总产品数: $($result.data.total_count)" -ForegroundColor White
        
        # 检查是否有 XOOBAY 产品
        $xoobayProducts = $result.data.offer_ids | Where-Object { $_ -like "xoobay_*" }
        if ($xoobayProducts) {
            Write-Host "   ✅ 包含 XOOBAY 产品: $($xoobayProducts.Count) 个" -ForegroundColor Green
            Write-Host "   示例: $($xoobayProducts[0])" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠️  未找到 XOOBAY 产品（可能数据库已有足够结果）" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ 搜索失败: $($result.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ 搜索测试失败: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   响应: $responseBody" -ForegroundColor Gray
    }
}

Write-Host ""

# 测试 2: 获取 XOOBAY 产品详情
Write-Host "📋 测试 2: 获取 XOOBAY 产品详情..." -ForegroundColor Cyan
try {
    $detailBody = @{
        params = @{
            offer_id = "xoobay_63660"
        }
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri "$baseUrl/tools/catalog/get_offer_card" `
        -Method POST `
        -ContentType "application/json" `
        -Body $detailBody `
        -UseBasicParsing

    $result = $response.Content | ConvertFrom-Json
    
    if ($result.success) {
        Write-Host "✅ 获取产品详情成功!" -ForegroundColor Green
        $data = $result.data
        Write-Host "   产品 ID: $($data.offer_id)" -ForegroundColor White
        Write-Host "   产品名称: $($data.titles[0].text)" -ForegroundColor White
        Write-Host "   价格: $($data.price.currency) $($data.price.amount)" -ForegroundColor White
        Write-Host "   品牌: $($data.brand.name)" -ForegroundColor White
        Write-Host "   分类: $($data.category.cat_id)" -ForegroundColor White
    } else {
        Write-Host "❌ 获取详情失败: $($result.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ 详情测试失败: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "   ⚠️  产品不存在或服务未启动" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试完成" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan
