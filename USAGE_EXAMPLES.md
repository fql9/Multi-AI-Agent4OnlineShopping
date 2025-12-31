# 项目使用示例

## 🎯 当前服务状态

✅ **运行中的服务**:
- `agent-tool-gateway` - API 网关 (端口 3000)
- `agent-web-app` - Web 前端 (端口 3001)
- `agent-python` - Python Agent
- `agent-postgres` - 数据库 (端口 5433)

---

## 🚀 使用方式

### 方式 1: 通过 Web 前端（最简单）

**访问地址**: http://localhost:3001

直接在浏览器中打开，使用图形界面操作。

---

### 方式 2: 通过 API 调用

#### 示例 1: 搜索产品

```powershell
# PowerShell 示例
$requestId = [guid]::NewGuid().ToString()
$body = @{
    request_id = $requestId
    actor = @{ type = "user"; id = "user-001" }
    client = @{ app = "web"; version = "1.0.0" }
    params = @{
        query = "phone"
        limit = 10
    }
} | ConvertTo-Json -Depth 5

$response = Invoke-WebRequest -Uri "http://localhost:3000/tools/catalog/search_offers" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result = $response.Content | ConvertFrom-Json
Write-Host "找到 $($result.data.offer_ids.Count) 个产品"
$result.data.offer_ids
```

#### 示例 2: 获取产品详情

```powershell
$requestId = [guid]::NewGuid().ToString()
$body = @{
    request_id = $requestId
    actor = @{ type = "user"; id = "user-001" }
    client = @{ app = "web"; version = "1.0.0" }
    params = @{
        offer_id = "xoobay_63509"
    }
} | ConvertTo-Json -Depth 5

$response = Invoke-WebRequest -Uri "http://localhost:3000/tools/catalog/get_offer_card" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result = $response.Content | ConvertFrom-Json
$result.data | ConvertTo-Json -Depth 10
```

---

### 方式 3: 使用 Python Agent

Python Agent 已经运行，可以通过 LangGraph 调用工具。

---

## 📝 快速测试

### 测试搜索功能

```powershell
.\scripts\test-integration.ps1
```

### 测试 XOOBAY API

```powershell
# 直接测试 API 连接
$url = "https://www.xoobay.com/api-geo/product-list?pageNo=1&lang=en&apiKey=xoobay_api_ai_geo"
$response = Invoke-WebRequest -Uri $url -UseBasicParsing
$json = $response.Content | ConvertFrom-Json
Write-Host "总产品数: $($json.data.pager.count)"
```

---

## 🌐 Web 前端访问

**地址**: http://localhost:3001

在浏览器中打开即可使用图形界面。

---

## 📊 API 端点列表

### Catalog（产品目录）

1. **搜索产品**
   - `POST /tools/catalog/search_offers`
   - 支持 XOOBAY API 自动补充

2. **获取产品详情**
   - `POST /tools/catalog/get_offer_card`
   - 支持从 XOOBAY API 实时获取

3. **获取库存**
   - `POST /tools/catalog/get_availability`

### 其他工具

- Pricing（价格计算）
- Shipping（物流）
- Compliance（合规检查）
- Checkout（结账）
- Evidence（证据记录）

---

## 🔍 查看日志

```powershell
# 查看 tool-gateway 日志
docker logs agent-tool-gateway -f

# 查看 XOOBAY API 调用
docker logs agent-tool-gateway | Select-String "XOOBAY"
```

---

## ✅ 开始使用

1. **访问 Web 前端**: http://localhost:3001
2. **或使用 API**: 参考上面的示例
3. **查看文档**: `QUICK_START.md` 获取更多信息

---

**准备好了！开始使用吧！** 🚀
