"""
LLM 客户端封装

提供统一的 LLM 调用接口，支持结构化输出。
"""

import re
from typing import TypeVar

import structlog
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from ..config import get_settings

logger = structlog.get_logger()

T = TypeVar("T", bound=BaseModel)


def clean_json_response(text: str) -> str:
    """
    清理 LLM 返回的 JSON 响应

    有些模型会返回 markdown 格式的 JSON（带 ```json ... ```），
    需要提取纯 JSON 部分。

    Args:
        text: LLM 返回的原始文本

    Returns:
        清理后的 JSON 字符串
    """
    # 移除 markdown 代码块标记
    # 匹配 ```json ... ``` 或 ``` ... ```
    code_block_pattern = r"```(?:json)?\s*([\s\S]*?)```"
    match = re.search(code_block_pattern, text)
    if match:
        return match.group(1).strip()

    # 如果没有代码块，尝试找到 JSON 对象/数组
    # 匹配 {...} 或 [...]
    json_pattern = r"(\{[\s\S]*\}|\[[\s\S]*\])"
    match = re.search(json_pattern, text)
    if match:
        return match.group(1).strip()

    # 返回原始文本
    return text.strip()


def get_llm(model_type: str = "planner", temperature: float = 0.1) -> ChatOpenAI:
    """
    获取 LLM 实例

    支持 OpenAI 和 Poe API（通过 base_url 切换）

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

    # 支持自定义 base_url（用于 Poe API 等兼容服务）
    base_url = settings.openai_base_url
    if base_url == "https://api.openai.com/v1":
        base_url = None  # 使用默认值

    logger.info(
        "llm.init",
        model=model,
        base_url=base_url or "default",
        model_type=model_type,
    )

    return ChatOpenAI(
        model=model,
        api_key=settings.openai_api_key,
        base_url=base_url,
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


async def call_llm_and_parse(
    messages: list,
    output_schema: type[T],
    model_type: str = "planner",
    temperature: float = 0.0,
    max_retries: int = 2,
) -> T | None:
    """
    调用 LLM 并解析为结构化输出

    兼容不支持 function calling 的 API（如 Poe）

    Args:
        messages: 消息列表
        output_schema: Pydantic 模型类
        model_type: "planner" 或 "verifier"
        temperature: 温度参数
        max_retries: 最大重试次数

    Returns:
        解析后的 Pydantic 模型实例，失败返回 None
    """
    llm = get_llm(model_type=model_type, temperature=temperature)

    for attempt in range(max_retries):
        try:
            response = await llm.ainvoke(messages)
            content = response.content if hasattr(response, "content") else str(response)

            # 清理并解析 JSON
            cleaned = clean_json_response(content)
            result = output_schema.model_validate_json(cleaned)

            logger.info(
                "llm.parse_success",
                schema=output_schema.__name__,
                attempt=attempt + 1,
            )
            return result

        except Exception as e:
            logger.warning(
                "llm.parse_failed",
                schema=output_schema.__name__,
                attempt=attempt + 1,
                error=str(e),
            )
            if attempt < max_retries - 1:
                import asyncio
                await asyncio.sleep(1)

    return None

