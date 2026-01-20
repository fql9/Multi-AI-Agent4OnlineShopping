"""
Catalog tools - 商品搜索与检索
Enhanced with KG support
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

    # 构建 filters，只包含非 None 的值
    filters: dict[str, Any] = {
        "destination_country": destination_country,
        "must_in_stock": must_in_stock,
    }
    if category_id is not None:
        filters["category_id"] = category_id
    if brand is not None:
        filters["brand"] = brand
    if price_min is not None or price_max is not None:
        filters["price_range"] = {}
        if price_min is not None:
            filters["price_range"]["min"] = price_min
        if price_max is not None:
            filters["price_range"]["max"] = price_max

    return await call_tool(
        mcp_server="core",
        tool_name="catalog.search_offers",
        params={
            "query": query,
            "filters": filters,
            "sort": sort,
            "limit": limit,
        },
        user_id=user_id,
    )


async def get_offer_card(
    offer_id: str,
    include_kg_relations: bool = True,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    catalog.get_offer_card - 获取 AROC (AI-Ready Offer Card) v0.2
    
    Enhanced with KG relations, brand/merchant details, and version tracking

    Args:
        offer_id: 商品 ID
        include_kg_relations: 是否包含 KG 关系数据

    Returns:
        标准响应 Envelope，data 包含完整 AROC（含 KG 关系）
    """
    if MOCK_MODE:
        # Mock AROC 数据
        return mock_response({
            "aroc_version": "0.2",
            "offer_id": offer_id,
            "spu_id": f"spu_{offer_id[3:]}",
            "merchant_id": "m_001",
            "titles": [
                {"locale": "en", "lang": "en", "text": f"Test Product {offer_id}"},
                {"locale": "zh", "lang": "zh", "text": f"测试商品 {offer_id}"},
            ],
            "brand": {
                "name": "TestBrand",
                "normalized_id": "brand_test",
                "confidence": "high",
            },
            "merchant": {
                "id": "m_001",
                "name": "Test Store",
                "rating": 4.5,
                "verified": True,
                "risk_level": "normal",
            },
            "category": {
                "cat_id": "c_electronics",
                "path": ["Electronics", "Gadgets"],
                "full_path": "Electronics > Gadgets",
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
            "version": {
                "hash": "mock_hash_123",
                "source": "mock",
            },
            "kg_relations": [] if not include_kg_relations else [
                {"type": "IN_CATEGORY", "from": {"type": "offer", "id": offer_id}, "to": {"type": "category", "id": "c_electronics"}},
            ],
        })

    return await call_tool(
        mcp_server="core",
        tool_name="catalog.get_offer_card",
        params={
            "offer_id": offer_id,
            "include_kg_relations": include_kg_relations,
        },
        user_id=user_id,
    )


async def get_brand(
    brand_id: str,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    catalog.get_brand - 获取品牌详情

    Args:
        brand_id: 品牌 ID

    Returns:
        标准响应 Envelope，data 包含品牌信息
    """
    if MOCK_MODE:
        return mock_response({
            "brand_id": brand_id,
            "name": "Test Brand",
            "normalized_name": "test_brand",
            "confidence": "high",
            "offer_count": 100,
        })

    return await call_tool(
        mcp_server="core",
        tool_name="catalog.get_brand",
        params={"brand_id": brand_id},
        user_id=user_id,
    )


async def get_merchant(
    merchant_id: str,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    catalog.get_merchant - 获取商家详情及风险评估

    Args:
        merchant_id: 商家 ID

    Returns:
        标准响应 Envelope，data 包含商家信息和风险等级
    """
    if MOCK_MODE:
        return mock_response({
            "merchant_id": merchant_id,
            "name": "Test Store",
            "rating": 4.5,
            "total_products": 500,
            "verified": True,
            "risk_level": "normal",
        })

    return await call_tool(
        mcp_server="core",
        tool_name="catalog.get_merchant",
        params={"merchant_id": merchant_id},
        user_id=user_id,
    )


async def get_category_tree(
    parent_id: str | None = None,
    depth: int = 2,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    catalog.get_category_tree - 获取类目树

    Args:
        parent_id: 父类目 ID（为空则获取根类目）
        depth: 返回层级深度

    Returns:
        标准响应 Envelope，data 包含类目树
    """
    if MOCK_MODE:
        return mock_response({
            "parent_id": parent_id,
            "categories": [
                {"id": "c_1", "name": "Electronics", "product_count": 1000, "level": 1},
                {"id": "c_2", "name": "Clothing", "product_count": 800, "level": 1},
            ],
            "total_count": 2,
        })

    return await call_tool(
        mcp_server="core",
        tool_name="catalog.get_category_tree",
        params={
            "parent_id": parent_id,
            "depth": depth,
        },
        user_id=user_id,
    )


async def get_kg_relations(
    entity_type: str,
    entity_id: str,
    relation_types: list[str] | None = None,
    direction: str = "both",
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    catalog.get_kg_relations - 获取 KG 关系

    Args:
        entity_type: 实体类型 (offer, sku, brand, category, merchant)
        entity_id: 实体 ID
        relation_types: 关系类型过滤
        direction: 方向 (outgoing, incoming, both)

    Returns:
        标准响应 Envelope，data 包含 KG 关系列表
    """
    if MOCK_MODE:
        return mock_response({
            "entity": {"type": entity_type, "id": entity_id},
            "direction": direction,
            "relations": [
                {"type": "IN_CATEGORY", "from": {"type": entity_type, "id": entity_id}, "to": {"type": "category", "id": "c_1"}},
            ],
            "total_count": 1,
        })

    return await call_tool(
        mcp_server="core",
        tool_name="catalog.get_kg_relations",
        params={
            "entity_type": entity_type,
            "entity_id": entity_id,
            "relation_types": relation_types,
            "direction": direction,
        },
        user_id=user_id,
    )

