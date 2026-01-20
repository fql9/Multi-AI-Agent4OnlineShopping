"""
Intent Agent Node implementation.

解析用户意图，生成结构化的 MissionSpec。
依赖 LLM 进行精准的意图分析，不支持 mock 模式。
"""

from typing import Any

import structlog
from langchain_core.messages import AIMessage, HumanMessage

from ..config import get_settings
from ..graph.state import AgentState, IntentReasoning, IntentReasoningStep
from ..llm.client import call_llm_and_parse
from ..llm.prompts import INTENT_PREPROCESS_PROMPT, INTENT_PROMPT
from ..llm.schemas import IntentPreprocessResult, MissionParseResult

logger = structlog.get_logger()


async def intent_node(state: AgentState) -> AgentState:
    """
    Intent Agent 节点
    
    使用 LLM 解析用户意图并生成结构化 MissionSpec。
    
    流程：
    1. 检查是否已有 mission（避免重复解析）
    2. 提取用户消息
    3. 调用 LLM 进行意图解析
    4. 构建 Mission 字典返回
    
    注意：必须配置有效的 OPENAI_API_KEY，不支持 mock 模式。
    """
    settings = get_settings()
    
    # 收集推理步骤
    reasoning_steps: list[IntentReasoningStep] = []
    
    # 如果已有 mission，直接返回（但确保推理过程可展示）
    if state.get("mission") is not None:
        logger.debug("intent_node.skip", reason="mission already exists")
        mission = state.get("mission") or {}
        messages = state.get("messages", [])
        user_message = _extract_user_message(messages)
        if not state.get("intent_reasoning"):
            intent_reasoning = _build_intent_reasoning_from_mission(mission, user_message)
            return {
                **state,
                "intent_reasoning": intent_reasoning,
                "current_step": "intent_complete",
            }
        return {**state, "current_step": "intent_complete"}

    try:
        # 获取用户消息
        messages = state.get("messages", [])
        user_message = _extract_user_message(messages)
        
        if not user_message:
            return _error_response(state, "No user message found", "INVALID_ARGUMENT")

        logger.info("intent_node.start", message=user_message[:100])
        
        # 推理步骤 1: 分析用户输入
        reasoning_steps.append({
            "step": "分析用户输入",
            "content": f"正在分析您的购物需求：「{user_message[:50]}{'...' if len(user_message) > 50 else ''}」",
            "type": "analyzing",
        })

        # 检查是否有 API Key，没有则报错
        if not settings.openai_api_key:
            logger.error("intent_node.no_api_key", msg="OPENAI_API_KEY is required")
            return _error_response(
                state, 
                "LLM API key is not configured. Please set OPENAI_API_KEY environment variable.", 
                "LLM_NOT_CONFIGURED"
            )

        # 调用 LLM 解析意图（可选的预处理 + 主解析）
        result, preprocess_info = await _llm_parse_intent_with_reasoning(user_message, messages, reasoning_steps)
        
        if result is None:
            logger.error("intent_node.llm_failed", msg="LLM parsing returned None")
            return _error_response(
                state,
                "Failed to parse user intent. LLM returned no result.",
                "LLM_PARSE_FAILED"
            )

        # 检查是否需要澄清
        if result.needs_clarification:
            return _clarification_response(
                state, messages, 
                result.clarification_questions,
                result.detected_language or "zh"
            )

        # 构建 Mission 字典
        mission_dict = _build_mission_dict(result, user_message)
        
        # 推理步骤 4: 生成结构化任务
        reasoning_steps.append({
            "step": "生成结构化任务",
            "content": f"已生成购物任务：搜索「{mission_dict.get('search_query_en', '')}」，预算 {mission_dict.get('budget_amount', 'N/A')} {mission_dict.get('budget_currency', 'USD')}",
            "type": "result",
        })
        
        # 构建 IntentReasoning
        intent_reasoning = _build_intent_reasoning_from_mission(
            mission_dict,
            user_message,
            reasoning_steps=reasoning_steps,
        )

        logger.info(
            "intent_node.complete",
            product_type=mission_dict.get("primary_product_type_en"),
            country=mission_dict.get("destination_country"),
            budget=mission_dict.get("budget_amount"),
            reasoning_steps=len(reasoning_steps),
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


async def _llm_parse_intent_with_reasoning(
    user_message: str, 
    messages: list,
    reasoning_steps: list[IntentReasoningStep],
) -> tuple[MissionParseResult | None, dict]:
    """
    使用 LLM 解析用户意图，同时收集推理步骤
    
    两阶段处理：
    1. 预处理（可选）：语言检测、归一化、翻译
    2. 主解析：完整的意图解析
    
    Returns:
        Tuple of (MissionParseResult, preprocess_info_dict)
    """
    preprocess_info_dict = {}
    
    # 阶段一：预处理（快速，可失败）
    preprocess_info = ""
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
            # 如果预处理就需要澄清，构造一个需要澄清的结果
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
            
            # 推理步骤 2: 提取关键信息
            reasoning_steps.append({
                "step": "提取关键信息",
                "content": f"检测语言：{preprocess_result.detected_language}，产品关键词：「{preprocess_result.normalized_query}」→「{preprocess_result.translated_query_en}」",
                "type": "extracting",
            })
            
    except Exception as e:
        logger.debug("intent_node.preprocess_skipped", error=str(e))
        # 预处理失败时添加一个通用的推理步骤
        reasoning_steps.append({
            "step": "提取关键信息",
            "content": "正在从用户输入中提取产品类型、目的地和预算信息...",
            "type": "extracting",
        })

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
    
    # 推理步骤 3: 构建任务规格
    reasoning_steps.append({
        "step": "构建任务规格",
        "content": "正在构建结构化的购物任务规格（MissionSpec）...",
        "type": "building",
    })

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


def _format_budget_from_mission(mission: dict) -> str:
    """格式化预算信息"""
    amount = mission.get("budget_amount")
    currency = mission.get("budget_currency", "USD")
    if amount is None:
        return f"N/A {currency}"
    return f"{amount} {currency}"


def _build_intent_reasoning_from_mission(
    mission: dict,
    user_message: str,
    reasoning_steps: list[IntentReasoningStep] | None = None,
) -> IntentReasoning:
    """
    从 mission 构建 IntentReasoning（用于前端展示）
    当 mission 已存在但 intent_reasoning 缺失时使用
    """
    search_query_original = mission.get("search_query", "")
    search_query_en = mission.get("search_query_en", "") or search_query_original
    product_type = mission.get("primary_product_type_en", "") or mission.get("primary_product_type", "") or search_query_en
    destination_country = mission.get("destination_country", "US")
    budget_display = _format_budget_from_mission(mission)
    detected_language = mission.get("detected_language", "en")

    if reasoning_steps is None:
        display_message = user_message or search_query_original or search_query_en or "您的购物需求"
        reasoning_steps = [
            {
                "step": "分析用户输入",
                "content": f"正在分析您的购物需求：「{display_message[:50]}{'...' if len(display_message) > 50 else ''}」",
                "type": "analyzing",
            },
            {
                "step": "提取关键信息",
                "content": f"产品关键词：{product_type}，目的地：{destination_country}，预算：{budget_display}",
                "type": "extracting",
            },
            {
                "step": "构建任务规格",
                "content": "正在构建结构化的购物任务规格（MissionSpec）...",
                "type": "building",
            },
            {
                "step": "生成结构化任务",
                "content": f"已生成购物任务：搜索「{search_query_en}」，预算 {budget_display}",
                "type": "result",
            },
        ]

    return {
        "steps": reasoning_steps,
        "detected_language": detected_language,
        "extracted_product": product_type,
        "extracted_country": destination_country,
        "extracted_budget": budget_display,
        "search_query_original": search_query_original,
        "search_query_en": search_query_en,
    }


