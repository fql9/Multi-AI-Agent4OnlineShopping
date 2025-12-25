"""
LangGraph graph builder.
"""

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from ..candidate import candidate_node
from ..execution import execution_node, plan_node
from ..intent import intent_node
from ..verifier import verifier_node
from .state import AgentState


def should_continue_to_candidate(state: AgentState) -> str:
    """判断是否继续到候选生成阶段"""
    if state.get("error"):
        return "error_handler"
    if state.get("mission") is None:
        return "intent"  # 需要更多信息
    return "candidate"


def should_continue_to_verify(state: AgentState) -> str:
    """判断是否继续到核验阶段"""
    if state.get("error"):
        return "error_handler"
    if not state.get("candidates"):
        return "no_results"
    return "verify"


def should_continue_to_plan(state: AgentState) -> str:
    """判断是否继续到方案生成阶段"""
    if state.get("error"):
        return "error_handler"
    if not state.get("verified_candidates"):
        return "no_valid_candidates"
    return "plan"


def should_continue_to_execute(state: AgentState) -> str:
    """判断是否继续到执行阶段"""
    if state.get("error"):
        return "error_handler"
    if state.get("needs_user_input"):
        return "wait_user"
    if state.get("selected_plan") is None:
        return "wait_user"  # 等待用户选择
    return "execute"


def error_handler_node(state: AgentState) -> AgentState:
    """错误处理节点"""
    state.get("error", "Unknown error")
    error_code = state.get("error_code", "INTERNAL_ERROR")

    # 根据错误类型决定是否可恢复
    recoverable_codes = ["TIMEOUT", "UPSTREAM_ERROR", "RATE_LIMITED"]
    recoverable = error_code in recoverable_codes

    return {
        **state,
        "recoverable": recoverable,
        "needs_user_input": not recoverable,
        "current_step": "error",
    }


def no_results_node(state: AgentState) -> AgentState:
    """无结果处理节点"""
    return {
        **state,
        "current_step": "no_results",
        "needs_user_input": True,
    }


def no_valid_candidates_node(state: AgentState) -> AgentState:
    """无有效候选处理节点"""
    return {
        **state,
        "current_step": "no_valid_candidates",
        "needs_user_input": True,
    }


def wait_user_node(state: AgentState) -> AgentState:
    """等待用户输入节点"""
    return {
        **state,
        "current_step": "waiting_user",
        "needs_user_input": True,
    }


def build_agent_graph():
    """
    构建 Agent 状态机

    流程:
    1. Intent: 解析用户意图 → Mission
    2. Candidate: 召回候选商品
    3. Verify: 实时核验（价格/库存/物流/合规）
    4. Plan: 生成可执行方案
    5. Execute: 创建草稿订单
    """

    # 创建状态图
    graph = StateGraph(AgentState)

    # 添加节点
    graph.add_node("intent", intent_node)
    graph.add_node("candidate", candidate_node)
    graph.add_node("verify", verifier_node)
    graph.add_node("plan", plan_node)
    graph.add_node("execute", execution_node)
    graph.add_node("error_handler", error_handler_node)
    graph.add_node("no_results", no_results_node)
    graph.add_node("no_valid_candidates", no_valid_candidates_node)
    graph.add_node("wait_user", wait_user_node)

    # 设置入口点
    graph.set_entry_point("intent")

    # 添加边
    graph.add_conditional_edges(
        "intent",
        should_continue_to_candidate,
        {
            "candidate": "candidate",
            "intent": "intent",  # 循环澄清
            "error_handler": "error_handler",
        },
    )

    graph.add_conditional_edges(
        "candidate",
        should_continue_to_verify,
        {
            "verify": "verify",
            "no_results": "no_results",
            "error_handler": "error_handler",
        },
    )

    graph.add_conditional_edges(
        "verify",
        should_continue_to_plan,
        {
            "plan": "plan",
            "no_valid_candidates": "no_valid_candidates",
            "error_handler": "error_handler",
        },
    )

    graph.add_conditional_edges(
        "plan",
        should_continue_to_execute,
        {
            "execute": "execute",
            "wait_user": "wait_user",
            "error_handler": "error_handler",
        },
    )

    # 结束节点
    graph.add_edge("execute", END)
    graph.add_edge("error_handler", END)
    graph.add_edge("no_results", END)
    graph.add_edge("no_valid_candidates", END)
    graph.add_edge("wait_user", END)

    # 编译图，启用 checkpointing
    memory = MemorySaver()
    app = graph.compile(checkpointer=memory)

    return app


# 默认 graph 实例
agent_graph = None


def get_agent_graph():
    """获取或创建 Agent Graph 实例"""
    global agent_graph
    if agent_graph is None:
        agent_graph = build_agent_graph()
    return agent_graph

