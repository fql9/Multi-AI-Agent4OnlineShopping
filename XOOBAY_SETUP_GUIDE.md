# XOOBAY API 集成配置指南

## ✅ 步骤 1: 环境变量配置（已完成）

### 1.1 更新 env.example ✅
- 已添加 XOOBAY API 配置项

### 1.2 创建 .env 文件 ✅
- 已从 env.example 创建 .env 文件
- 已启用 XOOBAY: `XOOBAY_ENABLED=true`

### 当前配置
```env
XOOBAY_ENABLED=true
XOOBAY_API_KEY=xoobay_api_ai_geo
XOOBAY_BASE_URL=https://www.xoobay.com
XOOBAY_LANG=en
```

---

## 🔧 步骤 2: 启动服务

### 2.1 检查 Docker 服务

```powershell
# 检查 Docker 是否运行
docker ps

# 检查是否有相关容器
docker ps --filter "name=agent"
```

### 2.2 启动服务（如果未运行）

```powershell
# 启动所有服务
docker compose -f docker-compose.full.yml up -d

# 或只启动 tool-gateway
docker compose -f docker-compose.full.yml up -d tool-gateway
```

### 2.3 验证服务状态

```powershell
# 查看 tool-gateway 日志
docker logs agent-tool-gateway

# 检查服务是否正常
docker ps --filter "name=agent-tool-gateway"
```

---

## 🧪 步骤 3: 测试集成功能

### 3.1 测试搜索功能

**使用 PowerShell:**

```powershell
$body = @{
    params = @{
        query = "charger"
        limit = 10
    }
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:3000/tools/catalog/search_offers" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result = $response.Content | ConvertFrom-Json
$result | ConvertTo-Json -Depth 5
```

**使用 curl (Git Bash):**

```bash
curl -X POST http://localhost:3000/tools/catalog/search_offers \
  -H "Content-Type: application/json" \
  -d '{"params": {"query": "charger", "limit": 10}}'
```

**预期结果:**
- `success: true`
- `offer_ids` 数组包含产品 ID
- 如果有 XOOBAY 产品，ID 格式为 `xoobay_xxxxx`

### 3.2 测试产品详情

**使用 PowerShell:**

```powershell
$body = @{
    params = @{
        offer_id = "xoobay_63660"
    }
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:3000/tools/catalog/get_offer_card" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$result = $response.Content | ConvertFrom-Json
$result.data | ConvertTo-Json -Depth 5
```

**使用 curl:**

```bash
curl -X POST http://localhost:3000/tools/catalog/get_offer_card \
  -H "Content-Type: application/json" \
  -d '{"params": {"offer_id": "xoobay_63660"}}'
```

**预期结果:**
- `success: true`
- 包含完整产品信息（名称、价格、品牌、图片等）

### 3.3 使用测试脚本

```powershell
# 运行集成测试脚本
.\scripts\test-integration.ps1
```

---

## 📦 步骤 4: 数据同步（可选）

### 4.1 运行同步脚本

如果需要将 XOOBAY 产品导入数据库：

```bash
# 使用 tsx 运行（需要先安装依赖）
cd apps/tool-gateway
pnpm install
npx tsx ../../scripts/sync-xoobay-products.ts

# 或使用 Node.js（需要先编译）
pnpm build
node dist/scripts/sync-xoobay-products.js
```

### 4.2 配置定期同步

可以设置定时任务定期同步产品数据：

```bash
# Linux/Mac: 使用 cron
# 每天凌晨 2 点同步
0 2 * * * cd /path/to/project && node scripts/sync-xoobay-products.js

# Windows: 使用任务计划程序
# 创建计划任务运行同步脚本
```

---

## 🚀 步骤 5: 生产环境部署

### 5.1 更新生产环境变量

编辑 `env.prod.example` 或创建生产环境的 `.env`:

```env
XOOBAY_ENABLED=true
XOOBAY_API_KEY=xoobay_api_ai_geo
XOOBAY_BASE_URL=https://www.xoobay.com
XOOBAY_LANG=en
```

### 5.2 使用生产配置启动

```bash
# 使用生产配置
docker compose -f docker-compose.prod.yml up -d
```

### 5.3 验证生产环境

```bash
# 检查服务状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs tool-gateway
```

---

## 🔍 故障排查

### 问题 1: 服务无法启动

**检查:**
- Docker 是否运行
- 端口是否被占用
- 环境变量是否正确

**解决:**
```powershell
# 检查端口占用
netstat -ano | findstr :3000

# 重启服务
docker compose -f docker-compose.full.yml restart tool-gateway
```

### 问题 2: XOOBAY API 未生效

**检查:**
- `.env` 文件中 `XOOBAY_ENABLED=true`
- 服务是否重启
- 日志中是否有错误

**解决:**
```powershell
# 检查环境变量
docker exec agent-tool-gateway env | findstr XOOBAY

# 查看日志
docker logs agent-tool-gateway | Select-String "XOOBAY"
```

### 问题 3: API 调用失败

**检查:**
- 网络连接
- API Key 是否正确
- API 是否限流

**解决:**
- 检查防火墙设置
- 验证 API Key
- 降低调用频率

---

## 📊 验证清单

- [x] ✅ 环境变量已配置
- [x] ✅ XOOBAY API 已启用
- [ ] ⏳ 服务已启动
- [ ] ⏳ 搜索功能测试通过
- [ ] ⏳ 产品详情测试通过
- [ ] ⏳ 数据同步（可选）
- [ ] ⏳ 生产环境部署（可选）

---

## 📝 下一步

1. **启动服务**: 运行 `docker compose -f docker-compose.full.yml up -d`
2. **测试集成**: 使用测试脚本或手动测试 API
3. **验证功能**: 确认搜索和详情功能正常
4. **部署生产**: 如需部署到服务器，参考 `SERVER_DEPLOY.md`

---

**状态**: 配置完成，等待服务启动和测试
