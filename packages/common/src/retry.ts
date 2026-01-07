/**
 * Robust Error Handling Utilities
 * 
 * Provides:
 * - Retry with exponential backoff
 * - Timeout handling
 * - Circuit breaker pattern
 * - Graceful degradation
 */

// ============================================================
// Types
// ============================================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Jitter factor 0-1 (default: 0.1) */
  jitter?: number;
  /** Timeout per attempt in milliseconds (default: 30000) */
  timeout?: number;
  /** Custom retry predicate */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Called before each retry */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time to wait before half-opening circuit in ms (default: 60000) */
  resetTimeout?: number;
  /** Number of successful calls to close circuit (default: 3) */
  successThreshold?: number;
  /** Called when circuit state changes */
  onStateChange?: (state: CircuitState, failures: number) => void;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface FallbackOptions<T> {
  /** Fallback value if all retries fail */
  fallbackValue?: T;
  /** Fallback function if all retries fail */
  fallbackFn?: (error: Error) => T | Promise<T>;
  /** Use cache as fallback */
  useCache?: boolean;
  /** Cache key for fallback */
  cacheKey?: string;
}

// ============================================================
// Custom Errors
// ============================================================

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeout: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string, public readonly resetTime: Date) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoff(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number,
  jitter: number
): number {
  const exponentialDelay = initialDelay * Math.pow(multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  const jitterAmount = cappedDelay * jitter * Math.random();
  return Math.floor(cappedDelay + jitterAmount);
}

/**
 * Wrap a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(
        message || `Operation timed out after ${timeoutMs}ms`,
        timeoutMs
      ));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  // Network errors
  if (error.message.includes('ECONNREFUSED') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('fetch failed')) {
    return true;
  }

  // Timeout errors
  if (error instanceof TimeoutError) {
    return true;
  }

  // HTTP 5xx errors
  if (error.message.includes('500') ||
      error.message.includes('502') ||
      error.message.includes('503') ||
      error.message.includes('504')) {
    return true;
  }

  // Rate limiting
  if (error.message.includes('429') ||
      error.message.includes('rate limit')) {
    return true;
  }

  return false;
}

// ============================================================
// Retry Function
// ============================================================

/**
 * Execute a function with retry logic
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = 0.1,
    timeout = 30000,
    shouldRetry = isRetryableError,
    onRetry,
  } = options;

  let lastError: Error = new Error('Unknown error');
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Wrap with timeout if specified
      const result = timeout > 0
        ? await withTimeout(fn(), timeout, `Attempt ${attempt + 1} timed out`)
        : await fn();
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if we should retry
      if (attempt >= maxRetries || !shouldRetry(lastError, attempt)) {
        throw new RetryExhaustedError(
          `Failed after ${attempt + 1} attempts: ${lastError.message}`,
          attempt + 1,
          lastError
        );
      }

      // Calculate delay
      const delay = calculateBackoff(
        attempt,
        initialDelay,
        maxDelay,
        backoffMultiplier,
        jitter
      );

      // Notify before retry
      if (onRetry) {
        onRetry(lastError, attempt + 1, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw new RetryExhaustedError(
    `Failed after ${maxRetries + 1} attempts: ${lastError.message}`,
    maxRetries + 1,
    lastError
  );
}

// ============================================================
// Circuit Breaker
// ============================================================

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: Date | null = null;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 60000,
      successThreshold: options.successThreshold ?? 3,
      onStateChange: options.onStateChange ?? (() => {}),
    };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure count
   */
  getFailures(): number {
    return this.failures;
  }

  /**
   * Execute function through circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = this.lastFailureTime
        ? Date.now() - this.lastFailureTime.getTime()
        : Infinity;

      if (timeSinceLastFailure < this.options.resetTimeout) {
        throw new CircuitOpenError(
          'Circuit is open, request rejected',
          new Date(this.lastFailureTime!.getTime() + this.options.resetTimeout)
        );
      }

      // Transition to half-open
      this.setState('HALF_OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.setState('CLOSED');
        this.failures = 0;
        this.successes = 0;
      }
    } else if (this.state === 'CLOSED') {
      this.failures = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();
    this.successes = 0;

    if (this.state === 'HALF_OPEN') {
      this.setState('OPEN');
    } else if (this.failures >= this.options.failureThreshold) {
      this.setState('OPEN');
    }
  }

  /**
   * Set circuit state
   */
  private setState(newState: CircuitState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange(newState, this.failures);
    }
  }

  /**
   * Manually reset circuit
   */
  reset(): void {
    this.setState('CLOSED');
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
  }
}

// ============================================================
// Fallback / Graceful Degradation
// ============================================================

// Simple in-memory cache for fallback
const fallbackCache = new Map<string, { value: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Execute function with fallback
 */
export async function withFallback<T>(
  fn: () => Promise<T>,
  options: FallbackOptions<T> = {}
): Promise<T> {
  const { fallbackValue, fallbackFn, useCache, cacheKey } = options;

  try {
    const result = await fn();
    
    // Cache successful result
    if (useCache && cacheKey) {
      fallbackCache.set(cacheKey, { value: result, timestamp: Date.now() });
    }
    
    return result;
  } catch (error) {
    console.warn('[withFallback] Primary execution failed:', error);

    // Try cache first
    if (useCache && cacheKey) {
      const cached = fallbackCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('[withFallback] Returning cached value');
        return cached.value as T;
      }
    }

    // Try fallback function
    if (fallbackFn) {
      console.log('[withFallback] Executing fallback function');
      return fallbackFn(error instanceof Error ? error : new Error(String(error)));
    }

    // Return fallback value
    if (fallbackValue !== undefined) {
      console.log('[withFallback] Returning fallback value');
      return fallbackValue;
    }

    // No fallback available
    throw error;
  }
}

/**
 * Execute with full resilience (retry + circuit breaker + fallback)
 */
export async function withResilience<T>(
  fn: () => Promise<T>,
  options: {
    retry?: RetryOptions;
    circuitBreaker?: CircuitBreaker;
    fallback?: FallbackOptions<T>;
    name?: string;
  } = {}
): Promise<T> {
  const { retry: retryOpts, circuitBreaker, fallback, name = 'operation' } = options;

  const execute = async () => {
    // Apply retry logic
    const retryFn = retryOpts
      ? () => retry(fn, {
          ...retryOpts,
          onRetry: (error, attempt, delay) => {
            console.log(`[${name}] Retry attempt ${attempt}, waiting ${delay}ms...`, error.message);
            retryOpts.onRetry?.(error, attempt, delay);
          },
        })
      : fn;

    // Apply circuit breaker
    if (circuitBreaker) {
      return circuitBreaker.execute(retryFn);
    }
    
    return retryFn();
  };

  // Apply fallback
  if (fallback) {
    return withFallback(execute, fallback);
  }

  return execute();
}

// ============================================================
// HTTP Client with Resilience
// ============================================================

export interface ResilientFetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  fallbackResponse?: Response;
}

/**
 * Fetch with built-in resilience
 */
export async function resilientFetch(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    timeout = 30000,
    retries = 3,
    retryDelay = 1000,
    fallbackResponse,
    ...fetchOptions
  } = options;

  return withResilience(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });

        if (!response.ok && response.status >= 500) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      retry: {
        maxRetries: retries,
        initialDelay: retryDelay,
        shouldRetry: (error) => {
          // Retry on network errors and 5xx responses
          return isRetryableError(error) || error.name === 'AbortError';
        },
      },
      fallback: fallbackResponse ? {
        fallbackValue: fallbackResponse,
      } : undefined,
      name: `fetch:${url}`,
    }
  );
}


