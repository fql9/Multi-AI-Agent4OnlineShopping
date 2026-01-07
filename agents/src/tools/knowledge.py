"""
Knowledge tools - RAG 检索
"""

from typing import Any

from .base import MOCK_MODE, call_tool, mock_response


async def search_knowledge(
    query: str,
    source_types: list[str] | None = None,
    offer_id: str | None = None,
    category_id: str | None = None,
    language: str = "en",
    limit: int = 10,
    min_score: float = 0.3,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    knowledge.search - 搜索知识库

    Args:
        query: 搜索查询
        source_types: 来源类型过滤
        offer_id: 按商品 ID 过滤
        category_id: 按类目过滤
        language: 语言
        limit: 最大结果数
        min_score: 最低相关性分数

    Returns:
        标准响应 Envelope，data 包含检索结果
    """
    if MOCK_MODE:
        return mock_response({
            "chunks": [
                {
                    "chunk_id": "chunk_mock_001",
                    "text": f"This is mock evidence about {query}.",
                    "source_type": "product_description",
                    "offer_id": offer_id,
                    "score": 0.85,
                    "citation": "[chunk:chunk_mock_001]",
                },
            ],
            "total_count": 1,
            "query": query,
            "method": "mock",
        })

    return await call_tool(
        mcp_server="core",
        tool_name="knowledge.search",
        params={
            "query": query,
            "source_types": source_types,
            "offer_id": offer_id,
            "category_id": category_id,
            "language": language,
            "limit": limit,
            "min_score": min_score,
        },
        user_id=user_id,
    )


async def get_chunk(
    chunk_id: str,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    knowledge.get_chunk - 获取证据块

    Args:
        chunk_id: 证据块 ID

    Returns:
        标准响应 Envelope，data 包含完整证据块
    """
    if MOCK_MODE:
        return mock_response({
            "chunk_id": chunk_id,
            "text": "This is the full content of the evidence chunk.",
            "source_type": "product_description",
            "offer_id": None,
            "offsets": {"start": 0, "end": 100},
            "citation": f"[chunk:{chunk_id}]",
        })

    return await call_tool(
        mcp_server="core",
        tool_name="knowledge.get_chunk",
        params={"chunk_id": chunk_id},
        user_id=user_id,
    )


async def index_product(
    offer_id: str,
    content: dict,
    source_type: str = "product_description",
    language: str = "en",
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    knowledge.index_product - 索引产品内容

    Args:
        offer_id: 商品 ID
        content: 要索引的内容
        source_type: 来源类型
        language: 语言

    Returns:
        标准响应 Envelope，data 包含索引结果
    """
    if MOCK_MODE:
        return mock_response({
            "offer_id": offer_id,
            "indexed_chunks": 1,
            "chunk_ids": ["chunk_mock_new"],
        })

    return await call_tool(
        mcp_server="core",
        tool_name="knowledge.index_product",
        params={
            "offer_id": offer_id,
            "content": content,
            "source_type": source_type,
            "language": language,
        },
        user_id=user_id,
    )


async def search_with_context(
    query: str,
    offer_ids: list[str] | None = None,
    include_compliance: bool = True,
    include_shipping: bool = True,
    language: str = "en",
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    综合知识搜索 - 同时搜索产品、合规和物流信息

    Args:
        query: 搜索查询
        offer_ids: 限定的商品 ID 列表
        include_compliance: 是否包含合规信息
        include_shipping: 是否包含物流信息
        language: 语言

    Returns:
        组合的搜索结果
    """
    results = {
        "product_chunks": [],
        "compliance_chunks": [],
        "shipping_chunks": [],
        "total_chunks": 0,
    }

    # 搜索产品信息
    product_result = await search_knowledge(
        query=query,
        source_types=["product_description", "specification", "qa"],
        language=language,
        limit=5,
        user_id=user_id,
    )
    if product_result.get("ok"):
        results["product_chunks"] = product_result.get("data", {}).get("chunks", [])

    # 搜索合规信息
    if include_compliance:
        compliance_result = await search_knowledge(
            query=f"{query} compliance certification",
            source_types=["compliance", "policy"],
            language=language,
            limit=3,
            user_id=user_id,
        )
        if compliance_result.get("ok"):
            results["compliance_chunks"] = compliance_result.get("data", {}).get("chunks", [])

    # 搜索物流信息
    if include_shipping:
        shipping_result = await search_knowledge(
            query=f"{query} shipping delivery",
            source_types=["shipping", "policy"],
            language=language,
            limit=3,
            user_id=user_id,
        )
        if shipping_result.get("ok"):
            results["shipping_chunks"] = shipping_result.get("data", {}).get("chunks", [])

    # 计算总数
    results["total_chunks"] = (
        len(results["product_chunks"]) +
        len(results["compliance_chunks"]) +
        len(results["shipping_chunks"])
    )

    return {"ok": True, "data": results}


