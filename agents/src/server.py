"""
Agent HTTP Server

使用 FastAPI 提供 HTTP 接口，支持：
- /health - 健康检查
- /api/v1/chat - 运行 Agent
- /api/v1/sessions - 会话管理
"""

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, UTC

import structlog
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from .config import get_settings
from .graph import AgentState, build_agent_graph
from .orchestrator import SessionManager, get_session_manager
from .guided_chat import (
    GuidedChatRequest,
    GuidedChatResponse,
    GuidedChatSession,
    get_or_create_session,
    stream_guided_chat,
    process_guided_chat,
    reset_session,
    get_session_info,
    StreamChunk,
)

# 配置日志
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# 全局变量
settings = get_settings()
session_manager: SessionManager | None = None
agent_graph = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global session_manager, agent_graph
    
    logger.info("server.starting", port=settings.server_port)
    
    # 初始化会话管理器
    session_manager = get_session_manager()
    await session_manager.start()
    
    # 预构建 Agent Graph
    agent_graph = build_agent_graph()
    
    logger.info("server.started")
    
    yield
    
    # 清理
    logger.info("server.stopping")
    if session_manager:
        await session_manager.stop()


# 创建 FastAPI 应用
app = FastAPI(
    title="Multi-AI-Agent Shopping System",
    description="AI-powered shopping assistant with evidence-based decision making",
    version="0.4.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========================================
# 请求/响应模型
# ========================================

class ChatRequest(BaseModel):
    """聊天请求"""
    message: str = Field(..., min_length=1, max_length=2000, description="用户消息")
    session_id: str | None = Field(None, description="会话 ID（可选，不提供则创建新会话）")
    user_id: str = Field(default="anonymous", description="用户 ID")


class ChatResponse(BaseModel):
    """聊天响应"""
    session_id: str
    current_step: str
    message: str | None = None
    mission: dict | None = None
    candidates: list[dict] = []
    verified_candidates: list[dict] = []
    plans: list[dict] = []
    selected_plan: dict | None = None
    draft_order_id: str | None = None
    draft_order: dict | None = None
    evidence_snapshot_id: str | None = None
    needs_user_input: bool = False
    error: str | None = None
    error_code: str | None = None
    token_used: int = 0


class HealthResponse(BaseModel):
    """健康检查响应"""
    status: str
    timestamp: str
    version: str
    uptime_seconds: float


class SessionResponse(BaseModel):
    """会话响应"""
    session_id: str
    user_id: str
    created_at: str
    last_active: str
    token_used: int
    token_budget: int
    current_step: str | None = None


# 启动时间
_start_time = datetime.now(UTC)


# ========================================
# API 端点
# ========================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """健康检查端点"""
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(UTC).isoformat() + "Z",
        version="0.4.0",
        uptime_seconds=(datetime.now(UTC) - _start_time).total_seconds(),
    )


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": "Multi-AI-Agent Shopping System",
        "version": "0.4.0",
        "docs": "/docs",
        "health": "/health",
    }


@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    运行 Agent 处理用户请求
    
    流程：
    1. 创建或获取会话
    2. 运行 Agent Graph
    3. 返回结果
    """
    global session_manager, agent_graph
    
    if not session_manager or not agent_graph:
        raise HTTPException(status_code=503, detail="Server not ready")
    
    logger.info("chat.request", message=request.message[:50], session_id=request.session_id)
    
    try:
        # 获取或创建会话
        if request.session_id:
            session = session_manager.get_session(request.session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
        else:
            session = session_manager.create_session(
                user_id=request.user_id,
                token_budget=settings.token_budget_total,
            )
        
        # 更新活动时间
        session.touch()
        
        # 初始状态
        initial_state: AgentState = {
            "messages": [HumanMessage(content=request.message)],
            "mission": None,
            "candidates": [],
            "verified_candidates": [],
            "plans": [],
            "selected_plan": None,
            "cart_id": None,
            "draft_order_id": None,
            "draft_order": None,
            "evidence_snapshot_id": None,
            "tool_call_records": [],
            "token_budget": session.token_budget,
            "token_used": session.token_used,
            "current_step": "start",
            "needs_user_input": False,
            "user_confirmation": None,
            "error": None,
            "error_code": None,
            "recoverable": True,
        }
        
        # 运行 Agent
        config = {
            "configurable": {"thread_id": session.session_id},
            "recursion_limit": 50,  # 增加递归限制以便调试
        }
        result = await agent_graph.ainvoke(initial_state, config)
        
        # 更新会话
        session.add_tokens(result.get("token_used", 0) - session.token_used)
        
        logger.info(
            "chat.complete",
            session_id=session.session_id,
            current_step=result.get("current_step"),
            token_used=result.get("token_used"),
        )
        
        # 构建响应
        return ChatResponse(
            session_id=session.session_id,
            current_step=result.get("current_step", "unknown"),
            message=_extract_message(result),
            mission=result.get("mission"),
            candidates=result.get("candidates", []),
            verified_candidates=result.get("verified_candidates", []),
            plans=result.get("plans", []),
            selected_plan=result.get("selected_plan"),
            draft_order_id=result.get("draft_order_id"),
            draft_order=result.get("draft_order"),
            evidence_snapshot_id=result.get("evidence_snapshot_id"),
            needs_user_input=result.get("needs_user_input", False),
            error=result.get("error"),
            error_code=result.get("error_code"),
            token_used=result.get("token_used", 0),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("chat.error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/sessions/{session_id}", response_model=SessionResponse)
async def get_session_endpoint(session_id: str):
    """获取会话信息"""
    global session_manager
    
    if not session_manager:
        raise HTTPException(status_code=503, detail="Server not ready")
    
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return SessionResponse(
        session_id=session.session_id,
        user_id=session.user_id,
        created_at=session.created_at.isoformat() + "Z",
        last_active=session.last_activity.isoformat() + "Z",
        token_used=session.token_used,
        token_budget=session.token_budget,
        current_step=session.state.get("current_step") if session.state else None,
    )


@app.delete("/api/v1/sessions/{session_id}")
async def delete_session_endpoint(session_id: str):
    """删除会话"""
    global session_manager
    
    if not session_manager:
        raise HTTPException(status_code=503, detail="Server not ready")
    
    success = session_manager.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {"status": "deleted", "session_id": session_id}


@app.post("/api/v1/sessions", response_model=SessionResponse)
async def create_session_endpoint(user_id: str = "anonymous"):
    """创建新会话"""
    global session_manager
    
    if not session_manager:
        raise HTTPException(status_code=503, detail="Server not ready")
    
    session = session_manager.create_session(
        user_id=user_id,
        token_budget=settings.token_budget_total,
    )
    
    return SessionResponse(
        session_id=session.session_id,
        user_id=session.user_id,
        created_at=session.created_at.isoformat() + "Z",
        last_active=session.last_activity.isoformat() + "Z",
        token_used=session.token_used,
        token_budget=session.token_budget,
        current_step=None,
    )


@app.get("/api/v1/sessions", response_model=list[SessionResponse])
async def list_sessions(user_id: str | None = None):
    """列出会话"""
    global session_manager
    
    if not session_manager:
        raise HTTPException(status_code=503, detail="Server not ready")
    
    sessions = session_manager.list_sessions(user_id=user_id)
    
    return [
        SessionResponse(
            session_id=s.session_id,
            user_id=s.user_id,
            created_at=s.created_at.isoformat() + "Z",
            last_active=s.last_activity.isoformat() + "Z",
            token_used=s.token_used,
            token_budget=s.token_budget,
            current_step=s.state.get("current_step") if s.state else None,
        )
        for s in sessions
    ]


# ========================================
# Guided Chat Endpoints
# ========================================

@app.post("/api/v1/guided-chat", response_model=GuidedChatResponse)
async def guided_chat(request: GuidedChatRequest):
    """
    Guided chat for gathering shopping requirements
    
    This endpoint provides a conversational interface to help users
    articulate their shopping needs before passing to the agent system.
    """
    try:
        logger.info(
            "guided_chat.request",
            message=request.message[:50] if request.message else "",
            session_id=request.session_id,
            has_images=len(request.images) > 0,
        )
        
        response = await process_guided_chat(request)
        
        logger.info(
            "guided_chat.response",
            session_id=response.session_id,
            turn_count=response.turn_count,
            ready_to_search=response.ready_to_search,
        )
        
        return response
        
    except Exception as e:
        logger.error("guided_chat.error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/guided-chat/stream")
async def guided_chat_stream(request: GuidedChatRequest):
    """
    Streaming guided chat endpoint
    
    Returns Server-Sent Events (SSE) for real-time response streaming.
    """
    import json
    
    async def event_generator():
        session = get_or_create_session(request.session_id)
        
        try:
            async for chunk in stream_guided_chat(session, request.message, request.images):
                # Format as SSE
                data = chunk.model_dump()
                yield f"data: {json.dumps(data)}\n\n"
                
        except Exception as e:
            logger.error("guided_chat_stream.error", error=str(e))
            error_chunk = StreamChunk(type="error", content=str(e))
            yield f"data: {json.dumps(error_chunk.model_dump())}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/v1/guided-chat/sessions/{session_id}")
async def get_guided_chat_session(session_id: str):
    """Get guided chat session info"""
    session = get_session_info(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "session_id": session.session_id,
        "turn_count": session.turn_count,
        "max_turns": session.max_turns,
        "ready_to_search": session.ready_to_search,
        "extracted_mission": session.extracted_mission,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "has_images": len(m.images) > 0,
                "timestamp": m.timestamp,
            }
            for m in session.messages
        ],
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }


@app.delete("/api/v1/guided-chat/sessions/{session_id}")
async def delete_guided_chat_session(session_id: str):
    """Reset/delete a guided chat session"""
    success = reset_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {"status": "deleted", "session_id": session_id}


def _extract_message(result: dict) -> str | None:
    """从结果中提取最后一条 AI 消息，或生成默认消息"""
    messages = result.get("messages", [])
    for msg in reversed(messages):
        if hasattr(msg, "content") and hasattr(msg, "type") and msg.type == "ai":
            return msg.content
    
    # 如果没有 AI 消息但需要用户输入，根据当前步骤生成默认消息
    if result.get("needs_user_input"):
        current_step = result.get("current_step", "")
        
        if current_step == "no_results":
            return "I couldn't find any products matching your request. Could you try a different search term or be more specific about what you're looking for?"
        
        if current_step == "no_valid_candidates":
            return "I found some products but none of them meet all your requirements. Would you like to adjust your criteria (budget, shipping destination, etc.)?"
        
        if current_step == "waiting_user":
            # 检查是否有 plans 需要用户选择
            if result.get("plans"):
                return "I've found several options for you. Please select a plan to proceed with your purchase."
            return "I need some additional information to proceed. Could you please clarify your requirements?"
        
        if current_step == "awaiting_clarification":
            return "I need some clarification about your request. Could you please provide more details?"
        
        # 默认消息
        return "I need your input to continue. Please provide the requested information."
    
    return None


def main():
    """启动服务器"""
    settings = get_settings()
    logger.info("server.main", host="0.0.0.0", port=settings.server_port)
    
    uvicorn.run(
        "src.server:app",
        host="0.0.0.0",
        port=settings.server_port,
        reload=settings.debug,
        log_level="info",
    )


if __name__ == "__main__":
    main()
