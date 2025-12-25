# 12｜MCP 设计（落地版）：分阶段拆分 + 权限边界 + 可审计

> 这里的 MCP 指 Model Context Protocol：为模型/Agent 提供工具与资源的协议与工具服务器。  
> 本文档给出 **MVP → 中期 → 成熟期** 的分阶段拆分策略，避免一开始就过度复杂。

---

## 核心原则

1. **MVP 极简**：1-2 个 MCP Server 即可跑通核心链路
2. **权限边界 = 风控边界**：高敏操作（checkout/payment）必须单独分离
3. **Contract First**：所有工具先定义 schema，后实现
4. **可审计**：所有调用必须可追溯

---

## 一、分阶段 MCP 拆分

### MVP 阶段：2 个 MCP Server

```
┌─────────────────────────────────────────────────────────────┐
│                      Tool Gateway                            │
│  (Envelope / 鉴权 / 幂等 / 限流 / 审计)                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌─────────────────────┐   ┌─────────────────────┐
│     core-mcp        │   │   checkout-mcp      │
│  (catalog/pricing/  │   │  (cart/checkout/    │
│   shipping/         │   │   payment/evidence) │
│   compliance/tax)   │   │                     │
│                     │   │   ⚠️ 高敏感          │
│   🔵 读为主         │   │   🔴 写操作          │
└─────────────────────┘   └─────────────────────┘
```

| MCP Server | 包含工具 | 权限 |
|------------|----------|------|
| **core-mcp** | catalog.*, pricing.*, shipping.*, compliance.*, tax.*, knowledge.* | 读为主 |
| **checkout-mcp** | cart.*, checkout.*, payment.*, evidence.* | 写操作，高敏感 |

### 中期阶段：4 个 MCP Server

```
core-mcp 拆分为：
├── catalog-mcp      # 商品检索、AROC
├── pricing-mcp      # 报价、优惠
├── logistics-mcp    # 物流、地址
└── compliance-mcp   # 合规、税费

checkout-mcp 保持：
└── checkout-mcp     # 购物车、订单、支付、证据
```

### 成熟期：按需细分

```
├── catalog-mcp
├── pricing-mcp
├── logistics-mcp
├── compliance-mcp
├── tax-mcp          # 税费单独（复杂场景）
├── checkout-mcp
├── payment-mcp      # 支付单独（多支付渠道）
├── knowledge-mcp    # RAG 检索
├── evidence-mcp     # 证据管理
└── support-mcp      # 售后
```

---

## 二、Tool Gateway（必须存在于 MCP 前）

### 职责

| 功能 | 说明 |
|------|------|
| **Envelope 校验** | 验证统一请求格式（见 `doc/04_tooling_spec.md`） |
| **鉴权 / Scope** | 验证 Agent/用户是否有权调用该工具 |
| **幂等** | idempotency_key 校验，防止重复写操作 |
| **限流** | 按用户/Agent/工具限流 |
| **统一错误码** | 上游错误映射为标准错误码 |
| **审计** | 工具调用日志 + trace |

### 实现示例（TypeScript + Fastify）

```typescript
// apps/tool-gateway/src/middleware/envelope.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const EnvelopeSchema = z.object({
  request_id: z.string().uuid(),
  actor: z.object({
    type: z.enum(['user', 'agent', 'system']),
    id: z.string(),
  }),
  user_id: z.string(),
  session_id: z.string().optional(),
  locale: z.string().default('en-US'),
  currency: z.string().default('USD'),
  trace: z.object({
    span_id: z.string(),
    parent_span_id: z.string().optional(),
  }).optional(),
  idempotency_key: z.string().optional(),
  dry_run: z.boolean().default(false),
});

export async function envelopeMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const result = EnvelopeSchema.safeParse(request.body);
  if (!result.success) {
    return reply.code(400).send({
      ok: false,
      error: {
        code: 'INVALID_ARGUMENT',
        message: 'Invalid envelope',
        details: result.error.issues,
      },
    });
  }
  request.envelope = result.data;
}
```

---

## 三、MVP MCP Server 详细设计

### 3.1 core-mcp

#### 工具清单

| 工具 | 用途 | 输入 | 输出 |
|------|------|------|------|
| `catalog.search_offers` | 粗召回 | query, filters, limit | offer_ids[], scores[] |
| `catalog.get_offer_card` | 获取 AROC | offer_id | AROC 对象 |
| `catalog.get_offer_variants` | 变体矩阵 | offer_id | variants[] |
| `catalog.get_availability` | 可售性 | sku_id, dest_country | is_sellable, stock_status |
| `pricing.get_realtime_quote` | 实时报价 | offer_id, qty, dest_country | unit_price, expire_at |
| `shipping.validate_address` | 地址校验 | address | normalized, is_valid |
| `shipping.quote_options` | 运费报价 | items[], dest_address | options[] |
| `tax.estimate_duties_and_taxes` | 税费估算 | items[], dest_country | tax_total, confidence |
| `compliance.check_item` | 合规检查 | sku_id, dest_country | allowed, reasons[] |
| `knowledge.search` | 证据检索 | query, scope | chunks[] |

#### 目录结构

```
apps/mcp-servers/core-mcp/
├── src/
│   ├── index.ts
│   ├── catalog/
│   │   ├── search.ts
│   │   ├── offer-card.ts
│   │   └── availability.ts
│   ├── pricing/
│   │   └── quote.ts
│   ├── shipping/
│   │   ├── validate-address.ts
│   │   └── quote-options.ts
│   ├── tax/
│   │   └── estimate.ts
│   ├── compliance/
│   │   └── check-item.ts
│   └── knowledge/
│       └── search.ts
├── package.json
└── tsconfig.json
```

### 3.2 checkout-mcp（高敏感）

#### 工具清单

| 工具 | 用途 | 敏感度 | 说明 |
|------|------|--------|------|
| `cart.create` | 创建购物车 | 中 | 需要 idempotency_key |
| `cart.add_item` | 添加商品 | 中 | 需要 idempotency_key |
| `checkout.compute_total` | 计算总额 | 中 | 返回 assumptions[] |
| `checkout.create_draft_order` | 创建草稿订单 | **高** | 必须绑定 evidence |
| `checkout.get_draft_order_summary` | 获取摘要 | 中 | 给 UI 展示 |
| `payment.create_payment_intent` | 创建支付意图 | **极高** | 必须返回 requires_user_action |
| `evidence.create_snapshot` | 创建证据快照 | 中 | 审计必须 |
| `evidence.attach_to_draft_order` | 绑定证据 | 中 | |

#### 权限要求

```typescript
// checkout-mcp 的权限策略

const CHECKOUT_POLICIES = {
  'cart.create': {
    scopes_required: ['cart:write'],
    requires_user: false,
    rate_limit: { per_user_per_min: 20 },
  },
  'checkout.create_draft_order': {
    scopes_required: ['checkout:write'],
    requires_user: true,  // 必须有用户上下文
    rate_limit: { per_user_per_min: 10 },
    audit: { log_request: true, log_response_hash: true },
  },
  'payment.create_payment_intent': {
    scopes_required: ['payment:write'],
    requires_user: true,
    rate_limit: { per_user_per_min: 5 },
    audit: { log_request: true, log_response: true },
    // 硬约束：必须返回 requires_user_action: true
  },
};
```

---

## 四、工具定义模板（Contract First）

### 4.1 JSON Schema 定义

```json
// contracts/json-schema/tools/checkout.create_draft_order.json

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "checkout.create_draft_order",
  "description": "Create a draft order for user confirmation. No payment is captured.",
  
  "input": {
    "type": "object",
    "required": ["request_id", "user_id", "cart_id", "address_id", "shipping_option_id"],
    "properties": {
      "request_id": { "type": "string", "format": "uuid" },
      "user_id": { "type": "string" },
      "cart_id": { "type": "string" },
      "address_id": { "type": "string" },
      "shipping_option_id": { "type": "string" },
      "consents": {
        "type": "object",
        "properties": {
          "tax_estimate_ack": { "type": "boolean" },
          "return_policy_ack": { "type": "boolean" },
          "compliance_ack": { "type": "boolean" }
        }
      },
      "idempotency_key": { "type": "string" }
    }
  },
  
  "output": {
    "type": "object",
    "required": ["draft_order_id", "payable_amount", "expires_at"],
    "properties": {
      "draft_order_id": { "type": "string" },
      "payable_amount": {
        "type": "object",
        "properties": {
          "amount": { "type": "number" },
          "currency": { "type": "string" }
        }
      },
      "expires_at": { "type": "string", "format": "date-time" },
      "confirmation_items": {
        "type": "array",
        "items": { "type": "object" }
      },
      "evidence_snapshot_id": { "type": "string" }
    }
  },
  
  "errors": ["INVALID_ARGUMENT", "CART_EXPIRED", "OUT_OF_STOCK", "PRICE_CHANGED", "COMPLIANCE_BLOCKED"],
  
  "policy": {
    "scopes_required": ["checkout:write"],
    "requires_user": true,
    "rate_limit": { "per_user_per_min": 10 },
    "audit": { "log_request": true, "log_response_hash": true }
  }
}
```

### 4.2 从 Contract 生成代码

```bash
# scripts/generate-sdk.sh

# 生成 TypeScript 类型
npx openapi-typescript contracts/openapi/*.yaml -o packages/contracts-ts/

# 生成 Python Pydantic 模型
python scripts/generate_pydantic.py contracts/json-schema/ agents/src/models/
```

---

## 五、支付工具的硬约束（必须遵守）

### 5.1 禁止 AI 自动扣款

```typescript
// checkout-mcp/src/payment/create-intent.ts

export async function createPaymentIntent(input: CreatePaymentIntentInput) {
  const intent = await paymentProvider.createIntent({
    amount: input.amount,
    currency: input.currency,
    metadata: {
      draft_order_id: input.draft_order_id,
      user_id: input.user_id,
    },
  });

  // 硬约束：永远返回 requires_user_action
  return {
    ok: true,
    data: {
      payment_intent_id: intent.id,
      payment_url: intent.checkout_url,
      requires_user_action: true,  // 🔴 强制
    },
    evidence: {
      snapshot_id: await createSnapshot({ payment_intent: intent.id }),
    },
  };
}
```

### 5.2 禁止提供 capture/confirm 工具

```typescript
// checkout-mcp 绝对不暴露以下工具给 Agent：
// - payment.capture
// - payment.confirm
// - payment.charge

// 如果必须存在（内部使用），永远返回错误：
export async function capturePayment() {
  return {
    ok: false,
    error: {
      code: 'NEEDS_USER_CONFIRMATION',
      message: 'Payment capture requires user interaction',
    },
  };
}
```

---

## 六、资源（Resources）设计

MCP 可以提供只读资源，供 UI/调试使用：

```typescript
// 资源路径
const RESOURCES = {
  'resource://aroc/{offer_id}': getAROC,
  'resource://evidence/{snapshot_id}': getEvidence,
  'resource://chunk/{chunk_id}': getChunk,
  'resource://draft-order/{draft_order_id}': getDraftOrder,
};

// 资源访问同样需要权限和审计
```

---

## 七、与 Python Agent 的集成

### 7.1 LangChain Tools 封装

```python
# agents/src/tools/mcp_tools.py

from langchain_core.tools import tool
from pydantic import BaseModel
import httpx

MCP_GATEWAY_URL = "http://localhost:3000"

class SearchOffersInput(BaseModel):
    query: str
    filters: dict | None = None
    limit: int = 20

@tool
async def catalog_search_offers(input: SearchOffersInput) -> dict:
    """Search for offers matching the query."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{MCP_GATEWAY_URL}/tools/catalog.search_offers",
            json={
                "request_id": str(uuid4()),
                "actor": {"type": "agent", "id": "candidate-agent"},
                **input.model_dump(),
            },
        )
        return response.json()
```

### 7.2 在 LangGraph 中使用

```python
# agents/src/graph/nodes.py

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import ToolNode

from ..tools.mcp_tools import (
    catalog_search_offers,
    pricing_get_quote,
    compliance_check_item,
)

# 工具节点
tools = [catalog_search_offers, pricing_get_quote, compliance_check_item]
tool_node = ToolNode(tools)

# 绑定工具到 LLM
llm = ChatOpenAI(model="gpt-4o-mini").bind_tools(tools)
```

