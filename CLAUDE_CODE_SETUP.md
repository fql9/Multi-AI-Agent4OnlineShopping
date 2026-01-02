# Claude Code 在 Cursor 中的配置与使用指南

本文档介绍如何在 Cursor IDE 中安装、配置和使用 Claude Code 插件。

## 📦 安装步骤

### 1. 安装 Claude Code 扩展

1. **打开 Cursor 扩展商店**
   - macOS: `Cmd + Shift + X`
   - Windows/Linux: `Ctrl + Shift + X`

2. **搜索安装**
   - 搜索 `Claude Code` 或 `Anthropic`
   - 选择官方发布的扩展
   - 点击 **Install**

### 2. 配置 API 密钥

#### 方法 A: 环境变量（推荐）

在 `~/.zshrc` 或 `~/.bashrc` 中添加：

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-xxxxxxxxxxxxxx"
```

重启终端或执行：

```bash
source ~/.zshrc
```

#### 方法 B: Cursor 设置

1. 打开设置: `Cmd + ,` (macOS) 或 `Ctrl + ,`
2. 搜索 "Claude" 或 "Anthropic"
3. 在 API Key 字段中输入你的密钥

### 3. 获取 API 密钥

访问 [Anthropic Console](https://console.anthropic.com/settings/keys) 创建 API 密钥：

1. 登录 Anthropic Console
2. 进入 Settings → API Keys
3. 创建新的 API 密钥
4. 复制并保存密钥

---

## 🔧 项目配置

本项目已配置以下文件以优化 Claude Code 体验：

### `.cursorrules`

项目级规则文件，告诉 Claude Code：
- 项目使用的技术栈
- 代码风格规范
- 重要的架构模式
- 关键目录结构

### `mcp-config.json`

MCP (Model Context Protocol) 服务器配置，允许 Claude Code 连接本地工具服务器。

---

## 🎯 使用方法

### 基本对话

在 Cursor 中按 `Cmd + K` (macOS) 或 `Ctrl + K` 打开 AI 对话：

```
示例 prompt：
- "解释 agents/src/graph/builder.py 的工作原理"
- "为 catalog_search_offers 工具添加错误处理"
- "重构这个函数使其更简洁"
```

### 代码生成

选中代码后按 `Cmd + K`，输入指令：

```
- "添加类型注解"
- "将这个函数转换为 async"
- "添加单元测试"
```

### 内联编辑

按 `Cmd + I` (macOS) 开启内联编辑模式：

```
- 直接在代码中描述需要的修改
- Claude 会就地生成代码
```

### 终端集成

在终端中可以使用 Claude Code 的命令：

```bash
# 如果安装了 Claude Code CLI
claude "解释这个项目的架构"
```

---

## 🔌 MCP 工具服务器

本项目包含两个 MCP 服务器，可与 Claude Code 集成：

### core-mcp

提供读操作工具：
- `catalog.search_offers` - 商品搜索
- `catalog.get_offer_card` - 获取 AROC
- `pricing.get_realtime_quote` - 实时报价
- `shipping.quote_options` - 运费报价
- `compliance.check_item` - 合规检查

### checkout-mcp

提供写操作工具（高敏感）：
- `cart.create` - 创建购物车
- `checkout.create_draft_order` - 创建草稿订单
- `evidence.create_snapshot` - 创建证据快照

### 启动 MCP 服务器

```bash
# 先启动数据库
docker compose up -d postgres

# 启动 core-mcp
cd apps/mcp-servers/core-mcp
pnpm dev

# 在另一个终端启动 checkout-mcp
cd apps/mcp-servers/checkout-mcp
pnpm dev
```

---

## 💡 常用 Prompt 示例

### 代码理解

```
"解释 LangGraph 状态机在 agents/src/graph/ 中的实现"
"这个项目如何处理 tool 调用的幂等性？"
"说明 Evidence 模式的工作原理"
```

### 代码修改

```
"在 intent/node.py 中添加对多语言的支持"
"优化 catalog.ts 的查询性能"
"为 checkout API 添加重试机制"
```

### 调试帮助

```
"这个错误可能的原因是什么？[粘贴错误信息]"
"分析这段代码可能的边界情况"
```

### 生成代码

```
"创建一个新的 MCP 工具用于价格历史查询"
"为 DraftOrder 模型添加 Pydantic 验证器"
"生成 shipping.quote_options 的单元测试"
```

---

## ⚠️ 注意事项

1. **API 成本**：Claude API 按 token 计费，复杂查询可能产生较高成本

2. **敏感信息**：不要在 prompt 中包含真实的 API 密钥或用户数据

3. **代码审查**：始终审查 AI 生成的代码，特别是涉及安全敏感操作时

4. **上下文限制**：Claude 有上下文窗口限制，大型代码库可能需要分段处理

---

## 📚 相关资源

- [Anthropic Claude 文档](https://docs.anthropic.com/)
- [Cursor 文档](https://docs.cursor.com/)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- 本项目架构文档：`doc/00_overview.md`

