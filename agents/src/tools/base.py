"""
Base tool utilities.
"""

import hashlib
import os
import uuid
from datetime import datetime
from typing import Any

import httpx
import structlog

from ..config import get_settings

logger = structlog.get_logger()

# HTTP client 单例
_http_client: httpx.AsyncClient | None = None


async def get_http_client() -> httpx.AsyncClient:
    """获取 HTTP client 单例"""
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=30.0)
    return _http_client


def create_request_envelope(
    actor_type: str = "agent",
    actor_id: str | None = None,
    user_id: str | None = None,
    session_id: str | None = None,
    locale: str = "en-US",
    currency: str = "USD",
    dry_run: bool = False,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """创建标准请求 Envelope"""
    return {
        "request_id": str(uuid.uuid4()),
        "actor": {
            "type": actor_type,
            "id": actor_id or "shopping-agent",
        },
        "user_id": user_id,
        "session_id": session_id,
        "locale": locale,
        "currency": currency,
        "timezone": "UTC",
        "client": {
            "app": "agent",
            "version": "0.1.0",
        },
        "dry_run": dry_run,
        "idempotency_key": idempotency_key,
        "trace": {
            "span_id": str(uuid.uuid4())[:16],
        },
    }


def hash_response(response: dict) -> str:
    """计算响应 hash（用于 Evidence）"""
    import json
    content = json.dumps(response, sort_keys=True)
    return f"sha256:{hashlib.sha256(content.encode()).hexdigest()[:16]}"


async def call_tool(
    mcp_server: str,
    tool_name: str,
    params: dict[str, Any],
    user_id: str | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """
    统一工具调用接口

    Args:
        mcp_server: MCP server 类型 (core, checkout)
        tool_name: 工具名称
        params: 工具参数
        user_id: 用户 ID
        idempotency_key: 幂等键

    Returns:
        标准响应 Envelope
    """
    settings = get_settings()
    client = await get_http_client()

    # 构建请求 URL
    # MVP 阶段直接调用 Tool Gateway
    url = f"{settings.tool_gateway_url}/tools/{tool_name.replace('.', '/')}"

    # 构建请求体
    envelope = create_request_envelope(
        user_id=user_id,
        idempotency_key=idempotency_key,
    )
    request_body = {
        **envelope,
        "params": params,
    }

    logger.info(
        "tool.call",
        tool=tool_name,
        mcp_server=mcp_server,
        request_id=envelope["request_id"],
    )

    try:
        response = await client.post(url, json=request_body)
        response.raise_for_status()
        result = response.json()

        # 添加 evidence 信息
        if "evidence" not in result:
            result["evidence"] = {}
        result["evidence"]["hash"] = hash_response(result.get("data", {}))
        result["evidence"]["ts"] = datetime.utcnow().isoformat()

        logger.info(
            "tool.success",
            tool=tool_name,
            request_id=envelope["request_id"],
        )
        return result

    except httpx.HTTPStatusError as e:
        logger.error(
            "tool.http_error",
            tool=tool_name,
            status_code=e.response.status_code,
        )
        return {
            "ok": False,
            "error": {
                "code": "UPSTREAM_ERROR",
                "message": f"HTTP {e.response.status_code}",
            },
        }
    except httpx.TimeoutException:
        logger.error("tool.timeout", tool=tool_name)
        return {
            "ok": False,
            "error": {
                "code": "TIMEOUT",
                "message": "Request timed out",
            },
        }
    except Exception as e:
        logger.error("tool.error", tool=tool_name, error=str(e))
        return {
            "ok": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": str(e),
            },
        }


# ============================================================
# Mock 工具（开发阶段使用）
# ============================================================

# 根据环境变量决定是否使用 mock
# 如果 Tool Gateway 不可用，自动切换到 mock 模式
MOCK_MODE = os.getenv("MOCK_TOOLS", "false").lower() == "true"


def mock_response(
    data: dict[str, Any],
    ttl_seconds: int = 60,
) -> dict[str, Any]:
    """生成 mock 响应"""
    return {
        "ok": True,
        "data": data,
        "warnings": [],
        "ttl_seconds": ttl_seconds,
        "evidence": {
            "snapshot_id": f"ev_{uuid.uuid4().hex[:12]}",
            "hash": hash_response(data),
            "ts": datetime.utcnow().isoformat(),
        },
    }

