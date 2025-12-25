"""
Plan Generation Node - 生成可执行方案
"""

import structlog

from ..graph.state import AgentState

logger = structlog.get_logger()


async def plan_node(state: AgentState) -> AgentState:
    """
    Plan 节点

    基于核验后的候选生成 2-3 个可执行方案
    """
    logger.info("plan_node.start", verified_count=len(state.get("verified_candidates", [])))

    try:
        mission = state.get("mission", {})
        verified_candidates = state.get("verified_candidates", [])
        objective_weights = mission.get("objective_weights", {
            "price": 0.4,
            "speed": 0.3,
            "risk": 0.3,
        })

        if not verified_candidates:
            return {
                **state,
                "error": "No verified candidates available",
                "error_code": "NO_VALID_CANDIDATES",
                "current_step": "plan",
            }

        # 生成方案（简化版，实际应使用 LLM 进行更复杂的优化）
        plans = []

        # 方案 A: 最便宜
        sorted_by_price = sorted(
            verified_candidates,
            key=lambda x: x.get("realtime_price", {}).get("unit_price", float("inf")),
        )
        if sorted_by_price:
            plans.append({
                "plan_id": "plan_cheapest",
                "name": "最优价格方案",
                "description": "价格最低的选择",
                "items": [sorted_by_price[0]],
                "estimated_total": sorted_by_price[0].get("realtime_price", {}).get("unit_price", 0),
                "objective_score": {
                    "price": 1.0,
                    "speed": 0.5,
                    "risk": 0.5,
                },
            })

        # 方案 B: 最快到货
        sorted_by_speed = sorted(
            verified_candidates,
            key=lambda x: min(
                [opt.get("eta_min_days", 999) for opt in x.get("shipping_options", [{"eta_min_days": 999}])]
            ),
        )
        if sorted_by_speed:
            plans.append({
                "plan_id": "plan_fastest",
                "name": "最快到货方案",
                "description": "预计到货时间最短",
                "items": [sorted_by_speed[0]],
                "estimated_total": sorted_by_speed[0].get("realtime_price", {}).get("unit_price", 0),
                "objective_score": {
                    "price": 0.5,
                    "speed": 1.0,
                    "risk": 0.5,
                },
            })

        # 方案 C: 综合最优（加权评分）
        def calculate_weighted_score(candidate):
            price_score = 1.0 / (1 + candidate.get("realtime_price", {}).get("unit_price", 100))
            speed_score = 1.0 / (1 + min(
                [opt.get("eta_min_days", 30) for opt in candidate.get("shipping_options", [{"eta_min_days": 30}])]
            ))
            risk_score = 1.0 - candidate.get("risk_profile", {}).get("overall_risk", 0.5)

            return (
                objective_weights.get("price", 0.4) * price_score +
                objective_weights.get("speed", 0.3) * speed_score +
                objective_weights.get("risk", 0.3) * risk_score
            )

        sorted_by_weighted = sorted(verified_candidates, key=calculate_weighted_score, reverse=True)
        if sorted_by_weighted:
            plans.append({
                "plan_id": "plan_balanced",
                "name": "综合推荐方案",
                "description": "平衡价格、速度和风险",
                "items": [sorted_by_weighted[0]],
                "estimated_total": sorted_by_weighted[0].get("realtime_price", {}).get("unit_price", 0),
                "objective_score": {
                    "price": 0.7,
                    "speed": 0.7,
                    "risk": 0.7,
                },
            })

        logger.info("plan_node.complete", plans_count=len(plans))

        return {
            **state,
            "plans": plans,
            "current_step": "plan_complete",
            "needs_user_input": True,  # 等待用户选择方案
            "error": None,
        }

    except Exception as e:
        logger.error("plan_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "plan",
        }

