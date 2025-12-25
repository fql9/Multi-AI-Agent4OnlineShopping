"""
Intent Agent Node implementation.
"""

import structlog
from langchain_core.messages import AIMessage, HumanMessage
from langchain_openai import ChatOpenAI

from ..config import get_settings
from ..graph.state import AgentState

logger = structlog.get_logger()


# Intent 解析的 system prompt
INTENT_SYSTEM_PROMPT = """You are an Intent & Preference Agent for an AI shopping assistant.

Your task is to parse the user's natural language request into a structured MissionSpec.

Extract the following information:
1. destination_country: ISO 2-letter country code (required)
2. budget_amount and budget_currency
3. arrival_deadline or arrival_days_max
4. hard_constraints: must-have requirements (e.g., plug type, no batteries)
5. soft_preferences: nice-to-have preferences (e.g., brand, color)
6. objective_weights: priority between price, speed, and risk

If critical information is missing (especially destination_country), ask clarifying questions.

Output format: JSON matching MissionSpec schema.
"""


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

        # 初始化 LLM（使用轻量模型做意图解析）
        llm = ChatOpenAI(
            model=settings.openai_model_planner,
            api_key=settings.openai_api_key,
            temperature=0.1,
        )

        # 构建 prompt
        # TODO: 使用更复杂的 prompt template with function calling
        prompt_messages = [
            {"role": "system", "content": INTENT_SYSTEM_PROMPT},
        ]
        for msg in messages:
            if isinstance(msg, HumanMessage):
                prompt_messages.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                prompt_messages.append({"role": "assistant", "content": msg.content})

        # 调用 LLM
        response = await llm.ainvoke(prompt_messages)

        # TODO: 解析 JSON 响应为 MissionSpec
        # 目前先返回 mock 数据
        mission_dict = {
            "query": messages[-1].content if messages else "",
            "destination_country": "US",  # TODO: 从 LLM 响应解析
            "budget_amount": 100.0,
            "budget_currency": "USD",
        }

        # 更新 token 使用量
        token_used = state.get("token_used", 0) + (response.usage_metadata.get("total_tokens", 0) if hasattr(response, "usage_metadata") else 500)

        logger.info(
            "intent_node.complete",
            mission_country=mission_dict.get("destination_country"),
            token_used=token_used,
        )

        return {
            **state,
            "mission": mission_dict,
            "current_step": "intent_complete",
            "token_used": token_used,
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

