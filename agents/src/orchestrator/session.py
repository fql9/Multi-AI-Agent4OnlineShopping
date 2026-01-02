"""
Session Manager - 会话管理

职责:
- 管理用户会话
- 持久化会话状态
- Token 预算控制
- 会话恢复
"""

import asyncio
import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog

from ..config import get_settings
from ..graph.builder import get_agent_graph
from ..graph.state import AgentState

logger = structlog.get_logger()


class SessionManager:
    """
    会话管理器

    管理用户与 Agent 的对话会话，包括：
    - 会话创建和获取
    - 状态持久化
    - Token 预算控制
    - 超时和过期处理
    """

    def __init__(self):
        self.settings = get_settings()
        self._sessions: dict[str, Session] = {}
        self._cleanup_task: asyncio.Task | None = None

    async def start(self):
        """启动会话管理器"""
        # 启动定期清理任务
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("session_manager.started")

    async def stop(self):
        """停止会话管理器"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        logger.info("session_manager.stopped")

    def create_session(
        self,
        user_id: str,
        session_id: str | None = None,
        token_budget: int | None = None,
    ) -> "Session":
        """创建新会话"""
        if session_id is None:
            session_id = self._generate_session_id(user_id)

        if session_id in self._sessions:
            return self._sessions[session_id]

        session = Session(
            session_id=session_id,
            user_id=user_id,
            token_budget=token_budget or self.settings.max_tokens_per_session,
        )

        self._sessions[session_id] = session
        logger.info(
            "session.created",
            session_id=session_id,
            user_id=user_id,
            token_budget=session.token_budget,
        )

        return session

    def get_session(self, session_id: str) -> "Session | None":
        """获取会话"""
        session = self._sessions.get(session_id)
        if session and session.is_expired:
            self._sessions.pop(session_id, None)
            return None
        return session

    def delete_session(self, session_id: str) -> bool:
        """删除会话"""
        if session_id in self._sessions:
            del self._sessions[session_id]
            logger.info("session.deleted", session_id=session_id)
            return True
        return False

    def list_sessions(self, user_id: str | None = None) -> list["Session"]:
        """列出会话"""
        sessions = list(self._sessions.values())
        if user_id:
            sessions = [s for s in sessions if s.user_id == user_id]
        return [s for s in sessions if not s.is_expired]

    async def _cleanup_loop(self):
        """定期清理过期会话"""
        while True:
            try:
                await asyncio.sleep(300)  # 每 5 分钟
                self._cleanup_expired_sessions()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("session_cleanup.error", error=str(e))

    def _cleanup_expired_sessions(self):
        """清理过期会话"""
        expired = [
            sid for sid, session in self._sessions.items()
            if session.is_expired
        ]
        for sid in expired:
            del self._sessions[sid]
        if expired:
            logger.info("sessions.cleaned", count=len(expired))

    def _generate_session_id(self, user_id: str) -> str:
        """生成会话 ID"""
        timestamp = datetime.now(UTC).isoformat()
        content = f"{user_id}:{timestamp}"
        return f"sess_{hashlib.sha256(content.encode()).hexdigest()[:16]}"


class Session:
    """
    单个会话

    包含会话状态、消息历史、Token 使用情况
    """

    def __init__(
        self,
        session_id: str,
        user_id: str,
        token_budget: int = 100000,
        timeout_minutes: int = 30,
    ):
        self.session_id = session_id
        self.user_id = user_id
        self.token_budget = token_budget
        self.token_used = 0
        self.timeout_minutes = timeout_minutes

        self.created_at = datetime.now(UTC)
        self.last_activity = datetime.now(UTC)
        self.state: AgentState | None = None
        self.message_history: list[dict] = []
        self.tool_call_history: list[dict] = []

        self._graph = None
        self._thread_id = session_id

    @property
    def is_expired(self) -> bool:
        """检查会话是否过期"""
        timeout = timedelta(minutes=self.timeout_minutes)
        return datetime.now(UTC) - self.last_activity > timeout

    @property
    def token_remaining(self) -> int:
        """剩余 Token 预算"""
        return max(0, self.token_budget - self.token_used)

    @property
    def token_usage_percent(self) -> float:
        """Token 使用百分比"""
        return min(100.0, (self.token_used / self.token_budget) * 100)

    def touch(self):
        """更新最后活动时间"""
        self.last_activity = datetime.now(UTC)

    def add_tokens(self, count: int):
        """增加 Token 使用量"""
        self.token_used += count

    def can_afford_tokens(self, estimated: int) -> bool:
        """检查是否有足够的 Token 预算"""
        return self.token_remaining >= estimated

    async def process_message(
        self,
        message: str,
        context: dict | None = None,
    ) -> dict[str, Any]:
        """
        处理用户消息

        Args:
            message: 用户消息
            context: 额外上下文（如用户确认）

        Returns:
            处理结果
        """
        self.touch()

        # 检查 Token 预算
        estimated_tokens = len(message.split()) * 2 + 500  # 粗略估算
        if not self.can_afford_tokens(estimated_tokens):
            return {
                "success": False,
                "error": "Token budget exceeded",
                "error_code": "TOKEN_BUDGET_EXCEEDED",
                "token_used": self.token_used,
                "token_budget": self.token_budget,
            }

        # 获取或初始化 Graph
        if self._graph is None:
            self._graph = get_agent_graph()

        # 构建输入状态
        from langchain_core.messages import HumanMessage

        input_state = self._build_input_state(message, context)

        try:
            # 运行 Agent Graph
            config = {"configurable": {"thread_id": self._thread_id}}
            result = await self._graph.ainvoke(input_state, config)

            # 更新会话状态
            self.state = result
            self.token_used += result.get("token_used", 0) - (input_state.get("token_used", 0))

            # 记录消息
            self.message_history.append({
                "role": "user",
                "content": message,
                "timestamp": datetime.now(UTC).isoformat(),
            })

            # 提取响应
            response = self._extract_response(result)
            self.message_history.append({
                "role": "assistant",
                "content": response.get("message", ""),
                "timestamp": datetime.now(UTC).isoformat(),
            })

            return {
                "success": True,
                "response": response,
                "current_step": result.get("current_step"),
                "needs_user_input": result.get("needs_user_input", False),
                "token_used": self.token_used,
                "token_remaining": self.token_remaining,
            }

        except Exception as e:
            logger.error(
                "session.process_message.error",
                session_id=self.session_id,
                error=str(e),
            )
            return {
                "success": False,
                "error": str(e),
                "error_code": "INTERNAL_ERROR",
            }

    def _build_input_state(
        self,
        message: str,
        context: dict | None = None,
    ) -> AgentState:
        """构建输入状态"""
        from langchain_core.messages import HumanMessage

        # 如果有现有状态，基于它构建
        if self.state:
            messages = list(self.state.get("messages", []))
            messages.append(HumanMessage(content=message))

            state = {
                **self.state,
                "messages": messages,
            }

            # 合并上下文（用户确认等）
            if context:
                if "user_confirmation" in context:
                    state["user_confirmation"] = context["user_confirmation"]
                if "selected_plan" in context:
                    state["selected_plan"] = context["selected_plan"]
                if "selected_payment_method" in context:
                    state["selected_payment_method"] = context["selected_payment_method"]

            return state

        # 初始状态
        return {
            "messages": [HumanMessage(content=message)],
            "mission": None,
            "candidates": [],
            "verified_candidates": [],
            "plans": [],
            "selected_plan": context.get("selected_plan") if context else None,
            "cart_id": None,
            "draft_order_id": None,
            "draft_order": None,
            "evidence_snapshot_id": None,
            "tool_call_records": [],
            "token_budget": self.token_budget,
            "token_used": self.token_used,
            "current_step": "start",
            "needs_user_input": False,
            "user_confirmation": context.get("user_confirmation") if context else None,
            "error": None,
            "error_code": None,
            "recoverable": True,
        }

    def _extract_response(self, state: AgentState) -> dict:
        """从状态中提取响应"""
        current_step = state.get("current_step", "")

        # 根据当前步骤构建响应
        if state.get("error"):
            return {
                "type": "error",
                "message": state.get("error"),
                "error_code": state.get("error_code"),
                "recoverable": state.get("recoverable", False),
            }

        if current_step == "intent_complete":
            mission = state.get("mission", {})
            return {
                "type": "mission_parsed",
                "message": f"I understand you're looking for products to ship to {mission.get('destination_country')}. Let me search for the best options.",
                "mission": mission,
            }

        if current_step == "candidate_complete":
            candidates = state.get("candidates", [])
            return {
                "type": "candidates_found",
                "message": f"I found {len(candidates)} potential products. Let me verify the details.",
                "count": len(candidates),
            }

        if current_step == "verifier_complete":
            verified = state.get("verified_candidates", [])
            return {
                "type": "verification_complete",
                "message": f"I've verified {len(verified)} products that meet your requirements.",
                "count": len(verified),
            }

        if current_step == "plan_complete":
            plans = state.get("plans", [])
            return {
                "type": "plans_ready",
                "message": f"I've prepared {len(plans)} purchase options for you.",
                "plans": plans,
                "recommended": state.get("recommended_plan"),
            }

        if current_step == "execution_complete":
            result = state.get("execution_result", {})
            return {
                "type": "draft_order_created",
                "message": result.get("summary", "Draft order created successfully."),
                "draft_order_id": result.get("draft_order_id"),
                "payable_amount": result.get("payable_amount"),
            }

        if current_step == "payment_ready":
            payment = state.get("payment_ready", {})
            return {
                "type": "payment_ready",
                "message": payment.get("summary", "Ready for payment."),
                "payment_intent": payment.get("payment_intent"),
                "payment_methods": payment.get("payment_methods"),
            }

        if current_step == "payment_complete":
            result = state.get("payment_result", {})
            return {
                "type": "order_complete",
                "message": f"Payment successful! Your order ID is {result.get('order_id')}.",
                "order_id": result.get("order_id"),
                "receipt_url": result.get("receipt_url"),
            }

        # 默认响应
        return {
            "type": "processing",
            "message": "Processing your request...",
            "current_step": current_step,
        }

    def get_summary(self) -> dict:
        """获取会话摘要"""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "is_expired": self.is_expired,
            "current_step": self.state.get("current_step") if self.state else None,
            "token_used": self.token_used,
            "token_budget": self.token_budget,
            "token_remaining": self.token_remaining,
            "message_count": len(self.message_history),
        }

    def to_dict(self) -> dict:
        """序列化会话（用于持久化）"""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "token_budget": self.token_budget,
            "token_used": self.token_used,
            "timeout_minutes": self.timeout_minutes,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "message_history": self.message_history,
            "state": _serialize_state(self.state) if self.state else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Session":
        """反序列化会话"""
        session = cls(
            session_id=data["session_id"],
            user_id=data["user_id"],
            token_budget=data.get("token_budget", 100000),
            timeout_minutes=data.get("timeout_minutes", 30),
        )
        session.token_used = data.get("token_used", 0)
        session.created_at = datetime.fromisoformat(data["created_at"])
        session.last_activity = datetime.fromisoformat(data["last_activity"])
        session.message_history = data.get("message_history", [])

        if data.get("state"):
            session.state = _deserialize_state(data["state"])

        return session


def _serialize_state(state: AgentState) -> dict:
    """序列化 Agent 状态"""
    result = {}
    for key, value in state.items():
        if key == "messages":
            # 序列化消息
            result[key] = [
                {"type": type(m).__name__, "content": m.content}
                for m in value
            ]
        elif hasattr(value, "model_dump"):
            result[key] = value.model_dump()
        elif isinstance(value, (dict, list, str, int, float, bool, type(None))):
            result[key] = value
        else:
            result[key] = str(value)
    return result


def _deserialize_state(data: dict) -> AgentState:
    """反序列化 Agent 状态"""
    from langchain_core.messages import AIMessage, HumanMessage

    state = {}
    for key, value in data.items():
        if key == "messages":
            messages = []
            for m in value:
                if m["type"] == "HumanMessage":
                    messages.append(HumanMessage(content=m["content"]))
                elif m["type"] == "AIMessage":
                    messages.append(AIMessage(content=m["content"]))
            state[key] = messages
        else:
            state[key] = value
    return state


# 全局会话管理器实例
_session_manager: SessionManager | None = None


def get_session_manager() -> SessionManager:
    """获取会话管理器实例"""
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager


