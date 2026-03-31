// js/core/retry.js — Retry with exponential backoff for async operations

/**
 * Retry an async function with exponential backoff.
 * @param {Function} fn — async function to retry
 * @param {number} [maxRetries=3] — maximum number of retries
 * @param {number} [baseDelayMs=1000] — initial delay in ms (doubled each retry)
 * @param {number} [maxDelayMs=15000] — cap on delay
 * @returns {Promise<*>} — result of fn()
 */
export async function withRetry(fn, maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 15000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}
