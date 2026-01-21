"""
Agent State Definition for LangGraph.
"""

from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


class IntentReasoning(TypedDict):
    """
    Intent Agent 思维链（简化版）
    
    仅包含一段简洁的思考文本，类似 DeepSeek 的思维链风格。
    """
    thinking: str  # 简洁的思维链文本（2-3句话）


class AgentState(TypedDict):
    """
    Agent 全局状态

    这个状态对象在整个 Agent 流程中共享，每个节点可以读写。
    LangGraph 会自动处理状态的持久化和恢复。
    """

    # ========================================
    # 消息历史
    # ========================================
    messages: Annotated[list, add_messages]

    # ========================================
    # 任务相关
    # ========================================
    # 结构化采购委托（由 Intent Agent 生成）
    mission: dict | None
    
    # Intent Agent 推理过程（用于前端展示）
    intent_reasoning: IntentReasoning | None

    # 候选商品列表（由 Candidate Agent 生成）
    candidates: list[dict]
    
    # Candidate Agent 搜索进度信息（用于前端实时展示）
    candidate_search_info: dict | None

    # 核验后的候选（由 Verifier Agent 生成）
    verified_candidates: list[dict]

    # 可执行方案（由 Plan 阶段生成）
    plans: list[dict]

    # 用户选择的方案
    selected_plan: dict | None

    # ========================================
    # 购物车/订单
    # ========================================
    cart_id: str | None
    draft_order_id: str | None
    draft_order: dict | None

    # ========================================
    # 证据
    # ========================================
    evidence_snapshot_id: str | None
    tool_call_records: list[dict]

    # ========================================
    # 预算控制
    # ========================================
    token_budget: int
    token_used: int

    # ========================================
    # 流程控制
    # ========================================
    current_step: str
    needs_user_input: bool
    needs_clarification: bool  # Intent Agent 请求澄清
    user_confirmation: dict | None

    # ========================================
    # 错误处理
    # ========================================
    error: str | None
    error_code: str | None
    recoverable: bool

