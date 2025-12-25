"""
Verifier Agent Node implementation.
"""

import structlog

from ..graph.state import AgentState
from ..tools.compliance import check_compliance
from ..tools.pricing import get_realtime_quote
from ..tools.shipping import quote_shipping_options

logger = structlog.get_logger()


async def verifier_node(state: AgentState) -> AgentState:
    """
    Verifier Agent 节点

    对候选进行实时核验
    """
    logger.info("verifier_node.start", candidates_count=len(state.get("candidates", [])))

    try:
        mission = state.get("mission", {})
        candidates = state.get("candidates", [])
        destination_country = mission.get("destination_country", "US")

        verified_candidates = []
        tool_call_records = state.get("tool_call_records", [])

        for candidate in candidates[:20]:  # 限制核验数量（Token 预算控制）
            sku_id = candidate.get("sku_id") or candidate.get("skus", [{}])[0].get("sku_id")
            candidate.get("offer_id")

            if not sku_id:
                continue

            # 1. 核验价格
            price_result = await get_realtime_quote(
                sku_id=sku_id,
                quantity=1,
                destination_country=destination_country,
            )
            tool_call_records.append({
                "tool": "pricing.get_realtime_quote",
                "response_hash": price_result.get("evidence", {}).get("hash", ""),
                "ts": price_result.get("evidence", {}).get("ts", ""),
            })

            if not price_result.get("ok"):
                logger.warning("verifier.price_check_failed", sku_id=sku_id)
                continue

            # 2. 核验物流
            shipping_result = await quote_shipping_options(
                items=[{"sku_id": sku_id, "qty": 1}],
                destination_country=destination_country,
            )
            tool_call_records.append({
                "tool": "shipping.quote_options",
                "response_hash": shipping_result.get("evidence", {}).get("hash", ""),
                "ts": shipping_result.get("evidence", {}).get("ts", ""),
            })

            if not shipping_result.get("ok"):
                logger.warning("verifier.shipping_check_failed", sku_id=sku_id)
                continue

            # 3. 核验合规
            compliance_result = await check_compliance(
                sku_id=sku_id,
                destination_country=destination_country,
            )
            tool_call_records.append({
                "tool": "compliance.check_item",
                "response_hash": compliance_result.get("evidence", {}).get("hash", ""),
                "ts": compliance_result.get("evidence", {}).get("ts", ""),
            })

            if not compliance_result.get("ok"):
                logger.warning("verifier.compliance_check_failed", sku_id=sku_id)
                continue

            if not compliance_result.get("data", {}).get("allowed", False):
                logger.warning(
                    "verifier.compliance_blocked",
                    sku_id=sku_id,
                    reasons=compliance_result.get("data", {}).get("reason_codes", []),
                )
                continue

            # 通过所有核验
            verified_candidate = {
                **candidate,
                "verified": True,
                "realtime_price": price_result.get("data"),
                "shipping_options": shipping_result.get("data", {}).get("options", []),
                "compliance": compliance_result.get("data"),
            }
            verified_candidates.append(verified_candidate)

        logger.info(
            "verifier_node.complete",
            verified_count=len(verified_candidates),
        )

        return {
            **state,
            "verified_candidates": verified_candidates,
            "tool_call_records": tool_call_records,
            "current_step": "verify_complete",
            "error": None,
        }

    except Exception as e:
        logger.error("verifier_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "verify",
        }

