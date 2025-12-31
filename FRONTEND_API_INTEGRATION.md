# 前端 API 集成完成

## ✅ 已完成的修改

### 问题
前端 Web 应用之前使用的是**模拟数据（mock data）**，无论输入什么需求，都返回固定的产品方案。

### 解决方案
修改了 `apps/web-app/src/store/shopping.ts`，让前端真正调用 `tool-gateway` 的 API：

1. **真实 API 调用**
   - 在 `candidate` agent 步骤中，调用 `catalog.search_offers` API
   - 根据用户查询提取关键词（phone, charger, laptop, power bank 等）
   - 获取真实的产品列表

2. **产品详情获取**
   - 对每个产品 ID，调用 `catalog.get_offer_card` API
   - 获取产品的完整信息（标题、价格、品牌、评分等）

3. **动态方案生成**
   - 使用真实产品数据生成购买方案
   - 不同查询会返回不同的产品

---

## 🎯 功能说明

### 支持的查询关键词

前端会自动从用户输入中提取关键词：

- `phone` → 搜索 "phone"
- `charger` → 搜索 "charger"
- `laptop` → 搜索 "laptop"
- `power` → 搜索 "power bank"
- 其他 → 使用查询的前两个词

### API 调用流程

1. **用户输入查询** → 前端提取关键词
2. **调用 `catalog.search_offers`** → 获取产品 ID 列表
3. **调用 `catalog.get_offer_card`** → 获取前 3 个产品的详情
4. **生成购买方案** → 基于真实产品数据

---

## 🧪 测试方法

### 1. 访问前端

打开浏览器访问：http://localhost:3001

### 2. 测试不同查询

尝试以下不同的查询，应该返回不同的产品：

- **"I need a phone charger"** → 应该返回充电器相关产品
- **"I want to buy a laptop"** → 应该返回笔记本相关产品
- **"Looking for a power bank"** → 应该返回移动电源相关产品
- **"Wireless charger for iPhone"** → 应该返回无线充电器相关产品

### 3. 验证结果

- ✅ 每次查询应该返回不同的产品
- ✅ 产品信息来自 XOOBAY API（产品 ID 以 `xoobay_` 开头）
- ✅ 产品标题、价格、品牌等信息是真实的

---

## 📝 技术细节

### API 端点

- **搜索产品**: `POST http://localhost:3000/tools/catalog/search_offers`
- **获取产品详情**: `POST http://localhost:3000/tools/catalog/get_offer_card`

### 请求格式

```json
{
  "request_id": "uuid",
  "actor": { "type": "user", "id": "web-user" },
  "client": { "app": "web", "version": "1.0.0" },
  "params": {
    "query": "phone",
    "limit": 10
  }
}
```

### 错误处理

如果 API 调用失败，前端会：
1. 记录错误日志
2. 回退到使用 mock 数据（确保用户体验）
3. 在工具调用记录中显示错误信息

---

## 🔍 查看日志

### 前端日志（浏览器控制台）

打开浏览器开发者工具（F12），查看 Console 标签：
- API 调用成功/失败信息
- 产品数据

### 后端日志

```powershell
# 查看 tool-gateway 日志
docker logs agent-tool-gateway -f | Select-String "catalog"

# 查看 XOOBAY API 调用
docker logs agent-tool-gateway -f | Select-String "XOOBAY"
```

---

## ✅ 验证清单

- [x] 前端已重新构建
- [x] web-app 服务已重启
- [x] API 调用逻辑已实现
- [x] 错误处理已添加
- [x] 不同查询返回不同产品

---

## 🎉 现在可以测试了！

1. 打开 http://localhost:3001
2. 输入不同的需求
3. 查看返回的产品是否不同
4. 检查产品信息是否来自 XOOBAY API

**如果还有问题，请查看浏览器控制台和 Docker 日志！**
