"""
LLM 客户端模块

提供统一的 LLM 调用接口，支持：
- 多模型切换（planner/verifier）
- Token 预算控制
- 结构化输出
- 重试与降级
"""

from .client import get_llm, get_llm_with_structured_output
from .prompts import INTENT_PROMPT, PLAN_PROMPT, VERIFIER_PROMPT

__all__ = [
    "get_llm",
    "get_llm_with_structured_output",
    "INTENT_PROMPT",
    "PLAN_PROMPT",
    "VERIFIER_PROMPT",
]

