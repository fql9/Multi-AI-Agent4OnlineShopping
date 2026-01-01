"""
Compliance Agent Node implementation.

专门处理跨境合规检查：
- 检查目的国禁限运规则
- 验证所需证书和材料
- 提供合规建议和替代方案
- 评估合规风险等级
"""

from datetime import UTC, datetime

import structlog

from ..config import get_settings
from ..graph.state import AgentState
from ..llm.client import call_llm_and_parse
from ..llm.prompts import COMPLIANCE_PROMPT
from ..llm.schemas import ComplianceAnalysis
from ..tools.compliance import check_compliance, get_compliance_rules

logger = structlog.get_logger()


async def compliance_node(state: AgentState) -> AgentState:
    """
    Compliance Agent 节点

    对候选商品进行深度合规分析，包括：
    1. 目的国禁限运检查
    2. 所需证书和文件验证
    3. 风险评估和替代方案建议
    """
    logger.info("compliance_node.start")

    try:
        mission = state.get("mission")
        candidates = state.get("candidates", [])

        if not mission:
            return {
                **state,
                "error": "No mission found",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "compliance",
            }

        if not candidates:
            return {
                **state,
                "error": "No candidates to check",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "compliance",
            }

        destination_country = mission.get("destination_country", "US")
        tool_calls = state.get("tool_calls", [])
        settings = get_settings()

        # 获取目的国合规规则
        rules_result = await get_compliance_rules(destination_country=destination_country)
        country_rules = []
        if rules_result.get("ok"):
            country_rules = rules_result.get("data", {}).get("rules", [])
            tool_calls.append({
                "tool_name": "compliance.get_rules",
                "request": {"destination_country": destination_country},
                "response_summary": {"rules_count": len(country_rules)},
                "called_at": _now_iso(),
            })

        logger.info("compliance_node.rules_loaded", rules_count=len(country_rules))

        # 对每个候选进行合规检查
        compliance_results = []
        blocked_candidates = []
        warning_candidates = []

        for candidate in candidates:
            offer_id = candidate.get("offer_id", "")
            sku_id = None

            # 获取默认 SKU
            skus = candidate.get("variants", {}).get("skus", [])
            if skus:
                sku_id = skus[0].get("sku_id")

            # 获取产品的风险标签
            risk_tags = candidate.get("risk_tags", [])
            certifications = candidate.get("certifications", [])
            category_id = candidate.get("category", {}).get("id", "")

            logger.info(
                "compliance_node.checking",
                offer_id=offer_id,
                risk_tags=risk_tags,
                category=category_id,
            )

            # 调用合规检查工具
            compliance_result = await check_compliance(
                sku_id=sku_id or offer_id,
                destination_country=destination_country,
            )

            result = {
                "offer_id": offer_id,
                "sku_id": sku_id,
                "candidate": candidate,
                "allowed": True,
                "risk_level": "low",
                "issues": [],
                "warnings": [],
                "required_docs": [],
                "suggested_alternatives": [],
            }

            if compliance_result.get("ok"):
                data = compliance_result.get("data", {})
                result["allowed"] = data.get("allowed", True)
                result["issues"] = data.get("issues", [])
                result["warnings"] = data.get("warnings", [])
                result["required_docs"] = data.get("required_docs", [])

                tool_calls.append({
                    "tool_name": "compliance.check_item",
                    "request": {"offer_id": offer_id, "destination_country": destination_country},
                    "response_summary": {"allowed": result["allowed"]},
                    "called_at": _now_iso(),
                })

            # 评估风险等级
            result["risk_level"] = _assess_risk_level(
                allowed=result["allowed"],
                issues=result["issues"],
                warnings=result["warnings"],
                required_docs=result["required_docs"],
                risk_tags=risk_tags,
            )

            # 分类结果
            if not result["allowed"]:
                blocked_candidates.append(result)
            elif result["risk_level"] in ["high", "medium"]:
                warning_candidates.append(result)
            else:
                compliance_results.append(result)

        # 使用 LLM 进行深度合规分析（如果有 API Key）
        llm_analysis = None
        if settings.openai_api_key and (blocked_candidates or warning_candidates):
            try:
                llm_analysis = await _llm_compliance_analysis(
                    mission=mission,
                    blocked=blocked_candidates,
                    warnings=warning_candidates,
                    country_rules=country_rules,
                )
            except Exception as e:
                logger.warning("compliance_node.llm_analysis_failed", error=str(e))

        # 合并分析结果
        if llm_analysis:
            # 将 LLM 建议添加到结果中
            for blocked in blocked_candidates:
                if llm_analysis.suggested_alternatives:
                    blocked["suggested_alternatives"] = [
                        alt.model_dump() if hasattr(alt, 'model_dump') else alt
                        for alt in llm_analysis.suggested_alternatives
                    ]

        logger.info(
            "compliance_node.complete",
            passed_count=len(compliance_results),
            blocked_count=len(blocked_candidates),
            warning_count=len(warning_candidates),
        )

        return {
            **state,
            "compliance_results": compliance_results,
            "blocked_candidates": blocked_candidates,
            "warning_candidates": warning_candidates,
            "compliance_summary": {
                "destination_country": destination_country,
                "rules_checked": len(country_rules),
                "candidates_passed": len(compliance_results),
                "candidates_blocked": len(blocked_candidates),
                "candidates_with_warnings": len(warning_candidates),
                "llm_analysis": llm_analysis.model_dump() if llm_analysis else None,
            },
            "tool_calls": tool_calls,
            "current_step": "compliance_complete",
            "error": None,
        }

    except Exception as e:
        logger.error("compliance_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "compliance",
        }


def _assess_risk_level(
    allowed: bool,
    issues: list,
    warnings: list,
    required_docs: list,
    risk_tags: list,
) -> str:
    """评估合规风险等级"""
    if not allowed:
        return "blocked"

    # 高风险标签
    high_risk_tags = {"battery_included", "contains_liquid", "hazardous", "flammable"}
    if any(tag in high_risk_tags for tag in risk_tags):
        return "high"

    # 中等风险：有警告或需要额外文件
    if len(issues) > 0 or len(required_docs) > 2:
        return "high"

    if len(warnings) > 1 or len(required_docs) > 0:
        return "medium"

    if len(warnings) == 1:
        return "low"

    return "minimal"


async def _llm_compliance_analysis(
    mission: dict,
    blocked: list,
    warnings: list,
    country_rules: list,
) -> ComplianceAnalysis | None:
    """使用 LLM 进行深度合规分析"""
    try:
        # 简化数据用于 LLM
        blocked_summary = [
            {
                "offer_id": b.get("offer_id"),
                "issues": b.get("issues", []),
                "risk_level": b.get("risk_level"),
            }
            for b in blocked
        ]

        warning_summary = [
            {
                "offer_id": w.get("offer_id"),
                "warnings": w.get("warnings", []),
                "required_docs": w.get("required_docs", []),
                "risk_level": w.get("risk_level"),
            }
            for w in warnings
        ]

        rules_summary = [
            {
                "rule_type": r.get("rule_type"),
                "name": r.get("name", {}).get("en", ""),
                "severity": r.get("severity"),
            }
            for r in country_rules[:10]  # 限制规则数量
        ]

        messages = [
            {"role": "system", "content": COMPLIANCE_PROMPT},
            {
                "role": "user",
                "content": f"""
Mission: Destination country is {mission.get('destination_country')}.

Blocked products:
{blocked_summary}

Products with warnings:
{warning_summary}

Country compliance rules:
{rules_summary}

Please analyze the compliance issues and provide alternatives.
""",
            },
        ]

        result = await call_llm_and_parse(
            messages=messages,
            output_schema=ComplianceAnalysis,
            model_type="planner",
            temperature=0.1,
        )

        return result

    except Exception as e:
        logger.warning("_llm_compliance_analysis.failed", error=str(e))
        return None


def _now_iso() -> str:
    """返回当前时间的 ISO 格式"""
    return datetime.now(UTC).isoformat()

