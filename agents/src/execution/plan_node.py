"""
Plan Agent Node implementation.

基于核验后的候选生成 2-3 个可执行方案，并生成 AI 推荐理由。
"""

from datetime import datetime, UTC

import structlog

from ..config import get_settings
from ..graph.state import AgentState
from ..llm.client import call_llm_and_parse
from ..llm.prompts import AI_RECOMMENDATION_PROMPT, PLAN_PROMPT
from ..llm.schemas import (
    AIRecommendationReason,
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

        # 按价格排序找最便宜（防御性处理：checks 可能为 None）
        def get_total_price(x):
            checks = x.get("checks") or {}
            pricing = checks.get("pricing") or {}
            return pricing.get("total_price", float("inf"))
        
        by_price = sorted(verified_candidates, key=get_total_price)

        # 按送达时间排序找最快（防御性处理：checks 可能为 None）
        def get_fastest_days(x):
            checks = x.get("checks") or {}
            shipping = checks.get("shipping") or {}
            return shipping.get("fastest_days", 999)
        
        by_speed = sorted(verified_candidates, key=get_fastest_days)

        # 综合评分（加权）
        weights = mission.get("objective_weights", {"price": 0.4, "speed": 0.3, "risk": 0.3})

        def compute_score(candidate):
            # 防御性处理：checks/warnings 可能为 None
            checks = candidate.get("checks") or {}
            pricing = checks.get("pricing") or {}
            shipping = checks.get("shipping") or {}

            # 归一化分数（简化版）
            price = pricing.get("total_price", 100)
            days = shipping.get("fastest_days", 14)
            warnings_count = len(candidate.get("warnings") or [])

            price_score = max(0, 1 - price / 500)  # 假设 $500 是最大值
            speed_score = max(0, 1 - days / 30)  # 假设 30 天是最大值
            risk_score = max(0, 1 - warnings_count / 5)  # 假设 5 个警告是最大值

            return (
                weights.get("price", 0.4) * price_score +
                weights.get("speed", 0.3) * speed_score +
                weights.get("risk", 0.3) * risk_score
            )

        by_score = sorted(verified_candidates, key=compute_score, reverse=True)

        # 生成多个 Plan，确保使用不同的产品
        used_offer_ids = set()

        # 生成 Plan 1: 最便宜
        if by_price:
            cheapest = by_price[0]
            plans.append(_create_plan(
                candidate=cheapest,
                plan_name="Budget Saver",
                plan_type="cheapest",
                quantity=quantity,
                destination_country=destination_country,
                mission=mission,
            ))
            used_offer_ids.add(cheapest.get("offer_id"))

        # 生成 Plan 2: 最快
        # 如果最快的和最便宜的是同一个，就用第二快的（不同产品）
        fastest_candidate = None
        for candidate in by_speed:
            if candidate.get("offer_id") not in used_offer_ids:
                fastest_candidate = candidate
                break
        # 如果所有候选都已使用，仍然使用最快的（即使是同一个产品，但用不同的 plan 类型）
        if not fastest_candidate and by_speed:
            # 寻找速度排序中的第二个产品
            fastest_candidate = by_speed[1] if len(by_speed) > 1 else by_speed[0]
        
        if fastest_candidate:
            plans.append(_create_plan(
                candidate=fastest_candidate,
                plan_name="Express Delivery",
                plan_type="fastest",
                quantity=quantity,
                destination_country=destination_country,
                mission=mission,
            ))
            used_offer_ids.add(fastest_candidate.get("offer_id"))

        # 生成 Plan 3: 最佳价值
        # 如果综合评分最高的都已使用，就用第二/三个
        best_value_candidate = None
        for candidate in by_score:
            if candidate.get("offer_id") not in used_offer_ids:
                best_value_candidate = candidate
                break
        # 如果所有候选都已使用，仍然选择综合评分中的另一个
        if not best_value_candidate and len(by_score) > 2:
            best_value_candidate = by_score[2]
        elif not best_value_candidate and len(by_score) > 1:
            best_value_candidate = by_score[1]
        
        if best_value_candidate:
            plans.append(_create_plan(
                candidate=best_value_candidate,
                plan_name="Best Value",
                plan_type="best_value",
                quantity=quantity,
                destination_country=destination_country,
                mission=mission,
            ))
            used_offer_ids.add(best_value_candidate.get("offer_id"))

        # 如果还有更多候选，可以生成额外的方案（最多 5 个）
        extra_plan_names = [
            ("Premium Choice", "best_value"),
            ("Economy Option", "cheapest"),
        ]
        extra_idx = 0
        for candidate in verified_candidates:
            if len(plans) >= 5:
                break
            if candidate.get("offer_id") not in used_offer_ids:
                name, ptype = extra_plan_names[extra_idx % len(extra_plan_names)]
                plans.append(_create_plan(
                    candidate=candidate,
                    plan_name=name,
                    plan_type=ptype,
                    quantity=quantity,
                    destination_country=destination_country,
                    mission=mission,
                ))
                used_offer_ids.add(candidate.get("offer_id"))
                extra_idx += 1

        # 如果只有一个商品，只生成一个方案
        if len(plans) == 0 and verified_candidates:
            plans.append(_create_plan(
                candidate=verified_candidates[0],
                plan_name="Recommended",
                plan_type="best_value",
                quantity=quantity,
                destination_country=destination_country,
                mission=mission,
            ))

        # 使用 LLM 生成 AI 推荐理由
        settings = get_settings()
        recommendation = plans[0].plan_name if plans else "No plans available"
        recommendation_reason = "Based on your requirements"

        if settings.openai_api_key and plans:
            # 为每个方案生成 AI 推荐理由
            try:
                plans = await _generate_ai_recommendations(plans, mission)
            except Exception as e:
                logger.warning("plan_node.ai_recommendation_failed", error=str(e))
            
            # 优化方案推荐
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
    mission: dict | None = None,
) -> PurchasePlan:
    """创建购买方案"""
    offer_id = candidate.get("offer_id", "")
    sku_id = candidate.get("sku_id", "")
    candidate_info = candidate.get("candidate") or {}

    # 防御性处理：checks 可能为 None
    checks = candidate.get("checks") or {}
    pricing = checks.get("pricing") or {}
    shipping = checks.get("shipping") or {}

    unit_price = pricing.get("unit_price", 0)
    total_price = pricing.get("total_price", unit_price * quantity)

    # 估算运费和税费
    shipping_cost = shipping.get("cheapest_price", 9.99)
    tax_rate = 0.08 if destination_country == "US" else 0.15
    tax_estimate = total_price * tax_rate
    total_landed = total_price + shipping_cost + tax_estimate

    # 送达时间
    fastest_days = shipping.get("fastest_days", 7)

    # 警告和确认项（防御性处理）
    warnings = list(candidate.get("warnings") or [])  # 创建副本避免修改原始数据
    compliance = checks.get("compliance") or {}
    required_docs = compliance.get("required_docs") or []
    if required_docs:
        warnings.append(f"Required certifications: {', '.join(required_docs)}")

    # 提取产品亮点（基于产品信息）
    product_highlights = _extract_product_highlights(candidate_info, plan_type, mission)

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
        ai_recommendation=None,  # 将由 _generate_ai_recommendations 填充
        product_highlights=product_highlights,
    )


def _extract_product_highlights(
    candidate_info: dict,
    plan_type: str,
    mission: dict | None,
) -> list[str]:
    """提取产品亮点（防御性处理所有可能为 None 的字段）"""
    highlights = []
    
    # 根据方案类型添加亮点
    if plan_type == "cheapest":
        highlights.append("💰 Best price option")
    elif plan_type == "fastest":
        highlights.append("⚡ Fastest delivery")
    elif plan_type == "best_value":
        highlights.append("⭐ Best overall value")
    
    # 从产品信息中提取亮点（防御性处理）
    brand = candidate_info.get("brand") or {}
    if isinstance(brand, dict) and brand.get("confidence") == "high":
        highlights.append(f"🏷️ Verified brand: {brand.get('name', 'N/A')}")
    
    merchant = candidate_info.get("merchant") or {}
    if isinstance(merchant, dict):
        if merchant.get("verified"):
            highlights.append("✅ Verified seller")
        rating = merchant.get("rating")
        if rating:
            try:
                if float(rating) >= 4.5:
                    highlights.append(f"⭐ High-rated seller: {rating}/5")
            except (ValueError, TypeError):
                pass
    
    # 检查风险标签（防御性处理）
    risk_profile = candidate_info.get("risk_profile") or {}
    if isinstance(risk_profile, dict) and risk_profile.get("counterfeit_risk") == "low":
        highlights.append("🛡️ Low counterfeit risk")
    
    # 根据购买上下文添加亮点
    if mission:
        context = mission.get("purchase_context") or {}
        if isinstance(context, dict):
            if context.get("occasion") == "gift":
                highlights.append("🎁 Great for gifting")
            if context.get("budget_sensitivity") == "budget_conscious":
                highlights.append("💵 Budget-friendly choice")
    
    return highlights[:5]  # 最多返回 5 个亮点


async def _generate_ai_recommendations(
    plans: list[PurchasePlan],
    mission: dict,
) -> list[PurchasePlan]:
    """
    为每个方案生成 AI 推荐理由
    
    考虑因素：
    - 当前日期/季节/节日
    - 购买场景（送礼/自用）
    - 收礼人信息
    - 预算敏感度
    - 目的地国家
    - 用户语言
    """
    current_date = datetime.now(UTC).strftime("%Y-%m-%d")
    user_language = mission.get("detected_language", "en")
    destination_country = mission.get("destination_country", "US")
    purchase_context = mission.get("purchase_context", {})
    
    updated_plans = []
    
    for plan in plans:
        try:
            # 获取产品信息
            product_info = {
                "plan_name": plan.plan_name,
                "plan_type": plan.plan_type,
                "total_price": plan.total.total_landed_cost,
                "delivery_days": plan.delivery.min_days,
                "product_highlights": plan.product_highlights,
            }
            
            # 构建 LLM 请求
            context_str = f"""
Current date: {current_date}
User language: {user_language}
Destination country: {destination_country}
Purchase context: {purchase_context}
Product info: {product_info}

Generate a personalized recommendation reason for this product in the user's language ({user_language}).
"""
            
            messages = [
                {"role": "system", "content": AI_RECOMMENDATION_PROMPT},
                {"role": "user", "content": context_str},
            ]
            
            result = await call_llm_and_parse(
                messages=messages,
                output_schema=AIRecommendationReason,
                model_type="planner",
                temperature=0.3,
            )
            
            if result:
                plan.ai_recommendation = result
                # 注意：AIRecommendationReason 没有 product_highlights 字段
                # 产品亮点已在 _create_plan 中通过 _extract_product_highlights 生成
            
            updated_plans.append(plan)
            
        except Exception as e:
            logger.warning("_generate_ai_recommendation.failed", plan=plan.plan_name, error=str(e))
            updated_plans.append(plan)
    
    return updated_plans


def _generate_default_recommendation(
    plan: PurchasePlan,
    mission: dict,
) -> AIRecommendationReason:
    """生成默认推荐理由（当 LLM 不可用时）"""
    purchase_context = mission.get("purchase_context", {})
    occasion = purchase_context.get("occasion", "self_use")
    recipient = purchase_context.get("recipient")
    budget_sensitivity = purchase_context.get("budget_sensitivity", "moderate")
    
    # 根据方案类型生成默认理由
    if plan.plan_type == "cheapest":
        main_reason = "This is the most budget-friendly option available."
        value_prop = "Best price-to-value ratio"
    elif plan.plan_type == "fastest":
        main_reason = "Get your item delivered as quickly as possible."
        value_prop = "Fastest delivery time"
    else:
        main_reason = "A balanced choice of price, quality, and delivery speed."
        value_prop = "Best overall value"
    
    # 根据场景定制
    context_factors = []
    if occasion == "gift":
        context_factors.append("Gift purchase")
        if recipient:
            main_reason += f" Perfect for your {recipient}!"
    if budget_sensitivity == "budget_conscious":
        context_factors.append("Budget-conscious")
    
    return AIRecommendationReason(
        main_reason=main_reason,
        context_factors=context_factors,
        seasonal_relevance=None,
        value_proposition=value_prop,
        personalized_tip=None,
        product_highlights=plan.product_highlights[:3],
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
                "ai_reason": p.ai_recommendation.main_reason if p.ai_recommendation else None,
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
