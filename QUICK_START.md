# 🚀 快速开始指南

## ✅ 当前状态

- ✅ XOOBAY API 已集成
- ✅ 服务已配置
- ✅ 可以开始使用

---

## 📋 使用前检查

### 1. 确认服务运行

```powershell
# 检查服务状态
docker ps --filter "name=agent"

# 应该看到：
# - agent-postgres (数据库)
# - agent-tool-gateway (API 网关)
```

### 2. 确认环境变量

```powershell
# 检查 XOOBAY 配置
docker exec agent-tool-gateway env | Select-String "XOOBAY"
```

应该看到：
- `XOOBAY_ENABLED=true`
- `XOOBAY_API_KEY=xoobay_api_ai_geo`
- `XOOBAY_BASE_URL=https://www.xoobay.com`

---

## 🎯 使用方式

### 方式 1: 通过 API 调用（推荐）

#### 搜索产品

```powershell
# 生成请求 ID
$requestId = [guid]::NewGuid().ToString()

# 构建请求
$body = @{
    request_id = $requestId
    actor = @{
        type = "user"
        id = "your-user-id"
    }
    client = @{
        app = "web"
        version = "1.0.0"
    }
    params = @{
        query = "phone"      # 搜索关键词
        limit = 10           # 返回数量
    }
} | ConvertTo-Json -Depth 5

# 发送请求
$response = Invoke-WebRequest -Uri "http://localhost:3000/tools/catalog/search_offers" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

# 查看结果
$result = $response.Content | ConvertFrom-Json
$result.data.offer_ids
```

#### 获取产品详情

```powershell
$requestId = [guid]::NewGuid().ToString()
$body = @{
    request_id = $requestId
    actor = @{ type = "user"; id = "your-user-id" }
    client = @{ app = "web"; version = "1.0.0" }
    params = @{
        offer_id = "xoobay_63509"  # 产品 ID
    }
} | ConvertTo-Json -Depth 5

$response = Invoke-WebRequest -Uri "http://localhost:3000/tools/catalog/get_offer_card" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result = $response.Content | ConvertFrom-Json
$result.data
```

### 方式 2: 使用测试脚本

```powershell
# 运行集成测试
.\scripts\test-integration.ps1
```

### 方式 3: 通过 Web 前端

如果启动了 web-app 服务：

```powershell
# 启动前端
docker compose -f docker-compose.full.yml up -d web-app

# 访问
# http://localhost:3001
```

---

## 📊 API 端点

### 1. 搜索产品

**端点**: `POST /tools/catalog/search_offers`

**参数**:
- `query` (string): 搜索关键词
- `limit` (number): 返回数量，默认 50，最大 100
- `offset` (number): 偏移量，默认 0
- `category_id` (string, 可选): 分类 ID
- `price_min` (number, 可选): 最低价格
- `price_max` (number, 可选): 最高价格

**返回**:
```json
{
  "ok": true,
  "data": {
    "offer_ids": ["xoobay_63509", "xoobay_63492", ...],
    "scores": [0.8, 0.7, ...],
    "total_count": 1067,
    "has_more": true
  }
}
```

### 2. 获取产品详情

**端点**: `POST /tools/catalog/get_offer_card`

**参数**:
- `offer_id` (string): 产品 ID

**返回**:
```json
{
  "ok": true,
  "data": {
    "offer_id": "xoobay_63509",
    "titles": [{"lang": "en", "text": "..."}],
    "price": {"amount": 2, "currency": "USD"},
    "brand": {"name": "XOOBAY"},
    ...
  }
}
```

### 3. 获取库存状态

**端点**: `POST /tools/catalog/get_availability`

**参数**:
- `offer_id` (string, 可选): 产品 ID
- `sku_id` (string, 可选): SKU ID

---

## 🔍 实际使用示例

### 示例 1: 搜索手机相关产品

```powershell
$requestId = [guid]::NewGuid().ToString()
$body = @{
    request_id = $requestId
    actor = @{ type = "user"; id = "user-001" }
    client = @{ app = "web"; version = "1.0.0" }
    params = @{
        query = "phone"
        limit = 20
    }
} | ConvertTo-Json -Depth 5

$response = Invoke-WebRequest -Uri "http://localhost:3000/tools/catalog/search_offers" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result = $response.Content | ConvertFrom-Json

# 显示结果
Write-Host "找到 $($result.data.offer_ids.Count) 个产品"
$result.data.offer_ids | ForEach-Object { Write-Host "  - $_" }
```

### 示例 2: 获取产品完整信息

```powershell
# 使用示例 1 中的产品 ID
$productId = "xoobay_63509"

$requestId = [guid]::NewGuid().ToString()
$body = @{
    request_id = $requestId
    actor = @{ type = "user"; id = "user-001" }
    client = @{ app = "web"; version = "1.0.0" }
    params = @{ offer_id = $productId }
} | ConvertTo-Json -Depth 5

$response = Invoke-WebRequest -Uri "http://localhost:3000/tools/catalog/get_offer_card" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result = $response.Content | ConvertFrom-Json

# 显示产品信息
$data = $result.data
Write-Host "产品名称: $($data.titles[0].text)"
Write-Host "价格: $($data.price.currency) $($data.price.amount)"
Write-Host "品牌: $($data.brand.name)"
```

---

## 🛠️ 启动所有服务

如果需要启动所有服务：

```powershell
# 启动所有服务
docker compose -f docker-compose.full.yml up -d

# 检查服务状态
docker compose -f docker-compose.full.yml ps

# 查看日志
docker compose -f docker-compose.full.yml logs -f tool-gateway
```

---

## 📝 常用命令

### 服务管理

```powershell
# 启动服务
docker compose -f docker-compose.full.yml up -d

# 停止服务
docker compose -f docker-compose.full.yml down

# 重启服务
docker compose -f docker-compose.full.yml restart tool-gateway

# 查看日志
docker logs agent-tool-gateway -f
```

### 测试 API

```powershell
# 健康检查
Invoke-WebRequest -Uri "http://localhost:3000/health"

# 测试搜索
.\scripts\test-integration.ps1
```

---

## 🎯 下一步

1. **开始使用 API**: 使用上面的示例代码
2. **集成到前端**: 如果使用 web-app，可以调用这些 API
3. **集成到 Agent**: Python Agent 可以通过 tool-gateway 调用
4. **监控日志**: 查看 XOOBAY API 调用情况

---

## 📚 相关文档

- **架构说明**: `ARCHITECTURE_EXPLANATION.md`
- **集成状态**: `XOOBAY_INTEGRATION_STATUS.md`
- **配置指南**: `XOOBAY_SETUP_GUIDE.md`
- **API 测试**: `XOOBAY_API_TEST_RESULT.md`

---

**准备好了吗？开始使用吧！** 🚀
