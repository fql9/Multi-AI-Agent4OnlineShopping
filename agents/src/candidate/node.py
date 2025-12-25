"""
Candidate Generation Agent Node implementation.
"""

import structlog

from ..graph.state import AgentState
from ..tools.catalog import get_offer_card, search_offers

logger = structlog.get_logger()


async def candidate_node(state: AgentState) -> AgentState:
    """
    Candidate Agent 节点

    基于 Mission 召回候选商品
    """
    logger.info("candidate_node.start", mission=state.get("mission"))

    try:
        mission = state.get("mission")
        if not mission:
            return {
                **state,
                "error": "Mission not found",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "candidate",
            }

        # 调用 catalog.search_offers
        search_result = await search_offers(
            query=mission.get("query", ""),
            destination_country=mission.get("destination_country", "US"),
            price_max=mission.get("budget_amount"),
            limit=100,
        )

        if not search_result.get("ok"):
            return {
                **state,
                "error": search_result.get("error", {}).get("message", "Search failed"),
                "error_code": search_result.get("error", {}).get("code", "UPSTREAM_ERROR"),
                "current_step": "candidate",
            }

        offer_ids = search_result.get("data", {}).get("offer_ids", [])

        # 获取每个 offer 的详细信息
        candidates = []
        for offer_id in offer_ids[:50]:  # 限制初始候选数量
            card_result = await get_offer_card(offer_id)
            if card_result.get("ok"):
                candidates.append(card_result.get("data"))

        logger.info(
            "candidate_node.complete",
            candidates_count=len(candidates),
        )

        return {
            **state,
            "candidates": candidates,
            "current_step": "candidate_complete",
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

