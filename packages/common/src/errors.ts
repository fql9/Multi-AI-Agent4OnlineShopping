/**
 * 统一错误码定义
 *
 * 所有服务必须使用这些错误码
 */

export const ErrorCodes = {
  // 通用错误
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // 业务错误 - 需要用户确认
  NEEDS_USER_CONFIRMATION: 'NEEDS_USER_CONFIRMATION',

  // 业务错误 - 合规
  COMPLIANCE_BLOCKED: 'COMPLIANCE_BLOCKED',

  // 业务错误 - 价格/库存
  PRICE_CHANGED: 'PRICE_CHANGED',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',

  // 业务错误 - 地址
  ADDRESS_INVALID: 'ADDRESS_INVALID',
  ADDRESS_NOT_DELIVERABLE: 'ADDRESS_NOT_DELIVERABLE',

  // 业务错误 - 订单
  CART_EMPTY: 'CART_EMPTY',
  CART_EXPIRED: 'CART_EXPIRED',
  DRAFT_ORDER_EXPIRED: 'DRAFT_ORDER_EXPIRED',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',

  // 业务错误 - 幂等
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * 错误码描述映射
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  INVALID_ARGUMENT: 'Invalid request argument',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Permission denied',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'Resource conflict',
  RATE_LIMITED: 'Too many requests',
  TIMEOUT: 'Request timed out',
  UPSTREAM_ERROR: 'Upstream service error',
  INTERNAL_ERROR: 'Internal server error',
  NEEDS_USER_CONFIRMATION: 'User confirmation required',
  COMPLIANCE_BLOCKED: 'Item blocked by compliance rules',
  PRICE_CHANGED: 'Price has changed since quote',
  OUT_OF_STOCK: 'Item is out of stock',
  QUOTE_EXPIRED: 'Quote has expired',
  ADDRESS_INVALID: 'Address is invalid',
  ADDRESS_NOT_DELIVERABLE: 'Cannot deliver to this address',
  CART_EMPTY: 'Cart is empty',
  CART_EXPIRED: 'Cart has expired',
  DRAFT_ORDER_EXPIRED: 'Draft order has expired',
  CONSENT_REQUIRED: 'User consent required',
  IDEMPOTENCY_CONFLICT: 'Request already processed',
};

/**
 * 可恢复的错误码（可以重试）
 */
export const RecoverableErrors: ErrorCode[] = [
  'TIMEOUT',
  'UPSTREAM_ERROR',
  'RATE_LIMITED',
];

/**
 * 需要用户操作的错误码
 */
export const UserActionRequiredErrors: ErrorCode[] = [
  'NEEDS_USER_CONFIRMATION',
  'CONSENT_REQUIRED',
  'ADDRESS_INVALID',
  'PRICE_CHANGED',
  'OUT_OF_STOCK',
];

/**
 * 应用错误类
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message ?? ErrorMessages[code]);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

