"""
Execution Agent - 方案生成与订单执行

职责:
- 基于核验后的候选生成 2-3 个可执行方案
- 创建购物车和草稿订单
- 生成 Evidence Snapshot
"""

from .execution_node import execution_node
from .plan_node import plan_node

__all__ = ["plan_node", "execution_node"]

