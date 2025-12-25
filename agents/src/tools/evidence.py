"""
Evidence tools - 证据快照管理
"""

import uuid
from datetime import datetime
from typing import Any

from .base import MOCK_MODE, call_tool, mock_response


async def create_evidence_snapshot(
    user_id: str | None = None,
    session_id: str | None = None,
    mission_id: str | None = None,
    objects: dict | None = None,
    tool_call_records: list | None = None,
    citations: list | None = None,
) -> dict[str, Any]:
    """
    evidence.create_snapshot - 创建证据快照

    Args:
        user_id: 用户 ID
        session_id: 会话 ID
        mission_id: Mission ID
        objects: 关联对象 {"offer_ids": [...], "sku_ids": [...]}
        tool_call_records: 工具调用记录
        citations: 证据引用

    Returns:
        标准响应 Envelope，data 包含 snapshot_id
    """
    if MOCK_MODE:
        snapshot_id = f"ev_{datetime.utcnow().strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}"
        return mock_response({
            "snapshot_id": snapshot_id,
            "user_id": user_id,
            "mission_id": mission_id,
            "objects": objects or {},
            "tool_calls_count": len(tool_call_records or []),
            "citations_count": len(citations or []),
            "created_at": datetime.utcnow().isoformat(),
        })

    return await call_tool(
        mcp_server="checkout",
        tool_name="evidence.create_snapshot",
        params={
            "context": {
                "user_id": user_id,
                "session_id": session_id,
                "mission_id": mission_id,
                "objects": objects or {},
            },
            "tool_calls": tool_call_records or [],
            "citations": citations or [],
        },
        user_id=user_id,
    )


async def attach_to_draft_order(
    draft_order_id: str,
    snapshot_id: str,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    evidence.attach_to_draft_order - 将证据快照绑定到草稿订单

    Returns:
        标准响应 Envelope
    """
    if MOCK_MODE:
        return mock_response({
            "draft_order_id": draft_order_id,
            "snapshot_id": snapshot_id,
            "attached_at": datetime.utcnow().isoformat(),
        })

    return await call_tool(
        mcp_server="checkout",
        tool_name="evidence.attach_to_draft_order",
        params={
            "draft_order_id": draft_order_id,
            "snapshot_id": snapshot_id,
        },
        user_id=user_id,
    )

