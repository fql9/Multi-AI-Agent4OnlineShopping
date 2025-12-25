"""
Compliance tools - 合规检查
"""

from typing import Any

from .base import MOCK_MODE, call_tool, mock_response


async def check_compliance(
    sku_id: str,
    destination_country: str,
    shipping_option_id: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    compliance.check_item - 检查商品合规性

    Args:
        sku_id: SKU ID
        destination_country: 目的国
        shipping_option_id: 物流选项（可选）

    Returns:
        标准响应 Envelope，data 包含合规结果
    """
    if MOCK_MODE:
        return mock_response({
            "allowed": True,
            "reason_codes": [],
            "required_docs": [],
            "mitigations": [],
            "ruleset_version": "cr_2025_12_20",
        })

    return await call_tool(
        mcp_server="core",
        tool_name="compliance.check_item",
        params={
            "sku_id": sku_id,
            "destination_country": destination_country,
            "shipping_option_id": shipping_option_id,
        },
        user_id=user_id,
    )


async def get_policy_ruleset_version(
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    compliance.policy_ruleset_version - 获取当前规则版本

    Returns:
        标准响应 Envelope，data 包含规则版本号
    """
    if MOCK_MODE:
        return mock_response({
            "version": "cr_2025_12_20",
            "valid_from": "2024-12-20T00:00:00Z",
        })

    return await call_tool(
        mcp_server="core",
        tool_name="compliance.policy_ruleset_version",
        params={},
        user_id=user_id,
    )

