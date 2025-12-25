"""
Agent State Definition for LangGraph.
"""

from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


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

    # 候选商品列表（由 Candidate Agent 生成）
    candidates: list[dict]

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
    user_confirmation: dict | None

    # ========================================
    # 错误处理
    # ========================================
    error: str | None
    error_code: str | None
    recoverable: bool

