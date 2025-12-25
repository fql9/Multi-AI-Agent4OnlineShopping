"""
Intent & Preference Agent - 意图解析与偏好建模

职责:
- 解析用户自然语言为结构化 MissionSpec
- 识别硬约束与软偏好
- 必要时发起澄清问题
"""

from .node import intent_node

__all__ = ["intent_node"]

