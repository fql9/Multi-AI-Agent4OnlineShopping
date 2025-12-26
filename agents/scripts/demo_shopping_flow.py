#!/usr/bin/env python3
"""
端到端购物流程演示

演示完整的 AI 购物代理流程：
1. 用户输入购物需求
2. Intent Agent 解析意图
3. Candidate Agent 召回候选
4. Verifier Agent 核验商品
5. Plan Agent 生成方案
6. Execution Agent 创建草稿订单

Usage:
    # 使用 Mock 模式（无需 API Key）
    MOCK_TOOLS=true python scripts/demo_shopping_flow.py

    # 使用 Poe API
    OPENAI_API_KEY=<your-poe-api-key> \\
    OPENAI_BASE_URL=https://api.poe.com/v1 \\
    OPENAI_MODEL_PLANNER=Claude-3.5-Sonnet \\
    python scripts/demo_shopping_flow.py
"""

import asyncio
import os
import sys
from pathlib import Path

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from langchain_core.messages import HumanMessage
import structlog

# Configure logging
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer(colors=True)
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO level
)

logger = structlog.get_logger()


async def run_demo():
    """运行演示流程"""
    print("\n" + "=" * 60)
    print("🛒 AI 购物代理 - 端到端演示")
    print("=" * 60)

    # 检查配置
    api_key = os.getenv("OPENAI_API_KEY", "")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    mock_mode = os.getenv("MOCK_TOOLS", "false").lower() == "true"

    print(f"\n📋 配置:")
    print(f"   - API Key: {'已设置' if api_key else '未设置 (使用 Mock LLM)'}")
    print(f"   - Base URL: {base_url}")
    print(f"   - Mock Tools: {mock_mode}")

    # 示例用户请求
    user_requests = [
        "I need a wireless charger for my iPhone 15, budget around $50, shipping to Germany. I prefer fast charging and a reputable brand.",
        # "帮我找一个适合 MacBook Pro 的充电宝，预算 100 美元以内，发到美国",
    ]

    for request in user_requests:
        print(f"\n{'=' * 60}")
        print(f"👤 用户请求: {request}")
        print("=" * 60)

        # 创建初始状态
        initial_state = {
            "messages": [HumanMessage(content=request)],
            "mission": None,
            "candidates": [],
            "verified_candidates": [],
            "plans": [],
            "current_step": "start",
            "token_used": 0,
            "tool_calls": [],
            "error": None,
        }

        # 1. Intent Agent
        print("\n[Step 1] Intent Agent - Parse User Intent")
        print("-" * 40)
        from src.intent import intent_node
        state = await intent_node(initial_state)

        if state.get("error"):
            print(f"❌ Error: {state['error']}")
            continue

        mission = state.get("mission", {})
        print(f"✅ 目的国: {mission.get('destination_country')}")
        print(f"✅ 预算: ${mission.get('budget_amount')} {mission.get('budget_currency', 'USD')}")
        print(f"✅ 约束条件: {len(mission.get('hard_constraints', []))} 条")
        print(f"✅ 搜索词: {mission.get('search_query', '')[:50]}...")

        # 2. Candidate Agent
        print("\n[Step 2] Candidate Agent - Product Recall")
        print("-" * 40)
        from src.candidate import candidate_node
        state = await candidate_node(state)

        if state.get("error") and not state.get("candidates"):
            print(f"⚠️ Warning: {state['error']}")

        candidates = state.get("candidates", [])
        print(f"✅ 召回候选: {len(candidates)} 个商品")
        for i, c in enumerate(candidates[:3]):
            title = c.get("titles", [{}])[0].get("text", "Unknown")[:40]
            print(f"   {i+1}. {title}...")

        if not candidates:
            print("❌ 没有找到匹配的商品")
            continue

        # 3. Verifier Agent
        print("\n[Step 3] Verifier Agent - Real-time Verification")
        print("-" * 40)
        from src.verifier import verifier_node
        state = await verifier_node(state)

        verified = state.get("verified_candidates", [])
        rejected = state.get("rejected_candidates", [])
        print(f"✅ 通过核验: {len(verified)} 个")
        print(f"❌ 未通过: {len(rejected)} 个")

        for v in verified[:3]:
            price = v.get("checks", {}).get("pricing", {}).get("total_price", "N/A")
            print(f"   - {v.get('offer_id')}: ${price}")

        if not verified:
            print("❌ 没有通过核验的商品")
            continue

        # 4. Plan Agent
        print("\n[Step 4] Plan Agent - Generate Plans")
        print("-" * 40)
        from src.execution import plan_node
        state = await plan_node(state)

        plans = state.get("plans", [])
        print(f"✅ 生成方案: {len(plans)} 个")

        for plan in plans:
            print(f"\n   📦 {plan.get('plan_name')} ({plan.get('plan_type')})")
            total = plan.get("total", {})
            print(f"      商品: ${total.get('subtotal', 0):.2f}")
            print(f"      运费: ${total.get('shipping_cost', 0):.2f}")
            print(f"      税费: ${total.get('tax_estimate', 0):.2f}")
            print(f"      总计: ${total.get('total_landed_cost', 0):.2f}")
            delivery = plan.get("delivery", {})
            print(f"      送达: {delivery.get('min_days', '?')}-{delivery.get('max_days', '?')} 天")

        recommended = state.get("recommended_plan", "")
        print(f"\n   🌟 推荐方案: {recommended}")

        # 5. Execution Agent
        print("\n[Step 5] Execution Agent - Create Draft Order")
        print("-" * 40)
        from src.execution import execution_node
        state = await execution_node(state)

        result = state.get("execution_result", {})
        if result.get("success"):
            print(f"[OK] Draft Order ID: {result.get('draft_order_id')}")
            # 处理 payable_amount 可能是 dict
            payable = result.get('payable_amount', 0)
            if isinstance(payable, dict):
                print(f"[OK] Amount: ${payable.get('amount', 0):.2f} {payable.get('currency', 'USD')}")
            else:
                print(f"[OK] Amount: ${payable:.2f}")
            print(f"[OK] Expires: {result.get('expires_at')}")
            print(f"[OK] Evidence: {result.get('evidence_snapshot_id')}")
            print(f"\nSummary:\n{result.get('summary', '')}")
        else:
            print(f"[WARN] Failed: {state.get('error')}")

        # 统计
        print("\n" + "=" * 60)
        print("📊 执行统计:")
        print(f"   - Token 使用: {state.get('token_used', 0)}")
        print(f"   - 工具调用: {len(state.get('tool_calls', []))} 次")
        print("=" * 60)

    print("\n✨ 演示完成！\n")


if __name__ == "__main__":
    # 设置环境变量默认值（用于本地测试）
    if "MOCK_TOOLS" not in os.environ:
        os.environ["MOCK_TOOLS"] = "true"

    asyncio.run(run_demo())

