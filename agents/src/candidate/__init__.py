"""
Candidate Generation Agent - 候选商品召回

职责:
- 调用 catalog.search_offers 召回候选
- 基于 Mission 约束进行初筛
- 输出 50-100 个候选供 Verifier 核验
"""

from .node import candidate_node

__all__ = ["candidate_node"]

