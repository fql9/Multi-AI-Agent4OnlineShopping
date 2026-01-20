"""
Intent Agent Node implementation.

解析用户意图，生成结构化的 MissionSpec。
依赖 LLM 进行精准的意图分析，不支持 mock 模式。
"""

from typing import Any

import structlog
from langchain_core.messages import AIMessage, HumanMessage

from ..config import get_settings
from ..graph.state import AgentState, IntentReasoning
from ..llm.client import call_llm_and_parse
from ..llm.prompts import INTENT_PREPROCESS_PROMPT, INTENT_PROMPT
from ..llm.schemas import IntentPreprocessResult, MissionParseResult

logger = structlog.get_logger()


async def intent_node(state: AgentState) -> AgentState:
    """
    Intent Agent 节点
    
    使用 LLM 解析用户意图并生成结构化 MissionSpec。
    输出简洁的思维链文本（类似 DeepSeek 风格）。
    """
    settings = get_settings()
    
    # 如果已有 mission，直接返回
    if state.get("mission") is not None:
        logger.debug("intent_node.skip", reason="mission already exists")
        mission = state.get("mission") or {}
        if not state.get("intent_reasoning"):
            intent_reasoning = _build_intent_reasoning(mission)
            return {
                **state,
                "intent_reasoning": intent_reasoning,
                "current_step": "intent_complete",
            }
        return {**state, "current_step": "intent_complete"}

    try:
        messages = state.get("messages", [])
        user_message = _extract_user_message(messages)
        
        if not user_message:
            return _error_response(state, "No user message found", "INVALID_ARGUMENT")

        logger.info("intent_node.start", message=user_message[:100])

        if not settings.openai_api_key:
            logger.error("intent_node.no_api_key", msg="OPENAI_API_KEY is required")
            return _error_response(
                state, 
                "LLM API key is not configured.", 
                "LLM_NOT_CONFIGURED"
            )

        # 调用 LLM 解析意图
        result, preprocess_info = await _llm_parse_intent(user_message, messages)
        
        if result is None:
            logger.error("intent_node.llm_failed", msg="LLM parsing returned None")
            return _error_response(state, "Failed to parse user intent.", "LLM_PARSE_FAILED")

        # 检查是否需要澄清
        if result.needs_clarification:
            return _clarification_response(
                state, messages, 
                result.clarification_questions,
                result.detected_language or "zh"
            )

        # 构建 Mission 字典
        mission_dict = _build_mission_dict(result, user_message)
        
        # 构建简洁的思维链
        intent_reasoning = _build_intent_reasoning(mission_dict, preprocess_info, user_message)

        logger.info(
            "intent_node.complete",
            product_type=mission_dict.get("primary_product_type_en"),
            country=mission_dict.get("destination_country"),
            budget=mission_dict.get("budget_amount"),
        )

        return {
            **state,
            "mission": mission_dict,
            "intent_reasoning": intent_reasoning,
            "current_step": "intent_complete",
            "token_used": state.get("token_used", 0) + 500,
            "needs_clarification": False,
            "error": None,
        }

    except Exception as e:
        logger.error("intent_node.error", error=str(e))
        return _error_response(state, str(e), "INTERNAL_ERROR")


def _extract_user_message(messages: list) -> str:
    """提取最新的用户消息"""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return msg.content
    return ""


def _error_response(state: AgentState, error: str, error_code: str) -> AgentState:
    """生成错误响应"""
    return {
        **state,
        "error": error,
        "error_code": error_code,
        "current_step": "intent",
    }


def _clarification_response(
    state: AgentState,
    messages: list,
    questions: list[str],
    language: str = "zh",
) -> AgentState:
    """生成澄清响应"""
    prefix = "我需要一些额外信息：\n" if language == "zh" else "I need some additional information:\n"
    clarification_msg = prefix + "\n".join(f"- {q}" for q in questions)

    return {
        **state,
        "messages": [*messages, AIMessage(content=clarification_msg)],
        "current_step": "awaiting_clarification",
        "needs_clarification": True,
        "error": None,
    }


async def _llm_parse_intent(
    user_message: str, 
    messages: list,
) -> tuple[MissionParseResult | None, dict]:
    """
    使用 LLM 解析用户意图
    
    两阶段处理：
    1. 预处理（可选）：语言检测、归一化、翻译
    2. 主解析：完整的意图解析
    
    Returns:
        Tuple of (MissionParseResult, preprocess_info_dict)
    """
    preprocess_info_dict = {}
    preprocess_info = ""
    
    # 阶段一：预处理（快速，可失败）
    try:
        preprocess_result = await call_llm_and_parse(
            messages=[
                {"role": "system", "content": INTENT_PREPROCESS_PROMPT},
                {"role": "user", "content": user_message},
            ],
            output_schema=IntentPreprocessResult,
            model_type="planner",
            temperature=0.1,
        )
        
        if preprocess_result:
            if preprocess_result.needs_clarification:
                return MissionParseResult(
                    needs_clarification=True,
                    clarification_questions=preprocess_result.clarification_questions,
                    detected_language=preprocess_result.detected_language or "zh",
                ), preprocess_info_dict
            
            preprocess_info = (
                f"\nPreprocessed info:\n"
                f"- Language: {preprocess_result.detected_language}\n"
                f"- Keywords: {preprocess_result.normalized_query}\n"
                f"- English: {preprocess_result.translated_query_en}"
            )
            
            preprocess_info_dict = {
                "detected_language": preprocess_result.detected_language,
                "normalized_query": preprocess_result.normalized_query,
                "translated_query_en": preprocess_result.translated_query_en,
            }
            
    except Exception as e:
        logger.debug("intent_node.preprocess_skipped", error=str(e))

    # 阶段二：主解析
    prompt_messages = [
        {"role": "system", "content": INTENT_PROMPT},
        {"role": "user", "content": f"User request: {user_message}{preprocess_info}"},
    ]

    # 添加历史上下文（最近 2 轮）
    for msg in messages[-4:-1]:
        if isinstance(msg, HumanMessage):
            prompt_messages.insert(-1, {"role": "user", "content": msg.content})
        elif isinstance(msg, AIMessage):
            prompt_messages.insert(-1, {"role": "assistant", "content": msg.content})

    result = await call_llm_and_parse(
        messages=prompt_messages,
        output_schema=MissionParseResult,
        model_type="planner",
        temperature=0.1,
    )
    
    return result, preprocess_info_dict


def _build_mission_dict(result: MissionParseResult, user_message: str) -> dict[str, Any]:
    """构建 Mission 字典"""
    # 构建子任务列表
    sub_tasks = [
        {
            "task_id": t.task_id,
            "intent_type": t.intent_type,
            "description": t.description,
            "description_en": t.description_en,
            "product_type": t.product_type,
            "product_type_en": t.product_type_en,
            "priority": t.priority,
            "depends_on": t.depends_on,
            "extracted_attributes": t.extracted_attributes,
        }
        for t in (result.sub_tasks or [])
    ]

    # 构建提取的属性
    extracted_attrs = {}
    if result.extracted_attributes:
        attrs = result.extracted_attributes
        extracted_attrs = {
            k: v for k, v in {
                "color": attrs.color,
                "size": attrs.size,
                "brand": attrs.brand,
                "material": attrs.material,
                "style": attrs.style,
                "gender": attrs.gender,
                "age_group": attrs.age_group,
                "power": attrs.power,
                "connectivity": attrs.connectivity,
                "compatibility": attrs.compatibility,
                **attrs.extra,
            }.items() if v is not None
        }

    return {
        # 意图信息
        "primary_intent": result.primary_intent,
        "has_multiple_tasks": result.has_multiple_tasks,
        "sub_tasks": sub_tasks,
        
        # 基础信息
        "destination_country": result.destination_country or "US",
        "budget_amount": result.budget_amount,
        "budget_currency": result.budget_currency or "USD",
        "quantity": result.quantity or 1,
        "arrival_days_max": result.arrival_days_max,
        
        # 约束与偏好
        "hard_constraints": [c.model_dump() for c in (result.hard_constraints or [])],
        "soft_preferences": [p.model_dump() for p in (result.soft_preferences or [])],
        "objective_weights": result.objective_weights.model_dump() if result.objective_weights else {"price": 0.4, "speed": 0.3, "risk": 0.3},
        
        # 搜索关键词
        "search_query": result.search_query or user_message,
        "search_query_en": result.search_query_en or "",
        "primary_product_type": result.primary_product_type or "",
        "primary_product_type_en": result.primary_product_type_en or "",
        
        # 提取的属性
        "extracted_attributes": extracted_attrs,
        
        # 上下文
        "detected_language": result.detected_language or "en",
        "purchase_context": result.purchase_context.model_dump() if result.purchase_context else {},
    }


def _format_budget(mission: dict) -> str:
    """格式化预算信息"""
    amount = mission.get("budget_amount")
    currency = mission.get("budget_currency", "USD")
    if amount is None:
        return "不限"
    return f"{amount} {currency}"


def _build_intent_reasoning(
    mission: dict,
    preprocess_info: dict | None = None,
    user_message: str = "",
) -> IntentReasoning:
    """
    构建简洁的思维链（类似 DeepSeek 风格）
    
    生成 2-3 句话的思考过程，简洁明了。
    """
    product_type = mission.get("primary_product_type_en", "") or mission.get("primary_product_type", "") or mission.get("search_query_en", "")
    destination_country = mission.get("destination_country", "US")
    budget_display = _format_budget(mission)
    search_query_en = mission.get("search_query_en", "") or product_type
    
    # 构建简洁的思维链文本（类似 DeepSeek 风格）
    thinking_parts = []
    
    # 理解需求
    if user_message:
        short_msg = user_message[:30] + "..." if len(user_message) > 30 else user_message
        thinking_parts.append(f"理解需求：用户想要购买「{short_msg}」")
    
    # 提取关键信息
    if preprocess_info and preprocess_info.get("normalized_query"):
        thinking_parts.append(f"关键词提取：{preprocess_info['normalized_query']} → {search_query_en}")
    else:
        thinking_parts.append(f"产品识别：{product_type}")
    
    # 任务构建
    thinking_parts.append(f"已构建搜索任务，目标市场 {destination_country}，预算 {budget_display}。")
    
    thinking = " ".join(thinking_parts)
    
    return {
        "thinking": thinking,
    }


