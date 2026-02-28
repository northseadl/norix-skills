// Retry strategy — exponential backoff with jitter for rate-limit resilience

/** @typedef {{ maxRetries: number, baseDelay: number, maxDelay: number, backoffFactor: number, jitter: number }} RetryConfig */

/** @type {RetryConfig} */
const DEFAULT_CONFIG = {
    maxRetries: 3,
    baseDelay: 5_000,
    maxDelay: 120_000,
    backoffFactor: 2,
    jitter: 0.2,
};

// Error patterns that justify a retry (transient failures only)
const RETRYABLE_PATTERNS = [
    /rate.?limit/i,
    /429/,
    /too many requests/i,
    /timeout/i,
    /ETIMEDOUT/,
    /ECONNRESET/,
    /ECONNREFUSED/,
    /socket hang up/i,
    /overloaded/i,
    /503/,
    /service.?unavailable/i,
    /capacity/i,
];

/**
 * Determine if an error is retryable based on known transient patterns.
 * @param {Error|string} error
 * @returns {boolean}
 */
export function isRetryable(error) {
    const msg = typeof error === "string" ? error : error?.message || "";
    return RETRYABLE_PATTERNS.some((re) => re.test(msg));
}

/**
 * Calculate delay for the given retry attempt using exponential backoff + jitter.
 * @param {number} attempt - zero-based attempt index
 * @param {RetryConfig} [config]
 * @returns {number} delay in ms
 */
export function getRetryDelay(attempt, config = DEFAULT_CONFIG) {
    const base = config.baseDelay * Math.pow(config.backoffFactor, attempt);
    const jitter = base * config.jitter * (Math.random() * 2 - 1);
    return Math.min(Math.round(base + jitter), config.maxDelay);
}

/**
 * Execute `fn` with automatic retry on retryable errors.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ config?: RetryConfig, onRetry?: (attempt: number, delay: number, error: Error) => void }} [opts]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, opts = {}) {
    const config = { ...DEFAULT_CONFIG, ...opts.config };
    let lastError;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt >= config.maxRetries || !isRetryable(err)) throw err;

            const delay = getRetryDelay(attempt, config);
            opts.onRetry?.(attempt + 1, delay, err);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastError;
}

export { DEFAULT_CONFIG as RETRY_CONFIG };
