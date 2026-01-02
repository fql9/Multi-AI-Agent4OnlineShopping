"""
Payment Agent Node implementation.

处理支付流程：
- 验证草稿订单
- 获取支付方式
- 创建支付意图
- 处理支付确认
"""

from datetime import UTC, datetime

import structlog

from ..config import get_settings
from ..graph.state import AgentState
from ..llm.client import call_llm_and_parse
from ..llm.prompts import PAYMENT_PROMPT
from ..llm.schemas import PaymentResult
from ..tools.checkout import get_draft_order_summary

logger = structlog.get_logger()


async def payment_node(state: AgentState) -> AgentState:
    """
    Payment Agent 节点

    处理支付流程，包括：
    1. 验证草稿订单状态
    2. 确认用户已确认所有必要项目
    3. 准备支付意图
    4. 返回支付确认页面所需信息
    """
    logger.info("payment_node.start")

    try:
        draft_order_id = state.get("draft_order_id")
        execution_result = state.get("execution_result", {})
        user_confirmation = state.get("user_confirmation", {})

        if not draft_order_id:
            return {
                **state,
                "error": "No draft order found",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "payment",
            }

        tool_calls = state.get("tool_calls", [])

        # 1. 获取草稿订单详情
        draft_result = await get_draft_order_summary(draft_order_id=draft_order_id)

        if not draft_result.get("ok"):
            error_msg = draft_result.get("error", {}).get("message", "Draft order not found")
            return {
                **state,
                "error": error_msg,
                "error_code": "NOT_FOUND",
                "current_step": "payment",
            }

        draft_data = draft_result.get("data", {})
        tool_calls.append({
            "tool_name": "checkout.get_draft_order_summary",
            "request": {"draft_order_id": draft_order_id},
            "response_summary": {"status": draft_data.get("status")},
            "called_at": _now_iso(),
        })

        # 2. 检查草稿订单状态
        draft_status = draft_data.get("status", "pending")
        expires_at = draft_data.get("expires_at")

        if draft_status == "expired":
            return {
                **state,
                "error": "Draft order has expired. Please create a new order.",
                "error_code": "ORDER_EXPIRED",
                "current_step": "payment",
            }

        if draft_status == "paid":
            return {
                **state,
                "error": "This order has already been paid",
                "error_code": "ALREADY_PAID",
                "current_step": "payment",
            }

        # 3. 验证用户确认
        confirmation_items = execution_result.get("confirmation_items", [])
        missing_confirmations = []

        for item in confirmation_items:
            item_key = item.lower().replace(" ", "_")
            if not user_confirmation.get(item_key, False):
                missing_confirmations.append(item)

        if missing_confirmations:
            logger.info(
                "payment_node.missing_confirmations",
                missing=missing_confirmations,
            )
            return {
                **state,
                "needs_user_input": True,
                "missing_confirmations": missing_confirmations,
                "current_step": "awaiting_confirmation",
                "error": None,
            }

        # 4. 获取可用支付方式
        payment_methods = _get_available_payment_methods()

        # 5. 计算最终金额（包含支付处理费）
        payable_amount = draft_data.get("payable_amount", 0)
        if isinstance(payable_amount, dict):
            amount = payable_amount.get("amount", 0)
            currency = payable_amount.get("currency", "USD")
        else:
            amount = float(payable_amount)
            currency = "USD"

        # 6. 准备支付意图（模拟 Stripe PaymentIntent）
        settings = get_settings()
        payment_intent = {
            "id": f"pi_{_generate_id()}",
            "draft_order_id": draft_order_id,
            "amount": amount,
            "currency": currency,
            "status": "requires_payment_method",
            "client_secret": f"pi_{_generate_id()}_secret_{_generate_id()}",  # Mock
            "payment_methods": [m.get("method_type") for m in payment_methods],
            "expires_at": expires_at,
        }

        # 7. 使用 LLM 生成支付指引（可选）
        payment_guidance = None
        if settings.openai_api_key:
            try:
                payment_guidance = await _llm_payment_guidance(
                    amount=amount,
                    currency=currency,
                    payment_methods=payment_methods,
                )
            except Exception as e:
                logger.warning("payment_node.llm_guidance_failed", error=str(e))

        # 构建支付准备结果
        payment_ready = {
            "ready": True,
            "draft_order_id": draft_order_id,
            "payment_intent": payment_intent,
            "amount": amount,
            "currency": currency,
            "payment_methods": payment_methods,
            "guidance": payment_guidance,
            "expires_at": expires_at,
            "next_step": "confirm_payment",
            "summary": _generate_payment_summary(amount, currency, payment_methods),
        }

        logger.info(
            "payment_node.ready",
            draft_order_id=draft_order_id,
            amount=amount,
        )

        return {
            **state,
            "payment_ready": payment_ready,
            "payment_intent_id": payment_intent.get("id"),
            "tool_calls": tool_calls,
            "current_step": "payment_ready",
            "needs_user_input": True,  # 需要用户选择支付方式并确认
            "error": None,
        }

    except Exception as e:
        logger.error("payment_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "payment",
        }


async def confirm_payment_node(state: AgentState) -> AgentState:
    """
    确认支付节点

    处理用户提交的支付信息，完成支付
    """
    logger.info("confirm_payment_node.start")

    try:
        payment_intent_id = state.get("payment_intent_id")
        payment_method = state.get("selected_payment_method")
        draft_order_id = state.get("draft_order_id")

        if not payment_intent_id or not payment_method:
            return {
                **state,
                "error": "Payment method not selected",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "payment",
            }

        tool_calls = state.get("tool_calls", [])

        # 模拟支付处理
        # 在生产环境中，这里会调用 Stripe/PayPal API
        payment_result = await _process_payment(
            payment_intent_id=payment_intent_id,
            payment_method=payment_method,
            draft_order_id=draft_order_id,
        )

        tool_calls.append({
            "tool_name": "payment.confirm",
            "request": {
                "payment_intent_id": payment_intent_id,
                "payment_method": payment_method,
            },
            "response_summary": {"success": payment_result.get("success")},
            "called_at": _now_iso(),
        })

        if not payment_result.get("success"):
            error_msg = payment_result.get("error_message", "Payment failed")
            return {
                **state,
                "error": error_msg,
                "error_code": "PAYMENT_FAILED",
                "payment_result": payment_result,
                "current_step": "payment_failed",
            }

        # 支付成功
        logger.info(
            "confirm_payment_node.success",
            order_id=payment_result.get("order_id"),
        )

        return {
            **state,
            "payment_result": payment_result,
            "order_id": payment_result.get("order_id"),
            "tool_calls": tool_calls,
            "current_step": "payment_complete",
            "error": None,
        }

    except Exception as e:
        logger.error("confirm_payment_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "payment",
        }


def _get_available_payment_methods() -> list[dict]:
    """获取可用支付方式"""
    return [
        {
            "method_type": "card",
            "display_name": "Credit/Debit Card",
            "is_available": True,
            "processing_fee": 0.0,
            "icons": ["visa", "mastercard", "amex"],
        },
        {
            "method_type": "paypal",
            "display_name": "PayPal",
            "is_available": True,
            "processing_fee": 0.0,
            "icons": ["paypal"],
        },
        {
            "method_type": "apple_pay",
            "display_name": "Apple Pay",
            "is_available": True,
            "processing_fee": 0.0,
            "icons": ["apple"],
        },
        {
            "method_type": "google_pay",
            "display_name": "Google Pay",
            "is_available": True,
            "processing_fee": 0.0,
            "icons": ["google"],
        },
    ]


async def _process_payment(
    payment_intent_id: str,
    payment_method: str,
    draft_order_id: str,
) -> dict:
    """
    处理支付（模拟）

    在生产环境中，这里会：
    1. 调用支付网关 API
    2. 处理 3DS 验证
    3. 确认支付
    4. 创建正式订单
    """
    # 模拟支付处理延迟
    import asyncio
    await asyncio.sleep(0.5)

    # 模拟成功支付
    order_id = f"ord_{_generate_id()}"

    return {
        "success": True,
        "payment_id": payment_intent_id,
        "order_id": order_id,
        "status": "succeeded",
        "amount_charged": 99.99,  # 从实际数据获取
        "currency": "USD",
        "receipt_url": f"https://example.com/receipts/{order_id}",
        "error_message": None,
        "next_action": "View your order confirmation",
    }


async def _llm_payment_guidance(
    amount: float,
    currency: str,
    payment_methods: list,
) -> str | None:
    """使用 LLM 生成支付指引"""
    try:
        methods_str = ", ".join([m.get("display_name") for m in payment_methods])

        messages = [
            {"role": "system", "content": PAYMENT_PROMPT},
            {
                "role": "user",
                "content": f"""
Please provide brief payment guidance for:
- Amount: {amount} {currency}
- Available methods: {methods_str}

Keep it concise and helpful.
""",
            },
        ]

        result = await call_llm_and_parse(
            messages=messages,
            output_schema=PaymentResult,
            model_type="planner",
            temperature=0.3,
        )

        if result:
            return result.next_action
        return None

    except Exception as e:
        logger.warning("_llm_payment_guidance.failed", error=str(e))
        return None


def _generate_payment_summary(
    amount: float,
    currency: str,
    payment_methods: list,
) -> str:
    """生成支付摘要"""
    methods_str = ", ".join([m.get("display_name") for m in payment_methods[:3]])

    return f"""
Ready to complete your purchase!

Total: ${amount:.2f} {currency}

Available payment methods:
{methods_str}

Your payment is secured with industry-standard encryption.
""".strip()


def _generate_id() -> str:
    """生成随机 ID"""
    import secrets
    return secrets.token_hex(8)


def _now_iso() -> str:
    """返回当前时间的 ISO 格式"""
    return datetime.now(UTC).isoformat()


