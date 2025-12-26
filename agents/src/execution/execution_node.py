"""
Execution Agent Node implementation.

创建购物车和草稿订单。
"""

from datetime import UTC

import structlog

from ..graph.state import AgentState
from ..tools.checkout import add_to_cart, compute_total, create_cart, create_draft_order
from ..tools.evidence import create_evidence_snapshot

logger = structlog.get_logger()


async def execution_node(state: AgentState) -> AgentState:
    """
    Execution 节点

    创建购物车和草稿订单
    """
    logger.info("execution_node.start")

    try:
        mission = state.get("mission")
        plans = state.get("plans", [])
        selected_plan_name = state.get("selected_plan") or state.get("recommended_plan")

        if not mission:
            return {
                **state,
                "error": "No mission found",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "execution",
            }

        if not plans:
            return {
                **state,
                "error": "No plans available",
                "error_code": "NOT_FOUND",
                "current_step": "execution",
            }

        # 找到选中的方案
        selected_plan = None
        for plan in plans:
            if plan.get("plan_name") == selected_plan_name:
                selected_plan = plan
                break

        if not selected_plan:
            selected_plan = plans[0]  # 默认选第一个

        logger.info("execution_node.selected_plan", plan_name=selected_plan.get("plan_name"))

        destination_country = mission.get("destination_country", "US")
        tool_calls = state.get("tool_calls", [])

        # 1. 创建购物车
        cart_result = await create_cart(user_id="u_test")

        if not cart_result.get("ok"):
            return {
                **state,
                "error": "Failed to create cart",
                "error_code": "INTERNAL_ERROR",
                "current_step": "execution",
            }

        cart_id = cart_result.get("data", {}).get("cart_id")
        logger.info("execution_node.cart_created", cart_id=cart_id)

        tool_calls.append({
            "tool_name": "checkout.create_cart",
            "request": {},
            "response_summary": {"cart_id": cart_id},
            "called_at": _now_iso(),
        })

        # 2. 添加商品到购物车
        items = selected_plan.get("items", [])
        for item in items:
            add_result = await add_to_cart(
                cart_id=cart_id,
                sku_id=item.get("sku_id"),
                quantity=item.get("quantity", 1),
            )

            if not add_result.get("ok"):
                logger.warning(
                    "execution_node.add_item_failed",
                    sku_id=item.get("sku_id"),
                    error=add_result.get("error"),
                )

            tool_calls.append({
                "tool_name": "checkout.add_to_cart",
                "request": {"cart_id": cart_id, "sku_id": item.get("sku_id")},
                "response_summary": {"ok": add_result.get("ok")},
                "called_at": _now_iso(),
            })

        # 3. 计算总价
        total_result = await compute_total(
            cart_id=cart_id,
            address_id="addr_default",
            shipping_option_id="ship_standard",
        )

        if not total_result.get("ok"):
            logger.warning("execution_node.compute_total_failed")

        computed_total = total_result.get("data", {}).get("total", 0)
        tool_calls.append({
            "tool_name": "checkout.compute_total",
            "request": {"cart_id": cart_id, "destination_country": destination_country},
            "response_summary": {"total": computed_total},
            "called_at": _now_iso(),
        })

        # 4. 创建草稿订单
        draft_result = await create_draft_order(
            cart_id=cart_id,
            user_id="u_test",
            address_id="addr_default",
            shipping_option_id="ship_standard",
            consents={
                "tax_estimate_ack": True,
                "return_policy_ack": True,
                "compliance_ack": True,
            },
        )

        if not draft_result.get("ok"):
            error_msg = draft_result.get("error", {}).get("message", "Failed to create draft order")
            return {
                **state,
                "error": error_msg,
                "error_code": draft_result.get("error", {}).get("code", "INTERNAL_ERROR"),
                "current_step": "execution",
                "tool_calls": tool_calls,
            }

        draft_data = draft_result.get("data", {})
        draft_order_id = draft_data.get("draft_order_id")
        payable_amount = draft_data.get("payable_amount")
        expires_at = draft_data.get("expires_at")

        logger.info(
            "execution_node.draft_order_created",
            draft_order_id=draft_order_id,
            payable_amount=payable_amount,
        )

        tool_calls.append({
            "tool_name": "checkout.create_draft_order",
            "request": {"cart_id": cart_id},
            "response_summary": {"draft_order_id": draft_order_id, "payable_amount": payable_amount},
            "called_at": _now_iso(),
        })

        # 5. 创建证据快照
        evidence_result = await create_evidence_snapshot(
            mission_id=state.get("mission_id"),
            objects={
                "offer_ids": [item.get("offer_id") for item in items],
                "destination_country": destination_country,
                "draft_order_id": draft_order_id,
            },
            tool_call_records=[
                {
                    "tool_name": tc.get("tool_name"),
                    "request": tc.get("request"),
                    "response": tc.get("response_summary"),
                    "response_hash": str(hash(str(tc.get("response_summary")))),
                    "called_at": tc.get("called_at"),
                    "latency_ms": 50,
                }
                for tc in tool_calls
            ],
        )

        evidence_snapshot_id = None
        if evidence_result.get("ok"):
            evidence_snapshot_id = evidence_result.get("data", {}).get("snapshot_id")
            logger.info("execution_node.evidence_created", snapshot_id=evidence_snapshot_id)

        # 构建执行结果
        execution_result = {
            "success": True,
            "draft_order_id": draft_order_id,
            "cart_id": cart_id,
            "selected_plan": selected_plan.get("plan_name"),
            "payable_amount": payable_amount,
            "currency": "USD",
            "expires_at": expires_at,
            "evidence_snapshot_id": evidence_snapshot_id,
            "confirmation_items": draft_data.get("confirmation_items", []),
            "requires_user_action": True,
            "summary": _generate_summary(selected_plan, payable_amount, expires_at),
        }

        logger.info("execution_node.complete", draft_order_id=draft_order_id)

        return {
            **state,
            "execution_result": execution_result,
            "draft_order_id": draft_order_id,
            "tool_calls": tool_calls,
            "current_step": "execution_complete",
            "error": None,
        }

    except Exception as e:
        logger.error("execution_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "execution",
        }


def _generate_summary(plan: dict, payable_amount: dict | float, expires_at: str) -> str:
    """生成执行摘要"""
    items = plan.get("items", [])
    item_count = sum(item.get("quantity", 1) for item in items)

    # 处理 payable_amount 可能是 dict 或 float
    if isinstance(payable_amount, dict):
        amount = payable_amount.get("amount", 0)
        currency = payable_amount.get("currency", "USD")
    else:
        amount = payable_amount
        currency = "USD"

    summary = f"""
Draft Order Created

Plan: {plan.get('plan_name')}
Items: {item_count} item(s)
Total: ${amount:.2f} {currency}

This draft order expires at {expires_at}

IMPORTANT: Payment has NOT been captured.
Please review and confirm to proceed to checkout.
"""
    return summary.strip()


def _now_iso() -> str:
    """返回当前时间的 ISO 格式"""
    from datetime import datetime
    return datetime.now(UTC).isoformat()
