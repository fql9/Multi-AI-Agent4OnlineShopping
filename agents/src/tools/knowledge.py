"""
Knowledge 工具 - RAG 证据检索

实现:
- knowledge.search: 证据检索
- knowledge.get_chunk: 获取完整 chunk

遵循 doc/10_rag_graphrag.md 规范
"""

from dataclasses import dataclass
from typing import Any

from .base import call_tool, mock_response, MOCK_MODE


@dataclass
class ChunkResult:
    """Chunk 检索结果"""
    chunk_id: str
    text: str
    source_type: str
    offer_id: str | None
    sku_id: str | None
    category_id: str | None
    language: str
    score: float
    citation: dict[str, Any]


@dataclass
class SearchResult:
    """搜索结果"""
    chunks: list[ChunkResult]
    total: int
    query: str


async def search(
    query: str,
    scope: str = "all",
    filters: dict[str, str] | None = None,
    top_k: int = 10,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    搜索证据库

    Args:
        query: 查询文本
        scope: 搜索范围 (offer|category|policy|logistics|support|all)
        filters: 过滤条件
        top_k: 返回数量
        user_id: 用户 ID

    Returns:
        包含 chunks 的响应
    """
    if MOCK_MODE:
        return mock_response({
            "chunks": [
                {
                    "chunk_id": "chunk_mock_001",
                    "text": f"Mock evidence for query: {query}",
                    "source_type": "manual",
                    "offer_id": None,
                    "score": 0.85,
                    "citation": {
                        "chunk_id": "chunk_mock_001",
                        "doc_version_hash": "mock_hash",
                        "offsets": None,
                    },
                }
            ],
            "total": 1,
            "query": query,
            "scope": scope,
        })

    return await call_tool(
        mcp_server="core",
        tool_name="knowledge.search",
        params={
            "query": query,
            "scope": scope,
            "filters": filters or {},
            "top_k": top_k,
        },
        user_id=user_id,
    )


async def get_chunk(
    chunk_id: str | None = None,
    chunk_ids: list[str] | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    获取完整 chunk 内容

    Args:
        chunk_id: 单个 chunk ID
        chunk_ids: 多个 chunk IDs
        user_id: 用户 ID

    Returns:
        包含 chunks 的响应
    """
    ids = chunk_ids or ([chunk_id] if chunk_id else [])

    if MOCK_MODE:
        return mock_response({
            "chunks": [
                {
                    "chunk_id": cid,
                    "text": f"Mock full text for chunk {cid}",
                    "source_type": "manual",
                    "offer_id": None,
                    "sku_id": None,
                    "category_id": None,
                    "language": "en",
                    "doc_version_hash": "mock_hash",
                    "offsets": None,
                    "highlight_info": {
                        "can_highlight": False,
                        "source_reference": None,
                    },
                }
                for cid in ids
            ],
            "total": len(ids),
        })

    return await call_tool(
        mcp_server="core",
        tool_name="knowledge.get_chunk",
        params={
            "chunk_ids": ids,
        },
        user_id=user_id,
    )


async def search_for_offer(
    query: str,
    offer_id: str,
    source_types: list[str] | None = None,
    top_k: int = 5,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    搜索特定商品的证据

    Args:
        query: 查询文本
        offer_id: 商品 ID
        source_types: 来源类型过滤
        top_k: 返回数量
        user_id: 用户 ID

    Returns:
        包含 chunks 的响应
    """
    filters: dict[str, str] = {"offer_id": offer_id}
    if source_types:
        filters["source_type"] = source_types[0]  # MVP: 只支持单个

    return await search(
        query=query,
        scope="offer",
        filters=filters,
        top_k=top_k,
        user_id=user_id,
    )


async def search_policy(
    query: str,
    category_id: str | None = None,
    top_k: int = 5,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    搜索政策/条款证据

    Args:
        query: 查询文本
        category_id: 类目 ID（可选）
        top_k: 返回数量
        user_id: 用户 ID

    Returns:
        包含 chunks 的响应
    """
    filters: dict[str, str] = {}
    if category_id:
        filters["category_id"] = category_id

    return await search(
        query=query,
        scope="policy",
        filters=filters,
        top_k=top_k,
        user_id=user_id,
    )


def extract_citations(search_response: dict[str, Any]) -> list[dict[str, Any]]:
    """
    从搜索结果中提取引用

    Args:
        search_response: knowledge.search 的响应

    Returns:
        citations 列表
    """
    if not search_response.get("ok"):
        return []

    data = search_response.get("data", {})
    chunks = data.get("chunks", [])

    return [
        {
            "chunk_id": chunk.get("chunk_id"),
            "text_preview": chunk.get("text", "")[:100] + "...",
            "source_type": chunk.get("source_type"),
            "score": chunk.get("score"),
            "citation": chunk.get("citation"),
        }
        for chunk in chunks
    ]

