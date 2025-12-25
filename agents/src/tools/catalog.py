"""
Catalog tools - 商品搜索与检索
"""

from typing import Any

from .base import MOCK_MODE, call_tool, mock_response


async def search_offers(
    query: str,
    destination_country: str = "US",
    category_id: str | None = None,
    price_min: float | None = None,
    price_max: float | None = None,
    brand: str | None = None,
    must_in_stock: bool = True,
    sort: str = "relevance",
    limit: int = 50,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    catalog.search_offers - 搜索商品

    Args:
        query: 搜索关键词
        destination_country: 目的国
        category_id: 类目 ID（可选）
        price_min: 最低价格
        price_max: 最高价格
        brand: 品牌
        must_in_stock: 是否必须有库存
        sort: 排序方式 (relevance|price|sales|rating)
        limit: 返回数量

    Returns:
        标准响应 Envelope，data 包含 offer_ids 和 scores
    """
    if MOCK_MODE:
        # Mock 数据
        mock_offers = [
            f"of_{i:06d}" for i in range(1, min(limit + 1, 51))
        ]
        return mock_response({
            "offer_ids": mock_offers,
            "scores": [0.95 - i * 0.01 for i in range(len(mock_offers))],
            "total_count": 100,
            "has_more": True,
        })

    return await call_tool(
        mcp_server="core",
        tool_name="catalog.search_offers",
        params={
            "query": query,
            "filters": {
                "destination_country": destination_country,
                "category_id": category_id,
                "price_range": {
                    "min": price_min,
                    "max": price_max,
                } if price_min or price_max else None,
                "brand": brand,
                "must_in_stock": must_in_stock,
            },
            "sort": sort,
            "limit": limit,
        },
        user_id=user_id,
    )


async def get_offer_card(
    offer_id: str,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    catalog.get_offer_card - 获取 AROC (AI-Ready Offer Card)

    Args:
        offer_id: 商品 ID

    Returns:
        标准响应 Envelope，data 包含完整 AROC
    """
    if MOCK_MODE:
        # Mock AROC 数据
        return mock_response({
            "aroc_version": "0.1",
            "offer_id": offer_id,
            "spu_id": f"spu_{offer_id[3:]}",
            "merchant_id": "m_001",
            "titles": [
                {"lang": "en", "text": f"Test Product {offer_id}"},
                {"lang": "zh", "text": f"测试商品 {offer_id}"},
            ],
            "brand": {
                "name": "TestBrand",
                "normalized_id": "brand_test",
                "confidence": "high",
            },
            "category": {
                "cat_id": "c_electronics",
                "path": ["Electronics", "Gadgets"],
            },
            "attributes": [
                {
                    "attr_id": "color",
                    "name": {"en": "Color", "zh": "颜色"},
                    "value": {"type": "enum", "normalized": "Black"},
                    "confidence": 0.95,
                },
            ],
            "variants": {
                "axes": [{"axis": "color", "values": ["Black", "White"]}],
                "skus": [
                    {
                        "sku_id": f"sku_{offer_id[3:]}_001",
                        "options": {"color": "Black"},
                        "packaging": {"weight_g": 200, "dim_mm": [100, 80, 30]},
                        "risk_tags": [],
                        "compliance_tags": [],
                    },
                ],
            },
            "policies": {
                "return_policy_id": "rp_standard",
                "warranty_policy_id": "wp_1year",
                "policy_summary": {"en": "30-day return", "zh": "30天退货"},
            },
            "risk_profile": {
                "fragile": False,
                "sizing_uncertainty": "low",
                "counterfeit_risk": "low",
                "after_sale_complexity": "low",
            },
        })

    return await call_tool(
        mcp_server="core",
        tool_name="catalog.get_offer_card",
        params={"offer_id": offer_id},
        user_id=user_id,
    )

