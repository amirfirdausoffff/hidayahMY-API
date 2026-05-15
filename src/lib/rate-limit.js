/**
 * Simple in-memory rate limiter for serverless.
 * Resets on cold start — good enough for basic protection.
 */

const store = new Map();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.start > entry.window) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * @param {string} key - Unique key (e.g. IP + endpoint)
 * @param {number} limit - Max requests
 * @param {number} windowMs - Time window in milliseconds
 * @returns {{ allowed: boolean, remaining: number }}
 */
export function checkRateLimit(key, limit = 60, windowMs = 60 * 1000) {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.start > windowMs) {
    store.set(key, { count: 1, start: now, window: windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: limit - entry.count };
}

/**
 * Get client IP from request
 */
export function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}
