"""
Plan Agent Node implementation.

基于核验后的候选生成 2-3 个可执行方案。
"""

import structlog

from ..config import get_settings
from ..graph.state import AgentState
from ..llm.client import call_llm_and_parse
from ..llm.prompts import PLAN_PROMPT
from ..llm.schemas import (
    DeliveryEstimate,
    PlanItem,
    PlanRecommendation,
    PurchasePlan,
    TotalBreakdown,
)

logger = structlog.get_logger()


async def plan_node(state: AgentState) -> AgentState:
    """
    Plan 节点

    基于核验后的候选生成 2-3 个可执行方案
    """
    logger.info("plan_node.start")

    try:
        mission = state.get("mission")
        verified_candidates = state.get("verified_candidates", [])

        if not mission:
            return {
                **state,
                "error": "No mission found",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "plan",
            }

        if not verified_candidates:
            return {
                **state,
                "error": "No verified candidates available",
                "error_code": "NOT_FOUND",
                "current_step": "plan",
                "plans": [],
            }

        destination_country = mission.get("destination_country", "US")
        quantity = mission.get("quantity", 1)

        # 生成方案
        plans = []

        # 按价格排序找最便宜
        by_price = sorted(
            verified_candidates,
            key=lambda x: x.get("checks", {}).get("pricing", {}).get("total_price", float("inf"))
        )

        # 按送达时间排序找最快
        by_speed = sorted(
            verified_candidates,
            key=lambda x: x.get("checks", {}).get("shipping", {}).get("fastest_days", 999)
        )

        # 综合评分（加权）
        weights = mission.get("objective_weights", {"price": 0.4, "speed": 0.3, "risk": 0.3})

        def compute_score(candidate):
            pricing = candidate.get("checks", {}).get("pricing", {})
            shipping = candidate.get("checks", {}).get("shipping", {})

            # 归一化分数（简化版）
            price = pricing.get("total_price", 100)
            days = shipping.get("fastest_days", 14)
            warnings_count = len(candidate.get("warnings", []))

            price_score = max(0, 1 - price / 500)  # 假设 $500 是最大值
            speed_score = max(0, 1 - days / 30)  # 假设 30 天是最大值
            risk_score = max(0, 1 - warnings_count / 5)  # 假设 5 个警告是最大值

            return (
                weights.get("price", 0.4) * price_score +
                weights.get("speed", 0.3) * speed_score +
                weights.get("risk", 0.3) * risk_score
            )

        by_score = sorted(verified_candidates, key=compute_score, reverse=True)

        # 生成 Plan 1: 最便宜
        if by_price:
            cheapest = by_price[0]
            plans.append(_create_plan(
                candidate=cheapest,
                plan_name="Budget Saver",
                plan_type="cheapest",
                quantity=quantity,
                destination_country=destination_country,
            ))

        # 生成 Plan 2: 最快
        if by_speed and (not by_price or by_speed[0].get("offer_id") != by_price[0].get("offer_id")):
            fastest = by_speed[0]
            plans.append(_create_plan(
                candidate=fastest,
                plan_name="Express Delivery",
                plan_type="fastest",
                quantity=quantity,
                destination_country=destination_country,
            ))

        # 生成 Plan 3: 最佳价值
        if by_score:
            best = by_score[0]
            # 确保不重复
            existing_offer_ids = [p.items[0].offer_id for p in plans if p.items]
            if best.get("offer_id") not in existing_offer_ids:
                plans.append(_create_plan(
                    candidate=best,
                    plan_name="Best Value",
                    plan_type="best_value",
                    quantity=quantity,
                    destination_country=destination_country,
                ))

        # 如果只有一个商品，只生成一个方案
        if len(plans) == 0 and verified_candidates:
            plans.append(_create_plan(
                candidate=verified_candidates[0],
                plan_name="Recommended",
                plan_type="best_value",
                quantity=quantity,
                destination_country=destination_country,
            ))

        # 可选：使用 LLM 优化方案
        settings = get_settings()
        recommendation = plans[0].plan_name if plans else "No plans available"
        recommendation_reason = "Based on your requirements"

        if settings.openai_api_key and plans:
            try:
                llm_result = await _llm_optimize_plans(mission, verified_candidates, plans)
                if llm_result:
                    recommendation = llm_result.recommended_plan
                    recommendation_reason = llm_result.recommendation_reason
            except Exception as e:
                logger.warning("plan_node.llm_optimization_failed", error=str(e))

        logger.info("plan_node.complete", plans_count=len(plans))

        return {
            **state,
            "plans": [p.model_dump() for p in plans],
            "recommended_plan": recommendation,
            "recommendation_reason": recommendation_reason,
            "current_step": "plan_complete",
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


def _create_plan(
    candidate: dict,
    plan_name: str,
    plan_type: str,
    quantity: int,
    destination_country: str,
) -> PurchasePlan:
    """创建购买方案"""
    offer_id = candidate.get("offer_id", "")
    sku_id = candidate.get("sku_id", "")
    candidate.get("candidate", {})

    pricing = candidate.get("checks", {}).get("pricing", {})
    shipping = candidate.get("checks", {}).get("shipping", {})

    unit_price = pricing.get("unit_price", 0)
    total_price = pricing.get("total_price", unit_price * quantity)

    # 估算运费和税费
    shipping_cost = shipping.get("cheapest_price", 9.99)
    tax_rate = 0.08 if destination_country == "US" else 0.15
    tax_estimate = total_price * tax_rate
    total_landed = total_price + shipping_cost + tax_estimate

    # 送达时间
    fastest_days = shipping.get("fastest_days", 7)

    # 警告和确认项
    warnings = candidate.get("warnings", [])
    compliance = candidate.get("checks", {}).get("compliance", {})
    if compliance.get("required_docs"):
        warnings.append(f"Required certifications: {', '.join(compliance['required_docs'])}")

    return PurchasePlan(
        plan_name=plan_name,
        plan_type=plan_type,
        items=[
            PlanItem(
                offer_id=offer_id,
                sku_id=sku_id or f"{offer_id}_default",
                quantity=quantity,
                unit_price=unit_price,
                subtotal=total_price,
            )
        ],
        shipping_option_id="ship_standard",
        shipping_option_name="Standard Shipping",
        total=TotalBreakdown(
            subtotal=round(total_price, 2),
            shipping_cost=round(shipping_cost, 2),
            tax_estimate=round(tax_estimate, 2),
            total_landed_cost=round(total_landed, 2),
        ),
        delivery=DeliveryEstimate(
            min_days=fastest_days,
            max_days=fastest_days + 7,
        ),
        risks=warnings,
        confidence=0.8 if not warnings else 0.6,
        confirmation_items=[
            "Tax estimate acknowledgment",
            "Return policy acknowledgment",
        ],
    )


async def _llm_optimize_plans(mission: dict, candidates: list, plans: list) -> PlanRecommendation | None:
    """使用 LLM 优化方案推荐"""
    del candidates  # unused

    try:
        # 简化数据
        plans_summary = [
            {
                "name": p.plan_name,
                "type": p.plan_type,
                "total": p.total.total_landed_cost,
                "delivery_days": p.delivery.min_days,
                "risks": p.risks,
            }
            for p in plans
        ]

        messages = [
            {"role": "system", "content": PLAN_PROMPT},
            {"role": "user", "content": f"Mission: {mission}\n\nAvailable plans: {plans_summary}\n\nWhich plan do you recommend?"},
        ]

        result = await call_llm_and_parse(
            messages=messages,
            output_schema=PlanRecommendation,
            model_type="planner",
            temperature=0.1,
        )
        return result

    except Exception as e:
        logger.warning("_llm_optimize_plans.failed", error=str(e))
        return None
