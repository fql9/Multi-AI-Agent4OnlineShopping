"""
Intent Agent Node implementation.

解析用户意图，生成结构化的 MissionSpec。
"""


import structlog
from langchain_core.messages import AIMessage, HumanMessage

from ..config import get_settings
from ..graph.state import AgentState
from ..llm.client import call_llm_and_parse
from ..llm.prompts import INTENT_PROMPT
from ..llm.schemas import MissionParseResult

logger = structlog.get_logger()


async def intent_node(state: AgentState) -> AgentState:
    """
    Intent Agent 节点

    解析用户意图并生成结构化 MissionSpec
    """
    settings = get_settings()
    logger.info("intent_node.start", messages_count=len(state.get("messages", [])))

    try:
        # 获取最新的用户消息
        messages = state.get("messages", [])
        if not messages:
            return {
                **state,
                "error": "No user message provided",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "intent",
            }

        # 获取用户消息内容
        user_message = ""
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                user_message = msg.content
                break

        if not user_message:
            return {
                **state,
                "error": "No user message found",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "intent",
            }

        # 检查是否有 API Key
        if not settings.openai_api_key:
            logger.warning("intent_node.no_api_key", msg="Using mock response")
            # 返回 mock 数据用于测试
            return _mock_intent_response(state, user_message)

        # 构建消息
        prompt_messages = [
            {"role": "system", "content": INTENT_PROMPT},
            {"role": "user", "content": user_message},
        ]

        # 如果有历史对话，添加进去
        for msg in messages[:-1]:  # 除了最后一条
            if isinstance(msg, HumanMessage):
                prompt_messages.insert(-1, {"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                prompt_messages.insert(-1, {"role": "assistant", "content": msg.content})

        # 调用 LLM 并解析结果
        result = await call_llm_and_parse(
            messages=prompt_messages,
            output_schema=MissionParseResult,
            model_type="planner",
            temperature=0.1,
        )

        if result is None:
            logger.warning("intent_node.llm_parse_failed", msg="Falling back to mock")
            return _mock_intent_response(state, user_message)

        # 检查是否需要澄清
        if result.needs_clarification:
            logger.info(
                "intent_node.needs_clarification",
                questions=result.clarification_questions,
            )
            # 返回澄清问题
            clarification_msg = "我需要一些额外信息来帮您找到最合适的商品：\n"
            for q in result.clarification_questions:
                clarification_msg += f"- {q}\n"

            return {
                **state,
                "messages": [*messages, AIMessage(content=clarification_msg)],
                "current_step": "awaiting_clarification",
                "needs_clarification": True,
                "error": None,
            }

        # 构建 Mission 字典
        mission_dict = {
            "destination_country": result.destination_country,
            "budget_amount": result.budget_amount,
            "budget_currency": result.budget_currency,
            "quantity": result.quantity,
            "arrival_days_max": result.arrival_days_max,
            "hard_constraints": [c.model_dump() for c in result.hard_constraints],
            "soft_preferences": [p.model_dump() for p in result.soft_preferences],
            "objective_weights": result.objective_weights.model_dump(),
            "search_query": result.search_query or user_message,
        }

        # 估算 token 使用量（结构化输出没有直接返回 usage）
        token_used = state.get("token_used", 0) + 500  # 估算值

        logger.info(
            "intent_node.complete",
            destination_country=mission_dict.get("destination_country"),
            budget=mission_dict.get("budget_amount"),
            constraints_count=len(mission_dict.get("hard_constraints", [])),
        )

        return {
            **state,
            "mission": mission_dict,
            "current_step": "intent_complete",
            "token_used": token_used,
            "needs_clarification": False,
            "error": None,
        }

    except Exception as e:
        logger.error("intent_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "intent",
        }


def _mock_intent_response(state: AgentState, user_message: str) -> AgentState:
    """
    Mock 响应用于测试（无 API Key 时使用）
    """
    # 简单的关键词提取
    message_lower = user_message.lower()

    # 检测目的国
    destination_country = "US"  # 默认
    if "germany" in message_lower or "德国" in user_message:
        destination_country = "DE"
    elif "uk" in message_lower or "england" in message_lower or "英国" in user_message:
        destination_country = "GB"
    elif "japan" in message_lower or "日本" in user_message:
        destination_country = "JP"
    elif "china" in message_lower or "中国" in user_message:
        destination_country = "CN"

    # 检测预算
    budget_amount = 100.0  # 默认
    import re
    budget_match = re.search(r"\$?(\d+(?:\.\d{2})?)", user_message)
    if budget_match:
        budget_amount = float(budget_match.group(1))

    # 检测约束
    hard_constraints = []
    if "iphone" in message_lower:
        hard_constraints.append({"type": "compatibility", "value": "iPhone", "operator": "eq"})
    if "wireless" in message_lower or "无线" in user_message:
        hard_constraints.append({"type": "feature", "value": "wireless", "operator": "eq"})
    if "charger" in message_lower or "充电" in user_message:
        hard_constraints.append({"type": "category", "value": "charger", "operator": "eq"})

    mission_dict = {
        "destination_country": destination_country,
        "budget_amount": budget_amount,
        "budget_currency": "USD",
        "quantity": 1,
        "arrival_days_max": 14,
        "hard_constraints": hard_constraints,
        "soft_preferences": [],
        "objective_weights": {"price": 0.4, "speed": 0.3, "risk": 0.3},
        "search_query": user_message,
    }

    logger.info(
        "intent_node.mock_complete",
        destination_country=destination_country,
        budget=budget_amount,
    )

    return {
        **state,
        "mission": mission_dict,
        "current_step": "intent_complete",
        "token_used": 0,
        "needs_clarification": False,
        "error": None,
    }
