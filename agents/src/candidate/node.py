"""
Candidate Agent Node implementation.

基于 Mission 召回候选商品。
"""

from datetime import UTC

import structlog

from ..graph.state import AgentState
from ..tools.catalog import get_offer_card, search_offers

logger = structlog.get_logger()


async def candidate_node(state: AgentState) -> AgentState:
    """
    Candidate Agent 节点

    基于 Mission 召回候选商品
    """
    logger.info("candidate_node.start")

    try:
        mission = state.get("mission")
        if not mission:
            return {
                **state,
                "error": "No mission found",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "candidate",
            }

        # 构建搜索查询
        search_query = mission.get("search_query", "")

        # 从硬性约束中提取类目和关键词
        for constraint in mission.get("hard_constraints", []):
            if constraint.get("type") == "category":
                search_query += f" {constraint.get('value', '')}"
            elif constraint.get("type") == "compatibility":
                search_query += f" {constraint.get('value', '')}"
            elif constraint.get("type") == "feature":
                search_query += f" {constraint.get('value', '')}"

        logger.info("candidate_node.search", query=search_query)

        # 调用搜索工具
        search_result = await search_offers(
            query=search_query.strip(),
            category_id=None,
            price_max=mission.get("budget_amount"),
            limit=20,  # 召回 20 个候选
        )

        if not search_result.get("ok"):
            error_msg = search_result.get("error", {}).get("message", "Search failed")
            logger.error("candidate_node.search_failed", error=error_msg)
            return {
                **state,
                "error": error_msg,
                "error_code": "UPSTREAM_ERROR",
                "current_step": "candidate",
            }

        offer_ids = search_result.get("data", {}).get("offer_ids", [])
        logger.info("candidate_node.search_results", count=len(offer_ids))

        if not offer_ids:
            # 没有找到商品，可能需要放宽搜索条件
            return {
                **state,
                "candidates": [],
                "current_step": "candidate_complete",
                "error": "No products found matching your requirements",
                "error_code": "NOT_FOUND",
            }

        # 获取每个 offer 的详细信息（限制前 10 个以控制成本）
        candidates = []
        for offer_id in offer_ids[:10]:
            try:
                aroc = await get_offer_card(offer_id=offer_id)
                if aroc.get("ok"):
                    candidate_data = aroc.get("data", {})
                    # 添加搜索分数
                    idx = offer_ids.index(offer_id)
                    scores = search_result.get("data", {}).get("scores", [])
                    candidate_data["search_score"] = scores[idx] if idx < len(scores) else 0.5
                    candidates.append(candidate_data)
            except Exception as e:
                logger.warning("candidate_node.get_aroc_failed", offer_id=offer_id, error=str(e))
                continue

        logger.info("candidate_node.complete", candidates_count=len(candidates))

        # 记录工具调用
        tool_calls = state.get("tool_calls", [])
        tool_calls.append({
            "tool_name": "catalog.search_offers",
            "request": {"query": search_query},
            "response_summary": {"count": len(offer_ids)},
            "called_at": _now_iso(),
        })

        return {
            **state,
            "candidates": candidates,
            "current_step": "candidate_complete",
            "tool_calls": tool_calls,
            "error": None,
        }

    except Exception as e:
        logger.error("candidate_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "candidate",
        }


def _now_iso() -> str:
    """返回当前时间的 ISO 格式"""
    from datetime import datetime
    return datetime.now(UTC).isoformat()
