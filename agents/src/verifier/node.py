"""
Verifier Agent Node implementation.

对候选商品进行实时核验。
"""

from datetime import UTC

import structlog

from ..config import get_settings
from ..graph.state import AgentState
from ..llm.client import call_llm_and_parse
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

        # 对每个候选进行核验（增加到 15 个以便生成多个方案）
        for candidate in candidates[:15]:
            offer_id = candidate.get("offer_id")
            sku_id = None

            # 获取默认 SKU（防御性处理：variants 可能为 None）
            variants = candidate.get("variants") or {}
            skus = variants.get("skus") or []
            if skus and isinstance(skus[0], dict):
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
            quantity = mission.get("quantity", 1)
            try:
                price_result = await get_realtime_quote(
                    sku_id=sku_id or offer_id,
                    quantity=quantity,
                    destination_country=destination_country,
                )

                pricing_request = {
                    "offer_id": offer_id,
                    "sku_id": sku_id,
                    "quantity": quantity,
                    "destination_country": destination_country,
                }

                if price_result.get("ok"):
                    price_data = price_result.get("data", {})
                    total_price = price_data.get("total_price", 0)
                    unit_price = price_data.get("unit_price")
                    stock_info = price_data.get("stock", {})
                    stock_available = stock_info.get("quantity_available") if isinstance(stock_info, dict) else stock_info
                    
                    verification_result["checks"]["pricing"] = {
                        "passed": True,
                        "unit_price": unit_price,
                        "total_price": total_price,
                        "stock": stock_available,
                    }

                    # 检查是否超预算（防御性处理：budget_amount 可能为 None）
                    if budget_amount is not None and total_price > budget_amount:
                        verification_result["passed"] = False
                        verification_result["rejection_reason"] = f"Price ${total_price} exceeds budget ${budget_amount}"

                    tool_calls.append(_build_verifier_tool_call(
                        tool_name="pricing.get_realtime_quote",
                        request=pricing_request,
                        response_summary={
                            "ok": True,
                            "total_price": total_price,
                            "unit_price": unit_price,
                            "currency": price_data.get("currency", "USD"),
                            "stock_available": stock_available,
                        },
                    ))
                else:
                    verification_result["checks"]["pricing"] = {"passed": False, "error": "Quote failed"}
                    verification_result["warnings"].append("Could not get real-time price")
                    # 失败路径也记录 tool_call
                    tool_calls.append(_build_verifier_tool_call(
                        tool_name="pricing.get_realtime_quote",
                        request=pricing_request,
                        response_summary={
                            "ok": False,
                            "error": price_result.get("error", {}).get("message", "Quote failed"),
                        },
                    ))

            except Exception as e:
                logger.warning("verifier_node.price_check_failed", offer_id=offer_id, error=str(e))
                verification_result["checks"]["pricing"] = {"passed": False, "error": str(e)}
                # 异常路径也记录 tool_call
                tool_calls.append(_build_verifier_tool_call(
                    tool_name="pricing.get_realtime_quote",
                    request={
                        "offer_id": offer_id,
                        "sku_id": sku_id,
                        "quantity": quantity,
                        "destination_country": destination_country,
                    },
                    response_summary={
                        "ok": False,
                        "error": str(e),
                    },
                ))

            # 2. 合规检查
            compliance_request = {
                "offer_id": offer_id,
                "sku_id": sku_id,
                "destination_country": destination_country,
            }
            try:
                compliance_result = await check_compliance(
                    sku_id=sku_id or offer_id,
                    destination_country=destination_country,
                )

                if compliance_result.get("ok"):
                    compliance_data = compliance_result.get("data", {})
                    is_allowed = compliance_data.get("allowed", True)
                    issues = compliance_data.get("issues", [])
                    warnings_list = compliance_data.get("warnings", [])
                    ruleset_version = compliance_data.get("ruleset_version", "")
                    
                    verification_result["checks"]["compliance"] = {
                        "passed": is_allowed,
                        "issues": issues,
                        "required_docs": compliance_data.get("required_docs", []),
                        "warnings": warnings_list,
                    }

                    if not is_allowed:
                        verification_result["passed"] = False
                        reason = issues[0].get("message_en") if issues else "Compliance blocked"
                        verification_result["rejection_reason"] = reason

                    # 添加警告
                    for warning in warnings_list:
                        verification_result["warnings"].append(warning)

                    tool_calls.append(_build_verifier_tool_call(
                        tool_name="compliance.check_item",
                        request=compliance_request,
                        response_summary={
                            "ok": True,
                            "allowed": is_allowed,
                            "ruleset_version": ruleset_version,
                            "issues_count": len(issues),
                            "warnings_count": len(warnings_list),
                        },
                    ))
                else:
                    verification_result["checks"]["compliance"] = {"passed": True, "error": "Check failed"}
                    verification_result["warnings"].append("Compliance check unavailable")
                    # 失败路径也记录 tool_call
                    tool_calls.append(_build_verifier_tool_call(
                        tool_name="compliance.check_item",
                        request=compliance_request,
                        response_summary={
                            "ok": False,
                            "error": compliance_result.get("error", {}).get("message", "Check failed"),
                        },
                    ))

            except Exception as e:
                logger.warning("verifier_node.compliance_check_failed", offer_id=offer_id, error=str(e))
                verification_result["checks"]["compliance"] = {"passed": True, "error": str(e)}
                verification_result["warnings"].append("Compliance check unavailable")
                # 异常路径也记录 tool_call
                tool_calls.append(_build_verifier_tool_call(
                    tool_name="compliance.check_item",
                    request=compliance_request,
                    response_summary={
                        "ok": False,
                        "error": str(e),
                    },
                ))

            # 3. 运输检查
            shipping_request = {
                "offer_id": offer_id,
                "sku_id": sku_id,
                "quantity": quantity,
                "destination_country": destination_country,
            }
            try:
                shipping_result = await quote_shipping_options(
                    items=[{"sku_id": sku_id or offer_id, "qty": quantity}],
                    destination_country=destination_country,
                )

                if shipping_result.get("ok"):
                    shipping_data = shipping_result.get("data", {})
                    options = shipping_data.get("options", [])
                    options_count = len(options)
                    fastest_days = min((o.get("eta_min_days", 99) for o in options), default=99) if options else 99
                    cheapest_price = min((o.get("price", 999) for o in options), default=999) if options else 999
                    
                    verification_result["checks"]["shipping"] = {
                        "passed": options_count > 0,
                        "options_count": options_count,
                        "fastest_days": fastest_days,
                        "cheapest_price": cheapest_price,
                    }

                    # 检查是否能在期限内送达
                    arrival_max = mission.get("arrival_days_max")
                    if arrival_max and fastest_days > arrival_max:
                        verification_result["warnings"].append(
                            f"Fastest shipping ({fastest_days} days) exceeds deadline ({arrival_max} days)"
                        )

                    tool_calls.append(_build_verifier_tool_call(
                        tool_name="shipping.quote_options",
                        request=shipping_request,
                        response_summary={
                            "ok": True,
                            "options_count": options_count,
                            "fastest_days": fastest_days,
                            "cheapest_price": cheapest_price,
                        },
                    ))
                else:
                    verification_result["checks"]["shipping"] = {"passed": True, "error": "Quote failed"}
                    # 失败路径也记录 tool_call
                    tool_calls.append(_build_verifier_tool_call(
                        tool_name="shipping.quote_options",
                        request=shipping_request,
                        response_summary={
                            "ok": False,
                            "error": shipping_result.get("error", {}).get("message", "Quote failed"),
                        },
                    ))

            except Exception as e:
                logger.warning("verifier_node.shipping_check_failed", offer_id=offer_id, error=str(e))
                verification_result["checks"]["shipping"] = {"passed": True, "error": str(e)}
                # 异常路径也记录 tool_call
                tool_calls.append(_build_verifier_tool_call(
                    tool_name="shipping.quote_options",
                    request=shipping_request,
                    response_summary={
                        "ok": False,
                        "error": str(e),
                    },
                ))

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
        # 简化候选信息
        simplified_candidates = []
        for c in candidates:
            # 防御性处理：titles 可能为 None 或空数组
            candidate_data = c.get("candidate") or {}
            titles = candidate_data.get("titles") or []
            title_text = ""
            if titles and isinstance(titles[0], dict):
                title_text = titles[0].get("text", "")
            
            checks = c.get("checks") or {}
            pricing = checks.get("pricing") or {}
            shipping = checks.get("shipping") or {}
            
            simplified_candidates.append({
                "offer_id": c.get("offer_id"),
                "title": title_text,
                "price": pricing.get("total_price"),
                "shipping_days": shipping.get("fastest_days"),
                "warnings": c.get("warnings") or [],
            })

        messages = [
            {"role": "system", "content": VERIFIER_PROMPT},
            {"role": "user", "content": f"Mission: {mission}\n\nCandidates: {simplified_candidates}"},
        ]

        result = await call_llm_and_parse(
            messages=messages,
            output_schema=VerificationResult,
            model_type="planner",
            temperature=0.0,
        )

        if result:
            return {"ranked_candidates": candidates, "llm_recommendation": result}
        return None

    except Exception as e:
        logger.warning("_llm_rank_candidates.failed", error=str(e))
        return None


def _now_iso() -> str:
    """返回当前时间的 ISO 格式"""
    from datetime import datetime
    return datetime.now(UTC).isoformat()


def _generate_tool_id() -> str:
    """生成唯一的工具调用 ID"""
    import uuid
    return f"tc_{uuid.uuid4().hex[:12]}"


def _build_verifier_tool_call(
    tool_name: str,
    request: dict,
    response_summary: dict,
) -> dict:
    """
    构建 Verifier 工具调用记录（统一结构）
    
    确保每次核验调用都有 tool_id，便于 SSE 推送和前端展示。
    """
    return {
        "tool_id": _generate_tool_id(),
        "tool_name": tool_name,
        "request": request,
        "response_summary": response_summary,
        "called_at": _now_iso(),
    }
