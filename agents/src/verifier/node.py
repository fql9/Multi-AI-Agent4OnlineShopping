"""
Verifier Agent Node implementation.

对候选商品进行实时核验。
"""

from datetime import UTC

import structlog

from ..config import get_settings
from ..graph.state import AgentState
from ..llm.client import get_llm_with_structured_output
from ..llm.prompts import VERIFIER_PROMPT
from ..llm.schemas import VerificationResult
from ..tools.compliance import check_compliance
from ..tools.pricing import get_realtime_quote
from ..tools.shipping import quote_shipping_options

logger = structlog.get_logger()


async def verifier_node(state: AgentState) -> AgentState:
    """
    Verifier Agent 节点

    对候选进行实时核验
    """
    logger.info("verifier_node.start")

    try:
        mission = state.get("mission")
        candidates = state.get("candidates", [])

        if not mission:
            return {
                **state,
                "error": "No mission found",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "verifier",
            }

        if not candidates:
            return {
                **state,
                "error": "No candidates to verify",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "verifier",
            }

        destination_country = mission.get("destination_country", "US")
        budget_amount = mission.get("budget_amount", float("inf"))

        verified_candidates = []
        rejected_candidates = []
        tool_calls = state.get("tool_calls", [])

        # 对每个候选进行核验（限制数量以控制成本）
        for candidate in candidates[:10]:
            offer_id = candidate.get("offer_id")
            sku_id = None

            # 获取默认 SKU
            skus = candidate.get("variants", {}).get("skus", [])
            if skus:
                sku_id = skus[0].get("sku_id")

            logger.info("verifier_node.checking", offer_id=offer_id, sku_id=sku_id)

            verification_result = {
                "offer_id": offer_id,
                "sku_id": sku_id,
                "candidate": candidate,
                "checks": {},
                "passed": True,
                "warnings": [],
                "rejection_reason": None,
            }

            # 1. 价格核验
            try:
                price_result = await get_realtime_quote(
                    sku_id=sku_id,
                    offer_id=offer_id,
                    quantity=mission.get("quantity", 1),
                    destination_country=destination_country,
                )

                if price_result.get("ok"):
                    price_data = price_result.get("data", {})
                    total_price = price_data.get("total_price", 0)
                    verification_result["checks"]["pricing"] = {
                        "passed": True,
                        "unit_price": price_data.get("unit_price"),
                        "total_price": total_price,
                        "stock": price_data.get("stock_available"),
                    }

                    # 检查是否超预算
                    if total_price > budget_amount:
                        verification_result["passed"] = False
                        verification_result["rejection_reason"] = f"Price ${total_price} exceeds budget ${budget_amount}"

                    tool_calls.append({
                        "tool_name": "pricing.get_realtime_quote",
                        "request": {"sku_id": sku_id, "offer_id": offer_id},
                        "response_summary": {"total_price": total_price},
                        "called_at": _now_iso(),
                    })
                else:
                    verification_result["checks"]["pricing"] = {"passed": False, "error": "Quote failed"}
                    verification_result["warnings"].append("Could not get real-time price")

            except Exception as e:
                logger.warning("verifier_node.price_check_failed", offer_id=offer_id, error=str(e))
                verification_result["checks"]["pricing"] = {"passed": False, "error": str(e)}

            # 2. 合规检查
            try:
                compliance_result = await check_compliance(
                    offer_id=offer_id,
                    sku_id=sku_id,
                    destination_country=destination_country,
                )

                if compliance_result.get("ok"):
                    compliance_data = compliance_result.get("data", {})
                    is_allowed = compliance_data.get("allowed", True)
                    verification_result["checks"]["compliance"] = {
                        "passed": is_allowed,
                        "issues": compliance_data.get("issues", []),
                        "required_docs": compliance_data.get("required_docs", []),
                        "warnings": compliance_data.get("warnings", []),
                    }

                    if not is_allowed:
                        verification_result["passed"] = False
                        issues = compliance_data.get("issues", [])
                        reason = issues[0].get("message_en") if issues else "Compliance blocked"
                        verification_result["rejection_reason"] = reason

                    # 添加警告
                    for warning in compliance_data.get("warnings", []):
                        verification_result["warnings"].append(warning)

                    tool_calls.append({
                        "tool_name": "compliance.check_item",
                        "request": {"offer_id": offer_id, "destination_country": destination_country},
                        "response_summary": {"allowed": is_allowed},
                        "called_at": _now_iso(),
                    })

            except Exception as e:
                logger.warning("verifier_node.compliance_check_failed", offer_id=offer_id, error=str(e))
                verification_result["checks"]["compliance"] = {"passed": True, "error": str(e)}
                verification_result["warnings"].append("Compliance check unavailable")

            # 3. 运输检查
            try:
                shipping_result = await quote_shipping_options(
                    items=[{"sku_id": sku_id or offer_id, "qty": mission.get("quantity", 1)}],
                    destination_country=destination_country,
                )

                if shipping_result.get("ok"):
                    shipping_data = shipping_result.get("data", {})
                    options = shipping_data.get("options", [])
                    verification_result["checks"]["shipping"] = {
                        "passed": len(options) > 0,
                        "options_count": len(options),
                        "fastest_days": min((o.get("eta_min_days", 99) for o in options), default=99),
                        "cheapest_price": min((o.get("price", 999) for o in options), default=999),
                    }

                    # 检查是否能在期限内送达
                    arrival_max = mission.get("arrival_days_max")
                    if arrival_max:
                        fastest = min((o.get("eta_min_days", 99) for o in options), default=99)
                        if fastest > arrival_max:
                            verification_result["warnings"].append(
                                f"Fastest shipping ({fastest} days) exceeds deadline ({arrival_max} days)"
                            )

                    tool_calls.append({
                        "tool_name": "shipping.quote_options",
                        "request": {"destination_country": destination_country},
                        "response_summary": {"options_count": len(options)},
                        "called_at": _now_iso(),
                    })

            except Exception as e:
                logger.warning("verifier_node.shipping_check_failed", offer_id=offer_id, error=str(e))
                verification_result["checks"]["shipping"] = {"passed": True, "error": str(e)}

            # 分类结果
            if verification_result["passed"]:
                verified_candidates.append(verification_result)
            else:
                rejected_candidates.append(verification_result)

        # 使用 LLM 进行综合排序和推荐（如果有 API Key）
        settings = get_settings()
        if settings.openai_api_key and verified_candidates:
            try:
                llm_result = await _llm_rank_candidates(mission, verified_candidates)
                if llm_result:
                    verified_candidates = llm_result.get("ranked_candidates", verified_candidates)
            except Exception as e:
                logger.warning("verifier_node.llm_ranking_failed", error=str(e))

        # 按价格排序作为后备
        verified_candidates.sort(
            key=lambda x: x.get("checks", {}).get("pricing", {}).get("total_price", float("inf"))
        )

        logger.info(
            "verifier_node.complete",
            verified_count=len(verified_candidates),
            rejected_count=len(rejected_candidates),
        )

        return {
            **state,
            "verified_candidates": verified_candidates,
            "rejected_candidates": rejected_candidates,
            "tool_calls": tool_calls,
            "current_step": "verifier_complete",
            "error": None,
        }

    except Exception as e:
        logger.error("verifier_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "verifier",
        }


async def _llm_rank_candidates(mission: dict, candidates: list) -> dict | None:
    """使用 LLM 对候选进行综合排序"""
    try:
        llm = get_llm_with_structured_output(
            output_schema=VerificationResult,
            model_type="planner",
            temperature=0.0,
        )

        # 简化候选信息
        simplified_candidates = []
        for c in candidates:
            simplified_candidates.append({
                "offer_id": c.get("offer_id"),
                "title": c.get("candidate", {}).get("titles", [{}])[0].get("text", ""),
                "price": c.get("checks", {}).get("pricing", {}).get("total_price"),
                "shipping_days": c.get("checks", {}).get("shipping", {}).get("fastest_days"),
                "warnings": c.get("warnings", []),
            })

        messages = [
            {"role": "system", "content": VERIFIER_PROMPT},
            {"role": "user", "content": f"Mission: {mission}\n\nCandidates: {simplified_candidates}"},
        ]

        result = await llm.ainvoke(messages)
        return {"ranked_candidates": candidates, "llm_recommendation": result}

    except Exception as e:
        logger.warning("_llm_rank_candidates.failed", error=str(e))
        return None


def _now_iso() -> str:
    """返回当前时间的 ISO 格式"""
    from datetime import datetime
    return datetime.now(UTC).isoformat()
