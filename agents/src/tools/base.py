"""
Base tool utilities.

实现:
- 统一工具调用接口
- 重试与降级策略
- 证据记录
- 错误处理

遵循 doc/04_tooling_spec.md 规范
"""

import hashlib
import os
import uuid
from datetime import datetime
from typing import Any

import httpx
import structlog

from ..config import get_settings
from .retry import (
    FallbackConfig,
    RetryConfig,
    ToolCallResult,
    get_fallback_response,
    retry_with_backoff,
)

logger = structlog.get_logger()

# HTTP client 单例
_http_client: httpx.AsyncClient | None = None

# 默认超时配置
DEFAULT_TIMEOUT = httpx.Timeout(
    connect=5.0,      # 连接超时
    read=30.0,        # 读取超时
    write=10.0,       # 写入超时
    pool=5.0,         # 连接池超时
)


async def get_http_client() -> httpx.AsyncClient:
    """获取 HTTP client 单例"""
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)
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
    retry_config: RetryConfig | None = None,
    enable_fallback: bool = True,
) -> dict[str, Any]:
    """
    统一工具调用接口（带重试和降级）

    Args:
        mcp_server: MCP server 类型 (core, checkout)
        tool_name: 工具名称
        params: 工具参数
        user_id: 用户 ID
        idempotency_key: 幂等键
        retry_config: 重试配置（可选）
        enable_fallback: 是否启用降级

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

    # 定义单次调用函数
    async def single_call() -> dict[str, Any]:
        response = await client.post(url, json=request_body)
        response.raise_for_status()
        result = response.json()

        # 添加 evidence 信息
        if "evidence" not in result:
            result["evidence"] = {}
        result["evidence"]["hash"] = hash_response(result.get("data", {}))
        result["evidence"]["ts"] = datetime.utcnow().isoformat()

        return result

    # 配置降级
    fallback_response = get_fallback_response(tool_name) if enable_fallback else None
    fallback_config = FallbackConfig(
        enabled=enable_fallback and fallback_response is not None,
        default_response=fallback_response,
    )

    # 使用重试包装器调用
    call_result: ToolCallResult = await retry_with_backoff(
        func=single_call,
        config=retry_config or RetryConfig(),
        fallback_config=fallback_config,
        tool_name=tool_name,
    )

    # 构建返回结果
    if call_result.success:
        logger.info(
            "tool.success",
            tool=tool_name,
            request_id=envelope["request_id"],
            retried=call_result.retried,
            used_fallback=call_result.used_fallback,
            latency_ms=call_result.latency_ms,
        )
        return {
            "ok": True,
            "data": call_result.data,
            "warnings": ["Used fallback response"] if call_result.used_fallback else [],
            "ttl_seconds": 60 if not call_result.used_fallback else 30,
            "evidence": {
                "hash": hash_response(call_result.data or {}),
                "ts": call_result.timestamp,
            },
            "_meta": {
                "retried": call_result.retried,
                "used_fallback": call_result.used_fallback,
                "latency_ms": call_result.latency_ms,
            },
        }
    else:
        logger.error(
            "tool.failed",
            tool=tool_name,
            request_id=envelope["request_id"],
            error_code=call_result.error_code,
            retried=call_result.retried,
        )
        return {
            "ok": False,
            "error": {
                "code": call_result.error_code or "INTERNAL_ERROR",
                "message": call_result.error_message or "Unknown error",
            },
            "_meta": {
                "retried": call_result.retried,
                "latency_ms": call_result.latency_ms,
            },
        }


async def call_tool_simple(
    mcp_server: str,
    tool_name: str,
    params: dict[str, Any],
    user_id: str | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """
    简单工具调用（无重试，用于非关键路径）

    Args:
        mcp_server: MCP server 类型
        tool_name: 工具名称
        params: 工具参数
        user_id: 用户 ID
        idempotency_key: 幂等键

    Returns:
        标准响应 Envelope
    """
    settings = get_settings()
    client = await get_http_client()

    url = f"{settings.tool_gateway_url}/tools/{tool_name.replace('.', '/')}"
    envelope = create_request_envelope(
        user_id=user_id,
        idempotency_key=idempotency_key,
    )
    request_body = {**envelope, "params": params}

    try:
        response = await client.post(url, json=request_body)
        response.raise_for_status()
        result = response.json()

        if "evidence" not in result:
            result["evidence"] = {}
        result["evidence"]["hash"] = hash_response(result.get("data", {}))
        result["evidence"]["ts"] = datetime.utcnow().isoformat()

        return result

    except httpx.HTTPStatusError as e:
        return {
            "ok": False,
            "error": {
                "code": "UPSTREAM_ERROR",
                "message": f"HTTP {e.response.status_code}",
            },
        }
    except httpx.TimeoutException:
        return {
            "ok": False,
            "error": {
                "code": "TIMEOUT",
                "message": "Request timed out",
            },
        }
    except Exception as e:
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

