# Windows / PowerShell 快速开始

> 本文档保留 **PowerShell** 场景下的最短启动与 API 调用示例。  
> Docker 部署与运维的权威文档请以：
> - `doc/18_deployment.md`
> - `doc/19_ops_runbook.md`
> 为准（避免多处重复维护导致端口/命令不一致）。

---

## 🐳 最短启动方式（Docker）

```powershell
cp .env.example .env
# 编辑 .env，设置以下关键配置：
#
# 1) 必填：OpenAI API Key
#   OPENAI_API_KEY=sk-your-api-key-here
#
# 2) 开发环境：关闭限流（避免健康检查被 429 拦截）
#   RATE_LIMIT_ENABLED=false
#
# 3) 生产环境：开启 XOOBAY（否则数据库为空时容易"搜不到商品"）
#   XOOBAY_ENABLED=true
#   XOOBAY_API_KEY=your_key

docker compose -f docker-compose.full.yml up -d
docker compose -f docker-compose.full.yml ps
```

---

## 📋 使用前检查

### 1) 确认服务运行

```powershell
docker ps --filter "name=agent"
```

### 2) 确认环境变量（XOOBAY）

```powershell
docker exec agent-tool-gateway env | Select-String "XOOBAY"
```

---

## 🎯 通过 API 调用（推荐）

> 默认 Tool Gateway：`http://localhost:28000`  
> 默认 Web App：`http://localhost:28004`

### 1) 搜索产品

```powershell
$requestId = [guid]::NewGuid().ToString()

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
        query = "phone"
        limit = 10
    }
} | ConvertTo-Json -Depth 5

$response = Invoke-WebRequest -Uri "http://localhost:28000/tools/catalog/search_offers" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result = $response.Content | ConvertFrom-Json
$result.data.offer_ids
```

### 2) 获取产品详情（AROC）

```powershell
$requestId = [guid]::NewGuid().ToString()
$body = @{
    request_id = $requestId
    actor = @{ type = "user"; id = "your-user-id" }
    client = @{ app = "web"; version = "1.0.0" }
    params = @{
        offer_id = "xoobay_63509"
    }
} | ConvertTo-Json -Depth 5

$response = Invoke-WebRequest -Uri "http://localhost:28000/tools/catalog/get_offer_card" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result = $response.Content | ConvertFrom-Json
$result.data
```

---

## 🧪 使用测试脚本

```powershell
.\scripts\test-integration.ps1
```

---

## 🌐 通过 Web 前端

启动 web-app（如果你没有整套 up）：

```powershell
docker compose -f docker-compose.full.yml up -d web-app
```

访问：`http://localhost:28004`

---

## 📚 相关文档

- 工具端点与参数：`doc/05_tool_catalog.md`、`doc/04_tooling_spec.md`
- 部署与环境：`doc/18_deployment.md`
- 运维命令（Runbook）：`doc/19_ops_runbook.md`
- 数据架构补充说明：`doc/20_data_architecture.md`

