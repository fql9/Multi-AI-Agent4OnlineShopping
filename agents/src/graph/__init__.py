"""
LangGraph state machine definitions.
"""

from .state import AgentState


def build_agent_graph(*args, **kwargs):
    """延迟导入以避免循环导入"""
    from .builder import build_agent_graph as _build
    return _build(*args, **kwargs)


__all__ = ["AgentState", "build_agent_graph"]

