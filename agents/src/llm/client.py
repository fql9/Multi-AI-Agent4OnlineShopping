"""
LLM 客户端封装

提供统一的 LLM 调用接口，支持结构化输出。
"""

from typing import TypeVar

import structlog
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from ..config import get_settings

logger = structlog.get_logger()

T = TypeVar("T", bound=BaseModel)


def get_llm(model_type: str = "planner", temperature: float = 0.1) -> ChatOpenAI:
    """
    获取 LLM 实例

    Args:
        model_type: "planner"（轻量）或 "verifier"（重量）
        temperature: 温度参数

    Returns:
        ChatOpenAI 实例
    """
    settings = get_settings()

    model = (
        settings.openai_model_planner
        if model_type == "planner"
        else settings.openai_model_verifier
    )

    return ChatOpenAI(
        model=model,
        api_key=settings.openai_api_key,
        temperature=temperature,
        request_timeout=30,
        max_retries=2,
    )


def get_llm_with_structured_output(
    output_schema: type[T],
    model_type: str = "planner",
    temperature: float = 0.0,
) -> ChatOpenAI:
    """
    获取支持结构化输出的 LLM 实例

    Args:
        output_schema: Pydantic 模型类
        model_type: "planner" 或 "verifier"
        temperature: 温度参数

    Returns:
        绑定了结构化输出的 ChatOpenAI 实例
    """
    llm = get_llm(model_type=model_type, temperature=temperature)
    return llm.with_structured_output(output_schema)


async def call_llm_with_retry(
    llm: ChatOpenAI,
    messages: list,
    max_retries: int = 3,
) -> tuple[str, int]:
    """
    带重试的 LLM 调用

    Args:
        llm: ChatOpenAI 实例
        messages: 消息列表
        max_retries: 最大重试次数

    Returns:
        (响应内容, token 使用量)
    """
    last_error = None

    for attempt in range(max_retries):
        try:
            response = await llm.ainvoke(messages)

            # 获取 token 使用量
            token_count = 0
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                token_count = response.usage_metadata.get("total_tokens", 0)

            content = response.content if hasattr(response, "content") else str(response)
            return content, token_count

        except Exception as e:
            last_error = e
            logger.warning(
                "llm.call_failed",
                attempt=attempt + 1,
                max_retries=max_retries,
                error=str(e),
            )
            if attempt < max_retries - 1:
                # 简单的指数退避
                import asyncio
                await asyncio.sleep(2 ** attempt)

    raise last_error or Exception("LLM call failed after retries")

