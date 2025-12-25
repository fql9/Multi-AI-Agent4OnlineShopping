# 11｜多 Agent 体系（落地版）：LangGraph + 职责划分 + Token 预算

> 本文档给出基于 **LangGraph** 的多 Agent 编排方案，包括职责划分、状态机设计、Token 预算与反幻觉机制。

---

## 一、框架选型：为什么是 LangGraph

| 框架 | 推荐度 | 理由 |
|------|--------|------|
| **LangGraph** | ✅ 强烈推荐 | 官方维护、状态机驱动、可控、支持人工介入、可持久化、支持流式输出 |
| LangChain | ⚠️ 仅用于工具封装 | 直接用 LangGraph 编排，LangChain 做底层工具封装 |
| AutoGen | ❌ 不推荐 | 多 Agent 对话太自由，不适合交易场景 |
| CrewAI | ❌ 不推荐 | 控制力不足，难以做精细权限控制 |
| 自研状态机 | ⚠️ 备选 | 工作量大，但完全可控 |

### LangGraph 核心优势

1. **状态机驱动**：每个节点是一个 Agent/Tool，边是条件转移
2. **可持久化**：支持 checkpoint，可断点续传
3. **人工介入**：支持 `interrupt_before` / `interrupt_after`
4. **流式输出**：支持 streaming，用户体验好
5. **可观测**：集成 LangSmith，trace 可视化

---

## 二、Agent 职责划分

### 核心 Agent（MVP 必须）

| Agent | 职责 | 模型 | 可调用工具 |
|-------|------|------|------------|
| **Orchestrator** | 任务拆解、路由、预算编排 | GPT-4o-mini | 无（纯逻辑） |
| **Intent Agent** | 解析用户意图 → Mission 结构化 | GPT-4o-mini | identity.* |
| **Candidate Agent** | 图谱约束 + 检索召回候选集 | GPT-4o-mini | catalog.*, knowledge.* |
| **Verifier Agent** | 对 TopN 调实时工具核验 | GPT-4o | pricing.*, shipping.*, tax.*, compliance.* |
| **Execution Agent** | 生成 Draft Order | GPT-4o-mini | cart.*, checkout.*, evidence.* |

### 扩展 Agent（中期）

| Agent | 职责 | 说明 |
|-------|------|------|
| **Compliance Agent** | 跨境合规专家 | 复杂合规场景单独处理 |
| **Bundle Agent** | 跨店凑单、满减优化 | promotion.optimize |
| **After-sales Agent** | 售后、仲裁证据链 | order.*, evidence.* |

### 店铺 Agent 降级

**不推荐**给每个店铺一个"自由对话 Agent"。正确姿势：

```
店铺 → 结构化能力合约（Shop Capability Contract）
     → 由平台 Agent 调用，不可自由发挥
```

---

## 三、LangGraph 状态机设计

### 3.1 状态定义

```python
# agents/src/graph/state.py

from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    """Agent 全局状态"""
    # 消息历史
    messages: Annotated[list, add_messages]
    
    # 任务相关
    mission: dict | None           # 结构化采购委托
    candidates: list[dict]         # 候选商品
    verified_candidates: list[dict] # 核验后的候选
    selected_plan: dict | None     # 用户选择的方案
    
    # 购物车/订单
    cart_id: str | None
    draft_order_id: str | None
    
    # 证据
    evidence_snapshot_id: str | None
    
    # 预算
    token_budget: int
    token_used: int
    
    # 流程控制
    current_step: str
    needs_user_input: bool
    error: str | None
```

### 3.2 节点定义

```python
# agents/src/graph/nodes.py

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage

from ..tools.mcp_tools import (
    catalog_search_offers,
    catalog_get_offer_card,
    pricing_get_quote,
    shipping_quote_options,
    tax_estimate,
    compliance_check,
    cart_create,
    cart_add_item,
    checkout_create_draft_order,
    evidence_create_snapshot,
)

# Intent 节点
async def intent_node(state: AgentState) -> AgentState:
    """解析用户意图，生成结构化 Mission"""
    llm = ChatOpenAI(model="gpt-4o-mini")
    
    # 使用结构化输出
    structured_llm = llm.with_structured_output(MissionSpec)
    
    mission = await structured_llm.ainvoke(state["messages"])
    
    return {
        "mission": mission.model_dump(),
        "current_step": "candidate",
    }

# Candidate 节点
async def candidate_node(state: AgentState) -> AgentState:
    """召回候选商品"""
    mission = state["mission"]
    
    # 调用工具
    results = await catalog_search_offers.ainvoke({
        "query": mission["query"],
        "filters": {
            "dest_country": mission["destination_country"],
            "price_max": mission["budget_amount"],
        },
        "limit": 50,
    })
    
    # 获取 AROC
    candidates = []
    for offer_id in results["offer_ids"][:20]:
        aroc = await catalog_get_offer_card.ainvoke({"offer_id": offer_id})
        candidates.append(aroc)
    
    return {
        "candidates": candidates,
        "current_step": "verify",
    }

# Verifier 节点（核心：反幻觉）
async def verifier_node(state: AgentState) -> AgentState:
    """对 TopN 调用实时工具核验"""
    verified = []
    
    for candidate in state["candidates"][:10]:
        # 实时报价
        quote = await pricing_get_quote.ainvoke({
            "offer_id": candidate["offer_id"],
            "qty": 1,
            "dest_country": state["mission"]["destination_country"],
        })
        
        # 运费
        shipping = await shipping_quote_options.ainvoke({
            "items": [{"sku_id": candidate["sku_id"], "qty": 1}],
            "dest_country": state["mission"]["destination_country"],
        })
        
        # 税费
        tax = await tax_estimate.ainvoke({
            "items": [{"sku_id": candidate["sku_id"], "value": quote["unit_price"]}],
            "dest_country": state["mission"]["destination_country"],
        })
        
        # 合规
        compliance = await compliance_check.ainvoke({
            "sku_id": candidate["sku_id"],
            "dest_country": state["mission"]["destination_country"],
        })
        
        if compliance["allowed"]:
            verified.append({
                **candidate,
                "quote": quote,
                "shipping_options": shipping["options"],
                "tax_estimate": tax,
                "compliance": compliance,
            })
    
    return {
        "verified_candidates": verified,
        "current_step": "plan",
    }

# Plan 节点
async def plan_node(state: AgentState) -> AgentState:
    """生成 2-3 个方案供用户选择"""
    llm = ChatOpenAI(model="gpt-4o-mini")
    
    # 让 LLM 基于核验结果生成方案
    plans = await generate_plans(llm, state["verified_candidates"], state["mission"])
    
    return {
        "messages": [AIMessage(content=format_plans(plans))],
        "needs_user_input": True,  # 等待用户选择
        "current_step": "await_selection",
    }

# Execution 节点
async def execution_node(state: AgentState) -> AgentState:
    """生成 Draft Order"""
    plan = state["selected_plan"]
    
    # 创建购物车
    cart = await cart_create.ainvoke({})
    
    # 添加商品
    for item in plan["items"]:
        await cart_add_item.ainvoke({
            "cart_id": cart["cart_id"],
            "sku_id": item["sku_id"],
            "qty": item["qty"],
        })
    
    # 创建证据快照
    evidence = await evidence_create_snapshot.ainvoke({
        "mission_id": state["mission"]["id"],
        "verified_candidates": state["verified_candidates"],
    })
    
    # 创建草稿订单
    draft_order = await checkout_create_draft_order.ainvoke({
        "cart_id": cart["cart_id"],
        "address_id": state["mission"]["address_id"],
        "shipping_option_id": plan["shipping_option_id"],
        "evidence_snapshot_id": evidence["snapshot_id"],
    })
    
    return {
        "cart_id": cart["cart_id"],
        "draft_order_id": draft_order["draft_order_id"],
        "evidence_snapshot_id": evidence["snapshot_id"],
        "current_step": "complete",
    }
```

### 3.3 图构建

```python
# agents/src/graph/graph.py

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .state import AgentState
from .nodes import (
    intent_node,
    candidate_node,
    verifier_node,
    plan_node,
    execution_node,
)

def build_graph():
    graph = StateGraph(AgentState)
    
    # 添加节点
    graph.add_node("intent", intent_node)
    graph.add_node("candidate", candidate_node)
    graph.add_node("verify", verifier_node)
    graph.add_node("plan", plan_node)
    graph.add_node("execution", execution_node)
    
    # 添加边
    graph.set_entry_point("intent")
    graph.add_edge("intent", "candidate")
    graph.add_edge("candidate", "verify")
    graph.add_edge("verify", "plan")
    
    # 条件边：等待用户选择
    graph.add_conditional_edges(
        "plan",
        lambda state: "execution" if state.get("selected_plan") else END,
    )
    
    graph.add_edge("execution", END)
    
    # 编译
    memory = MemorySaver()
    return graph.compile(checkpointer=memory)

# 使用
agent = build_graph()

async def run_agent(user_message: str, thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    
    async for event in agent.astream(
        {"messages": [HumanMessage(content=user_message)]},
        config,
    ):
        yield event
```

---

## 四、Token 预算管理

### 4.1 预算分配

| 阶段 | 预算（tokens） | 模型 |
|------|----------------|------|
| Intent 解析 | 1,000 | GPT-4o-mini |
| Candidate 筛选 | 10,000 | GPT-4o-mini |
| 深度核验 | 30,000 | GPT-4o |
| 方案生成 | 5,000 | GPT-4o-mini |
| 解释输出 | 5,000 | GPT-4o-mini |
| **合计** | **51,000** | - |

### 4.2 预算追踪

```python
# agents/src/graph/budget.py

from langchain_core.callbacks import BaseCallbackHandler

class BudgetTracker(BaseCallbackHandler):
    def __init__(self, limit: int = 50000):
        self.limit = limit
        self.used = 0
    
    def on_llm_end(self, response, **kwargs):
        usage = response.llm_output.get("token_usage", {})
        self.used += usage.get("total_tokens", 0)
        
        if self.used > self.limit * 0.8:
            logger.warning(f"Token budget at {self.used}/{self.limit}")
    
    def can_continue(self) -> bool:
        return self.used < self.limit
```

---

## 五、反幻觉机制（核心）

### 5.1 原则

1. **强事实必须来自工具**：价格、库存、运费、税费、合规结论
2. **弱事实必须带引用**：说明书、条款、评价洞察
3. **无证据陈述 = 退回重写**

### 5.2 Verifier 检查

```python
# agents/src/graph/verifier.py

class FactChecker:
    """检查 Agent 输出是否有证据支撑"""
    
    FACT_PATTERNS = [
        r"价格[是为]?\s*[\d.,]+",
        r"运费[是为]?\s*[\d.,]+",
        r"税费[是为]?\s*[\d.,]+",
        r"(\d+)\s*(天|小时).*到达",
        r"可以清关",
        r"支持退换",
    ]
    
    def check(self, output: str, evidence: dict) -> list[str]:
        """返回无证据支撑的事实陈述"""
        unsupported = []
        
        for pattern in self.FACT_PATTERNS:
            matches = re.findall(pattern, output)
            for match in matches:
                if not self._has_evidence(match, evidence):
                    unsupported.append(match)
        
        return unsupported
    
    def _has_evidence(self, claim: str, evidence: dict) -> bool:
        # 检查是否有工具结果或 chunk 引用支撑
        ...
```

### 5.3 强制退回

```python
# 在 plan_node 之后添加检查

async def fact_check_node(state: AgentState) -> AgentState:
    """检查输出是否有幻觉"""
    checker = FactChecker()
    
    last_message = state["messages"][-1].content
    unsupported = checker.check(last_message, state["verified_candidates"])
    
    if unsupported:
        return {
            "messages": [AIMessage(content=f"需要重新核验：{unsupported}")],
            "current_step": "verify",  # 退回重新核验
        }
    
    return state
```

---

## 六、人工介入点

LangGraph 支持在关键节点暂停，等待人工确认：

```python
# 在敏感操作前暂停
graph.compile(
    checkpointer=memory,
    interrupt_before=["execution"],  # 执行前暂停
)

# 用户确认后继续
await agent.ainvoke(
    {"selected_plan": user_selected_plan},
    config,
)
```

