"""
Verification/Critic Agent - 核验与反幻觉

职责:
- 对候选调用实时工具核验：价格/库存/物流/合规
- 检测价格变动、缺货、合规拦截
- 输出核验通过的候选列表
"""

from .node import verifier_node

__all__ = ["verifier_node"]

