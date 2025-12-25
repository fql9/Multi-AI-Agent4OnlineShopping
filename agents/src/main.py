"""
Agent 主入口
"""

import asyncio

import structlog
from langchain_core.messages import HumanMessage

from .config import get_settings
from .graph import AgentState, build_agent_graph

# 配置日志
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


async def run_agent(user_message: str, config: dict | None = None) -> dict:
    """
    运行 Agent

    Args:
        user_message: 用户消息
        config: LangGraph 配置（包含 thread_id 等）

    Returns:
        Agent 最终状态
    """
    settings = get_settings()
    logger.info("agent.start", message=user_message[:100])

    # 构建 graph
    graph = build_agent_graph()

    # 初始状态
    initial_state: AgentState = {
        "messages": [HumanMessage(content=user_message)],
        "mission": None,
        "candidates": [],
        "verified_candidates": [],
        "plans": [],
        "selected_plan": None,
        "cart_id": None,
        "draft_order_id": None,
        "draft_order": None,
        "evidence_snapshot_id": None,
        "tool_call_records": [],
        "token_budget": settings.token_budget_total,
        "token_used": 0,
        "current_step": "start",
        "needs_user_input": False,
        "user_confirmation": None,
        "error": None,
        "error_code": None,
        "recoverable": True,
    }

    # 运行 graph
    config = config or {"configurable": {"thread_id": "default"}}

    try:
        final_state = await graph.ainvoke(initial_state, config)
        logger.info(
            "agent.complete",
            current_step=final_state.get("current_step"),
            draft_order_id=final_state.get("draft_order_id"),
            error=final_state.get("error"),
        )
        return final_state
    except Exception as e:
        logger.error("agent.error", error=str(e))
        return {
            **initial_state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "error",
        }


async def main():
    """Demo 入口"""
    print("=" * 60)
    print("Multi-AI-Agent for Online Shopping")
    print("=" * 60)
    print()

    # 示例查询
    test_queries = [
        "给 10 岁孩子买生日礼物，STEM 玩具，预算 80 美元，三天内到美国",
        "我想买一个 USB-C 充电器，要美规插头，发到加州",
    ]

    for query in test_queries:
        print(f"Query: {query}")
        print("-" * 40)

        result = await run_agent(query)

        print(f"Current Step: {result.get('current_step')}")
        print(f"Candidates Found: {len(result.get('candidates', []))}")
        print(f"Verified Candidates: {len(result.get('verified_candidates', []))}")
        print(f"Plans Generated: {len(result.get('plans', []))}")
        print(f"Draft Order ID: {result.get('draft_order_id')}")
        print(f"Token Used: {result.get('token_used')}")

        if result.get("error"):
            print(f"Error: {result.get('error')}")

        print()
        print("=" * 60)
        print()


if __name__ == "__main__":
    asyncio.run(main())

