"""
Shipping tools - 物流与地址
"""

from typing import Any

from .base import MOCK_MODE, call_tool, mock_response


async def validate_address(
    country: str,
    state: str | None = None,
    city: str | None = None,
    postal_code: str | None = None,
    address_line1: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    shipping.validate_address - 地址校验

    Returns:
        标准响应 Envelope，data 包含规范化地址和可达性
    """
    if MOCK_MODE:
        return mock_response({
            "normalized_address": {
                "country": country,
                "state": state or "CA",
                "city": city or "Los Angeles",
                "postal_code": postal_code or "90001",
                "address_line1": address_line1 or "123 Main St",
            },
            "is_deliverable": True,
            "suggestions": [],
        })

    return await call_tool(
        mcp_server="core",
        tool_name="shipping.validate_address",
        params={
            "country": country,
            "state": state,
            "city": city,
            "postal_code": postal_code,
            "address_line1": address_line1,
        },
        user_id=user_id,
    )


async def quote_shipping_options(
    items: list[dict],
    destination_country: str = "US",
    destination_postal_code: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    shipping.quote_options - 获取物流选项

    Args:
        items: 商品列表 [{"sku_id": "...", "qty": 1}]
        destination_country: 目的国
        destination_postal_code: 目的地邮编

    Returns:
        标准响应 Envelope，data 包含物流选项
    """
    if MOCK_MODE:
        return mock_response(
            {
                "options": [
                    {
                        "shipping_option_id": "ship_standard",
                        "carrier": "Standard Shipping",
                        "service_level": "standard",
                        "price": 5.99,
                        "currency": "USD",
                        "eta_min_days": 7,
                        "eta_max_days": 14,
                        "tracking_supported": True,
                        "constraints": [],
                    },
                    {
                        "shipping_option_id": "ship_express",
                        "carrier": "Express Shipping",
                        "service_level": "express",
                        "price": 15.99,
                        "currency": "USD",
                        "eta_min_days": 3,
                        "eta_max_days": 5,
                        "tracking_supported": True,
                        "constraints": [],
                    },
                ],
                "quote_expire_at": "2024-12-24T18:00:00Z",
            },
            ttl_seconds=300,  # 物流报价有效期 5 分钟
        )

    return await call_tool(
        mcp_server="core",
        tool_name="shipping.quote_options",
        params={
            "items": items,
            "destination": {
                "country": destination_country,
                "postal_code": destination_postal_code,
            },
        },
        user_id=user_id,
    )

