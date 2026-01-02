"""
Compliance tools - 合规检查
Enhanced with risk_tag_definitions and shipping_lanes
"""

from typing import Any

from .base import MOCK_MODE, call_tool, mock_response


async def check_compliance(
    sku_id: str,
    destination_country: str,
    shipping_option_id: str | None = None,
    origin_country: str = "CN",
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    compliance.check_item - 检查商品合规性（基于风险标签和物流线路）

    Args:
        sku_id: SKU ID
        destination_country: 目的国
        shipping_option_id: 物流选项（可选）
        origin_country: 发货国（默认 CN）

    Returns:
        标准响应 Envelope，data 包含合规结果、可用线路、风险标签
    """
    if MOCK_MODE:
        return mock_response({
            "allowed": True,
            "item_risk_tags": [],
            "reason_codes": [],
            "blocked_by": [],
            "available_lanes": [
                {"lane_id": "lane_cn_us_standard", "name": "Standard Shipping", "compatible": True},
            ],
            "incompatible_lanes": [],
            "required_docs": [],
            "mitigations": [],
            "ruleset_version": "cr_2025_01_02",
        })

    return await call_tool(
        mcp_server="core",
        tool_name="compliance.check_item",
        params={
            "sku_id": sku_id,
            "destination_country": destination_country,
            "shipping_option_id": shipping_option_id,
            "origin_country": origin_country,
        },
        user_id=user_id,
    )


async def get_compliance_rules(
    destination_country: str,
    category_id: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    Get compliance rules for a destination country.

    Args:
        destination_country: ISO 2-letter country code
        category_id: Optional category filter

    Returns:
        Response envelope with compliance rules
    """
    if MOCK_MODE:
        return mock_response({
            "rules": [
                {
                    "rule_type": "import_restriction",
                    "name": {"en": "Battery Restriction", "zh": "电池限制"},
                    "severity": "warning",
                    "applies_to": ["battery_included"],
                },
                {
                    "rule_type": "certification",
                    "name": {"en": "CE Marking Required", "zh": "需要CE认证"},
                    "severity": "error",
                    "applies_to": ["electronics"],
                },
            ],
            "country": destination_country,
            "ruleset_version": "cr_2025_01_02",
        })

    return await call_tool(
        mcp_server="core",
        tool_name="compliance.get_rules",
        params={
            "destination_country": destination_country,
            "category_id": category_id,
        },
        user_id=user_id,
    )


async def get_policy_ruleset_version(
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    compliance.policy_ruleset_version - 获取当前规则版本

    Returns:
        标准响应 Envelope，data 包含规则版本号和支持的功能
    """
    if MOCK_MODE:
        return mock_response({
            "version": "cr_2025_01_02",
            "valid_from": "2025-01-02T00:00:00Z",
            "features": ["risk_tag_definitions", "shipping_lanes", "kg_relations"],
        })

    return await call_tool(
        mcp_server="core",
        tool_name="compliance.policy_ruleset_version",
        params={},
        user_id=user_id,
    )


async def get_risk_tags(
    severity: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    compliance.get_risk_tags - 获取风险标签定义

    Args:
        severity: 严重程度过滤 (info, warning, critical)

    Returns:
        标准响应 Envelope，data 包含风险标签列表
    """
    if MOCK_MODE:
        return mock_response({
            "risk_tags": [
                {
                    "id": "battery_included",
                    "name": "Battery Included",
                    "severity": "warning",
                    "affects_shipping": True,
                    "affects_customs": True,
                },
                {
                    "id": "liquid",
                    "name": "Liquid Content",
                    "severity": "warning",
                    "affects_shipping": True,
                    "affects_customs": True,
                },
            ],
            "total_count": 2,
        })

    return await call_tool(
        mcp_server="core",
        tool_name="compliance.get_risk_tags",
        params={"severity": severity},
        user_id=user_id,
    )


async def analyze_product_risks(
    description: str,
    title: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    compliance.analyze_product_risks - 分析产品描述检测风险标签

    Args:
        description: 产品描述文本
        title: 产品标题（可选）

    Returns:
        标准响应 Envelope，data 包含检测到的风险及置信度
    """
    if MOCK_MODE:
        return mock_response({
            "detected_risks": [
                {
                    "tag_id": "electronic",
                    "name": "Electronic",
                    "severity": "info",
                    "matched_keywords": ["usb", "charger"],
                    "confidence": 0.8,
                },
            ],
            "has_critical": False,
            "has_warnings": False,
            "risk_summary": {
                "critical_count": 0,
                "warning_count": 0,
                "info_count": 1,
            },
        })

    return await call_tool(
        mcp_server="core",
        tool_name="compliance.analyze_product_risks",
        params={
            "description": description,
            "title": title,
        },
        user_id=user_id,
    )


async def get_shipping_lanes(
    origin_country: str = "CN",
    dest_country: str | None = None,
    service_type: str | None = None,
    risk_tags: list[str] | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    compliance.get_shipping_lanes - 获取物流线路

    Args:
        origin_country: 发货国
        dest_country: 目的国（可选）
        service_type: 服务类型 (express, standard, economy)
        risk_tags: 风险标签列表，用于过滤兼容线路

    Returns:
        标准响应 Envelope，data 包含可用物流线路
    """
    if MOCK_MODE:
        return mock_response({
            "lanes": [
                {
                    "id": "lane_cn_us_standard",
                    "name": "China to US Standard",
                    "carrier": "YunExpress",
                    "service_type": "standard",
                    "delivery_days": {"min": 10, "max": 20},
                    "base_rate": 8.00,
                    "restrictions": {
                        "blocked_risk_tags": ["liquid", "powder", "food"],
                        "max_weight_g": 50000,
                    },
                },
            ],
            "total_count": 1,
            "filtered_out": 0,
        })

    return await call_tool(
        mcp_server="core",
        tool_name="compliance.get_shipping_lanes",
        params={
            "origin_country": origin_country,
            "dest_country": dest_country,
            "service_type": service_type,
            "risk_tags": risk_tags,
        },
        user_id=user_id,
    )

