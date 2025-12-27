"""
重试与降级策略模块

实现:
- 指数退避重试
- 超时处理
- 可恢复错误判断
- 降级策略

遵循 doc/04_tooling_spec.md 规范
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Callable, TypeVar

import structlog

logger = structlog.get_logger()


class RetryableError(Enum):
    """可重试的错误码"""
    TIMEOUT = "TIMEOUT"
    UPSTREAM_ERROR = "UPSTREAM_ERROR"
    RATE_LIMITED = "RATE_LIMITED"
    CONFLICT = "CONFLICT"


class NonRetryableError(Enum):
    """不可重试的错误码"""
    INVALID_ARGUMENT = "INVALID_ARGUMENT"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    COMPLIANCE_BLOCKED = "COMPLIANCE_BLOCKED"
    ADDRESS_INVALID = "ADDRESS_INVALID"
    INTERNAL_ERROR = "INTERNAL_ERROR"


@dataclass
class RetryConfig:
    """重试配置"""
    max_retries: int = 3
    initial_delay_seconds: float = 0.5
    max_delay_seconds: float = 30.0
    exponential_base: float = 2.0
    jitter: bool = True


@dataclass
class FallbackConfig:
    """降级配置"""
    enabled: bool = True
    use_cache: bool = True
    cache_ttl_seconds: int = 300
    default_response: dict[str, Any] | None = None


@dataclass
class ToolCallResult:
    """工具调用结果"""
    success: bool
    data: dict[str, Any] | None
    error_code: str | None
    error_message: str | None
    retried: int
    used_fallback: bool
    latency_ms: int
    timestamp: str


def is_retryable_error(error_code: str) -> bool:
    """判断错误是否可重试"""
    retryable_codes = {e.value for e in RetryableError}
    return error_code in retryable_codes


def get_retry_delay(
    attempt: int,
    config: RetryConfig,
) -> float:
    """计算重试延迟（指数退避 + 抖动）"""
    import random

    delay = config.initial_delay_seconds * (config.exponential_base ** attempt)
    delay = min(delay, config.max_delay_seconds)

    if config.jitter:
        # 添加 ±25% 的抖动
        jitter_range = delay * 0.25
        delay += random.uniform(-jitter_range, jitter_range)

    return max(0.1, delay)


T = TypeVar("T")


async def retry_with_backoff(
    func: Callable[[], Any],
    config: RetryConfig | None = None,
    fallback_config: FallbackConfig | None = None,
    tool_name: str = "unknown",
) -> ToolCallResult:
    """
    带重试和降级的工具调用包装器

    Args:
        func: 异步调用函数
        config: 重试配置
        fallback_config: 降级配置
        tool_name: 工具名称（用于日志）

    Returns:
        ToolCallResult 包含调用结果和元数据
    """
    config = config or RetryConfig()
    fallback_config = fallback_config or FallbackConfig()

    start_time = datetime.utcnow()
    last_error_code: str | None = None
    last_error_message: str | None = None
    retried = 0

    for attempt in range(config.max_retries + 1):
        try:
            result = await func()

            # 检查响应是否成功
            if isinstance(result, dict):
                if result.get("ok") is False:
                    error = result.get("error", {})
                    error_code = error.get("code", "UNKNOWN_ERROR")
                    error_message = error.get("message", "Unknown error")

                    last_error_code = error_code
                    last_error_message = error_message

                    # 检查是否可重试
                    if is_retryable_error(error_code) and attempt < config.max_retries:
                        delay = get_retry_delay(attempt, config)
                        logger.warning(
                            "tool.retry",
                            tool=tool_name,
                            attempt=attempt + 1,
                            error_code=error_code,
                            delay_seconds=delay,
                        )
                        retried += 1
                        await asyncio.sleep(delay)
                        continue

                    # 不可重试或已达到最大重试次数
                    break

                # 成功响应
                latency_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
                return ToolCallResult(
                    success=True,
                    data=result.get("data"),
                    error_code=None,
                    error_message=None,
                    retried=retried,
                    used_fallback=False,
                    latency_ms=latency_ms,
                    timestamp=datetime.utcnow().isoformat(),
                )

            # 非标准响应
            return ToolCallResult(
                success=True,
                data=result if isinstance(result, dict) else {"raw": result},
                error_code=None,
                error_message=None,
                retried=retried,
                used_fallback=False,
                latency_ms=int((datetime.utcnow() - start_time).total_seconds() * 1000),
                timestamp=datetime.utcnow().isoformat(),
            )

        except asyncio.TimeoutError:
            last_error_code = "TIMEOUT"
            last_error_message = "Request timed out"
            if attempt < config.max_retries:
                delay = get_retry_delay(attempt, config)
                logger.warning(
                    "tool.timeout_retry",
                    tool=tool_name,
                    attempt=attempt + 1,
                    delay_seconds=delay,
                )
                retried += 1
                await asyncio.sleep(delay)
                continue

        except Exception as e:
            last_error_code = "UPSTREAM_ERROR"
            last_error_message = str(e)
            if attempt < config.max_retries:
                delay = get_retry_delay(attempt, config)
                logger.warning(
                    "tool.exception_retry",
                    tool=tool_name,
                    attempt=attempt + 1,
                    error=str(e),
                    delay_seconds=delay,
                )
                retried += 1
                await asyncio.sleep(delay)
                continue

    # 所有重试都失败了，尝试降级
    latency_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

    if fallback_config.enabled and fallback_config.default_response is not None:
        logger.warning(
            "tool.fallback",
            tool=tool_name,
            error_code=last_error_code,
            retried=retried,
        )
        return ToolCallResult(
            success=True,
            data={
                **fallback_config.default_response,
                "_fallback": True,
                "_stale": True,
            },
            error_code=None,
            error_message=None,
            retried=retried,
            used_fallback=True,
            latency_ms=latency_ms,
            timestamp=datetime.utcnow().isoformat(),
        )

    # 无法降级，返回错误
    logger.error(
        "tool.failed",
        tool=tool_name,
        error_code=last_error_code,
        retried=retried,
    )
    return ToolCallResult(
        success=False,
        data=None,
        error_code=last_error_code,
        error_message=last_error_message,
        retried=retried,
        used_fallback=False,
        latency_ms=latency_ms,
        timestamp=datetime.utcnow().isoformat(),
    )


# ============================================================
# 工具级别的降级策略
# ============================================================

# 各工具的默认降级响应
TOOL_FALLBACKS: dict[str, dict[str, Any]] = {
    "pricing.get_realtime_quote": {
        "quote_available": False,
        "reason": "service_unavailable",
        "suggestion": "retry_later",
    },
    "shipping.quote_options": {
        "options_available": False,
        "reason": "service_unavailable",
        "suggestion": "retry_later",
    },
    "compliance.check_item": {
        # 合规检查失败时，保守拒绝
        "allowed": False,
        "reason_codes": ["service_unavailable"],
        "message": "Unable to verify compliance, please retry later",
    },
}


def get_fallback_response(tool_name: str) -> dict[str, Any] | None:
    """获取工具的降级响应"""
    return TOOL_FALLBACKS.get(tool_name)

