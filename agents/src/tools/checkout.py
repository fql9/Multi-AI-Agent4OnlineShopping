"""
Checkout tools - 购物车与草稿订单
"""

import uuid
from typing import Any

from .base import MOCK_MODE, call_tool, mock_response


async def create_cart(
    user_id: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    cart.create - 创建购物车

    Returns:
        标准响应 Envelope，data 包含 cart_id
    """
    if MOCK_MODE:
        return mock_response({
            "cart_id": f"cart_{uuid.uuid4().hex[:12]}",
            "status": "active",
            "items": [],
            "created_at": "2024-12-24T12:00:00Z",
        })

    return await call_tool(
        mcp_server="checkout",
        tool_name="cart.create",
        params={
            "user_id": user_id,
            "session_id": session_id,
        },
        user_id=user_id,
        idempotency_key=f"cart_create_{user_id}_{session_id or 'default'}",
    )


async def add_to_cart(
    cart_id: str,
    sku_id: str,
    quantity: int = 1,
    selected_options: dict | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    cart.add_item - 添加商品到购物车

    Returns:
        标准响应 Envelope，data 包含更新后的购物车状态
    """
    if MOCK_MODE:
        return mock_response({
            "cart_id": cart_id,
            "items": [
                {
                    "sku_id": sku_id,
                    "quantity": quantity,
                    "selected_options": selected_options or {},
                },
            ],
            "updated_at": "2024-12-24T12:01:00Z",
        })

    return await call_tool(
        mcp_server="checkout",
        tool_name="cart.add_item",
        params={
            "cart_id": cart_id,
            "sku_id": sku_id,
            "quantity": quantity,
            "selected_options": selected_options or {},
        },
        user_id=user_id,
        idempotency_key=f"cart_add_{cart_id}_{sku_id}",
    )


async def compute_total(
    cart_id: str,
    address_id: str,
    shipping_option_id: str,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    checkout.compute_total - 计算订单总额

    Returns:
        标准响应 Envelope，data 包含价格明细
    """
    if MOCK_MODE:
        return mock_response({
            "cart_id": cart_id,
            "subtotal": 49.99,
            "shipping": 5.99,
            "tax_estimate": 4.50,
            "total": 60.48,
            "currency": "USD",
            "breakdown": [
                {"type": "item_subtotal", "amount": 49.99},
                {"type": "shipping", "amount": 5.99},
                {"type": "tax", "amount": 4.50},
            ],
            "assumptions": ["Tax estimate based on destination ZIP code"],
        })

    return await call_tool(
        mcp_server="checkout",
        tool_name="checkout.compute_total",
        params={
            "cart_id": cart_id,
            "address_id": address_id,
            "shipping_option_id": shipping_option_id,
        },
        user_id=user_id,
    )


async def create_draft_order(
    cart_id: str,
    user_id: str,
    address_id: str,
    shipping_option_id: str = "ship_standard",
    evidence_snapshot_id: str | None = None,
    consents: dict | None = None,
) -> dict[str, Any]:
    """
    checkout.create_draft_order - 创建草稿订单

    注意: 此操作不会扣款，需要用户确认后才能进入支付流程

    Returns:
        标准响应 Envelope，data 包含草稿订单详情
    """
    if MOCK_MODE:
        draft_order_id = f"do_{uuid.uuid4().hex[:12]}"
        return mock_response({
            "draft_order_id": draft_order_id,
            "status": "pending_confirmation",
            "payable_amount": {
                "amount": 60.48,
                "currency": "USD",
            },
            "expires_at": "2024-12-24T13:00:00Z",
            "confirmation_items": [
                {
                    "type": "tax_estimate_uncertainty",
                    "title": "Tax Estimate",
                    "description": "Final tax may vary based on actual import declaration",
                    "requires_ack": True,
                },
            ],
            "evidence_snapshot_id": evidence_snapshot_id,
        })

    return await call_tool(
        mcp_server="checkout",
        tool_name="checkout.create_draft_order",
        params={
            "cart_id": cart_id,
            "address_id": address_id,
            "shipping_option_id": shipping_option_id,
            "consents": consents or {
                "tax_estimate_ack": False,
                "return_policy_ack": False,
                "compliance_ack": False,
            },
        },
        user_id=user_id,
        idempotency_key=f"draft_order_{cart_id}",
    )

