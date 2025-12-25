"""
Execution Node - 创建草稿订单
"""

import structlog

from ..graph.state import AgentState
from ..tools.checkout import add_to_cart, create_cart, create_draft_order
from ..tools.evidence import create_evidence_snapshot

logger = structlog.get_logger()


async def execution_node(state: AgentState) -> AgentState:
    """
    Execution 节点

    创建购物车和草稿订单
    """
    logger.info("execution_node.start", selected_plan=state.get("selected_plan"))

    try:
        mission = state.get("mission", {})
        selected_plan = state.get("selected_plan")
        tool_call_records = state.get("tool_call_records", [])

        if not selected_plan:
            return {
                **state,
                "error": "No plan selected",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "execute",
            }

        user_id = mission.get("user_id", "anonymous")
        items = selected_plan.get("items", [])

        # 1. 创建购物车
        cart_result = await create_cart(user_id=user_id)
        if not cart_result.get("ok"):
            return {
                **state,
                "error": cart_result.get("error", {}).get("message", "Cart creation failed"),
                "error_code": cart_result.get("error", {}).get("code", "UPSTREAM_ERROR"),
                "current_step": "execute",
            }

        cart_id = cart_result.get("data", {}).get("cart_id")
        tool_call_records.append({
            "tool": "cart.create",
            "response_hash": cart_result.get("evidence", {}).get("hash", ""),
        })

        # 2. 添加商品到购物车
        for item in items:
            sku_id = item.get("sku_id") or item.get("skus", [{}])[0].get("sku_id")
            add_result = await add_to_cart(
                cart_id=cart_id,
                sku_id=sku_id,
                quantity=1,
            )
            tool_call_records.append({
                "tool": "cart.add_item",
                "response_hash": add_result.get("evidence", {}).get("hash", ""),
            })

        # 3. 创建 Evidence Snapshot
        evidence_result = await create_evidence_snapshot(
            user_id=user_id,
            mission_id=mission.get("id"),
            tool_call_records=tool_call_records,
        )
        evidence_snapshot_id = evidence_result.get("data", {}).get("snapshot_id")

        # 4. 创建草稿订单
        draft_result = await create_draft_order(
            cart_id=cart_id,
            user_id=user_id,
            address_id=mission.get("address_id", "default"),
            evidence_snapshot_id=evidence_snapshot_id,
        )

        if not draft_result.get("ok"):
            return {
                **state,
                "error": draft_result.get("error", {}).get("message", "Draft order creation failed"),
                "error_code": draft_result.get("error", {}).get("code", "UPSTREAM_ERROR"),
                "current_step": "execute",
            }

        draft_order = draft_result.get("data")
        draft_order_id = draft_order.get("draft_order_id")

        logger.info(
            "execution_node.complete",
            draft_order_id=draft_order_id,
            evidence_snapshot_id=evidence_snapshot_id,
        )

        return {
            **state,
            "cart_id": cart_id,
            "draft_order_id": draft_order_id,
            "draft_order": draft_order,
            "evidence_snapshot_id": evidence_snapshot_id,
            "tool_call_records": tool_call_records,
            "current_step": "execute_complete",
            "needs_user_input": True,  # 等待用户确认支付
            "error": None,
        }

    except Exception as e:
        logger.error("execution_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "execute",
        }

