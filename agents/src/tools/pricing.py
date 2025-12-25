"""
Pricing tools - 实时价格查询
"""

from typing import Any

from .base import MOCK_MODE, call_tool, mock_response


async def get_realtime_quote(
    sku_id: str,
    quantity: int = 1,
    destination_country: str = "US",
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    pricing.get_realtime_quote - 获取实时报价

    Args:
        sku_id: SKU ID
        quantity: 数量
        destination_country: 目的国

    Returns:
        标准响应 Envelope，data 包含价格信息
    """
    if MOCK_MODE:
        import random
        base_price = random.uniform(10, 100)
        return mock_response(
            {
                "sku_id": sku_id,
                "quantity": quantity,
                "unit_price": round(base_price, 2),
                "currency": "USD",
                "price_components": [
                    {"type": "base_price", "amount": round(base_price * 1.1, 2)},
                    {"type": "discount", "amount": round(-base_price * 0.1, 2)},
                ],
                "stock": {
                    "status": "in_stock",
                    "quantity_available": random.randint(10, 100),
                },
                "quote_expire_at": "2024-12-24T18:00:00Z",
            },
            ttl_seconds=60,  # 报价有效期 1 分钟
        )

    return await call_tool(
        mcp_server="core",
        tool_name="pricing.get_realtime_quote",
        params={
            "sku_id": sku_id,
            "quantity": quantity,
            "destination_country": destination_country,
        },
        user_id=user_id,
    )

