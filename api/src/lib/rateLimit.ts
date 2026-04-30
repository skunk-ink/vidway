// In-memory per-IP token bucket rate limiter. Hackathon-grade —
// not perfect, not Redis-backed, restarts on process restart.
// Doesn't need to be more than that for our scope.

import type { MiddlewareHandler } from 'hono'

type Bucket = { tokens: number; updatedAt: number }

export type RateLimitOpts = {
  /** Tokens added per second. (e.g. 10/hour = 10/3600.) */
  refillPerSecond: number
  /** Max tokens that can accumulate. */
  capacity: number
  /** How to derive the bucket key from a request. Defaults to client IP. */
  key?: (c: Parameters<MiddlewareHandler>[0]) => string
  /** Identifier surfaced in the error response. */
  scope: string
}

export function rateLimit(opts: RateLimitOpts): MiddlewareHandler {
  const buckets = new Map<string, Bucket>()
  const { refillPerSecond, capacity, scope } = opts

  // Periodic GC of cold buckets so the map doesn't grow forever.
  setInterval(
    () => {
      const cutoff = Date.now() - 60 * 60 * 1000 // 1h
      for (const [k, b] of buckets) if (b.updatedAt < cutoff) buckets.delete(k)
    },
    10 * 60 * 1000,
  ).unref?.()

  return async (c, next) => {
    const key = opts.key
      ? opts.key(c)
      : c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
        c.req.header('x-real-ip') ??
        // Hono on @hono/node-server exposes the remote addr via `c.env`
        // when available; fall back to a constant so dev still works.
        'unknown'

    const now = Date.now()
    let b = buckets.get(key)
    if (!b) {
      b = { tokens: capacity, updatedAt: now }
      buckets.set(key, b)
    } else {
      const elapsed = (now - b.updatedAt) / 1000
      b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSecond)
      b.updatedAt = now
    }

    if (b.tokens < 1) {
      const retryAfter = Math.ceil((1 - b.tokens) / refillPerSecond)
      c.header('Retry-After', String(retryAfter))
      return c.json(
        {
          error: 'rate_limited',
          message: `too many requests on ${scope}, retry in ${retryAfter}s`,
        },
        429,
      )
    }
    b.tokens -= 1
    await next()
  }
}
