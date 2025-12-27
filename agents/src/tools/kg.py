"""
知识图谱工具 - 封装 KG 相关 API

遵循 doc/09_kg_design.md 规范
"""

from .base import call_tool


async def get_compatible_models(sku_id: str | None = None, offer_id: str | None = None) -> dict:
    """获取 SKU 兼容的设备型号"""
    params = {}
    if sku_id:
        params["sku_id"] = sku_id
    if offer_id:
        params["offer_id"] = offer_id
    return await call_tool("kg.get_compatible_models", params)


async def get_substitutes(
    offer_id: str,
    min_similarity: float = 0.5,
    limit: int = 10,
) -> dict:
    """获取替代商品"""
    return await call_tool("kg.get_substitutes", {
        "offer_id": offer_id,
        "min_similarity": min_similarity,
        "limit": limit,
    })


async def get_complements(
    offer_id: str,
    relation_type: str = "all",
    limit: int = 10,
) -> dict:
    """获取配件/组合商品"""
    return await call_tool("kg.get_complements", {
        "offer_id": offer_id,
        "relation_type": relation_type,
        "limit": limit,
    })


async def get_sku_certificates(sku_id: str | None = None, offer_id: str | None = None) -> dict:
    """获取 SKU 的认证证书"""
    params = {}
    if sku_id:
        params["sku_id"] = sku_id
    if offer_id:
        params["offer_id"] = offer_id
    return await call_tool("kg.get_sku_certificates", params)


async def get_brand_info(brand_id: str | None = None, brand_name: str | None = None) -> dict:
    """获取品牌信息"""
    params = {}
    if brand_id:
        params["brand_id"] = brand_id
    if brand_name:
        params["brand_name"] = brand_name
    return await call_tool("kg.get_brand_info", params)


async def get_merchant_info(merchant_id: str) -> dict:
    """获取商家信息"""
    return await call_tool("kg.get_merchant_info", {
        "merchant_id": merchant_id,
    })

