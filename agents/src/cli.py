"""
Shopping Agent CLI

命令行界面，用于测试完整的 Agent 流程。
"""

import asyncio
import sys

import structlog
from langchain_core.messages import HumanMessage

from .graph import AgentState, build_agent_graph

logger = structlog.get_logger()


async def run_agent(user_message: str) -> dict:
    """
    运行完整的 Agent 流程

    Args:
        user_message: 用户输入的自然语言请求

    Returns:
        最终状态
    """
    logger.info("cli.start", message=user_message[:50])

    # 构建初始状态
    initial_state: AgentState = {
        "messages": [HumanMessage(content=user_message)],
        "mission": None,
        "candidates": [],
        "verified_candidates": [],
        "plans": [],
        "selected_plan": None,
        "execution_result": None,
        "draft_order_id": None,
        "current_step": "start",
        "token_used": 0,
        "tool_calls": [],
        "needs_clarification": False,
        "error": None,
        "error_code": None,
    }

    # 构建 Agent Graph
    graph = build_agent_graph()

    # 运行
    config = {"configurable": {"thread_id": "cli-test-1"}}
    result = await graph.ainvoke(initial_state, config)

    return result


def print_result(result: dict) -> None:
    """格式化打印结果"""
    print("\n" + "=" * 60)
    print("🛒 Shopping Agent 执行结果")
    print("=" * 60)

    # 错误处理
    if result.get("error"):
        print(f"\n❌ 错误: {result['error']}")
        print(f"   错误码: {result.get('error_code', 'UNKNOWN')}")
        return

    # Mission
    mission = result.get("mission")
    if mission:
        print("\n📋 解析的购买意图:")
        print(f"   目的国: {mission.get('destination_country', 'N/A')}")
        print(f"   预算: ${mission.get('budget_amount', 'N/A')} {mission.get('budget_currency', 'USD')}")
        print(f"   搜索词: {mission.get('search_query', 'N/A')[:50]}")
        constraints = mission.get("hard_constraints", [])
        if constraints:
            print(f"   硬约束: {len(constraints)} 个")

    # Candidates
    candidates = result.get("candidates", [])
    verified = result.get("verified_candidates", [])
    print(f"\n📦 商品召回: {len(candidates)} 个候选")
    print(f"✅ 通过核验: {len(verified)} 个")

    # Plans
    plans = result.get("plans", [])
    if plans:
        print(f"\n📝 生成方案: {len(plans)} 个")
        for i, plan in enumerate(plans):
            print(f"\n   方案 {i+1}: {plan.get('plan_name', 'N/A')}")
            total = plan.get("total", {})
            print(f"   - 到手价: ${total.get('total_landed_cost', 'N/A')}")
            delivery = plan.get("delivery", {})
            print(f"   - 送达: {delivery.get('min_days', '?')}-{delivery.get('max_days', '?')} 天")
            risks = plan.get("risks", [])
            if risks:
                print(f"   - 风险: {', '.join(risks[:2])}")

        recommended = result.get("recommended_plan")
        if recommended:
            print(f"\n   ⭐ 推荐: {recommended}")

    # Execution Result
    execution = result.get("execution_result")
    if execution:
        print("\n🚀 执行结果:")
        if execution.get("success"):
            print(f"   草稿订单: {execution.get('draft_order_id', 'N/A')}")
            print(f"   应付金额: ${execution.get('payable_amount', 'N/A')}")
            print(f"   过期时间: {execution.get('expires_at', 'N/A')}")
            print(f"   证据快照: {execution.get('evidence_snapshot_id', 'N/A')}")
            print("\n   ⚠️ 注意: 这是草稿订单，用户确认后才能支付")
        else:
            print(f"   ❌ 执行失败: {execution.get('error_message', 'Unknown')}")

    # Token Usage
    token_used = result.get("token_used", 0)
    if token_used:
        print(f"\n💰 Token 使用: {token_used}")

    # Tool Calls
    tool_calls = result.get("tool_calls", [])
    if tool_calls:
        print(f"\n🔧 工具调用: {len(tool_calls)} 次")

    print("\n" + "=" * 60)


async def interactive_mode():
    """交互模式"""
    print("\n" + "=" * 60)
    print("🛒 Shopping Agent - 交互模式")
    print("=" * 60)
    print("输入您的购物需求，或输入 'quit' 退出\n")

    while True:
        try:
            user_input = input("🧑 您: ").strip()
            if not user_input:
                continue
            if user_input.lower() in ["quit", "exit", "q"]:
                print("👋 再见!")
                break

            print("\n🤖 正在处理...")
            result = await run_agent(user_input)
            print_result(result)
            print()

        except KeyboardInterrupt:
            print("\n👋 再见!")
            break
        except Exception as e:
            print(f"\n❌ 错误: {e}")


def main():
    """主入口"""
    if len(sys.argv) > 1:
        # 命令行模式
        user_message = " ".join(sys.argv[1:])
        result = asyncio.run(run_agent(user_message))
        print_result(result)
    else:
        # 交互模式
        asyncio.run(interactive_mode())


if __name__ == "__main__":
    main()

