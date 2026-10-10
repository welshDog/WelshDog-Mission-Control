// Sliding-window rate limiter, keyed per authenticated admin.
//
// In-memory: fine for the single Render instance this API runs on. If the API
// is ever scaled horizontally, swap the Map for a shared store.
//
// Mount AFTER requireAdmin so `req.user.id` exists. Falls back to req.ip so a
// mis-ordered mount still limits something rather than failing open.

export function createRateLimiter({ limit, windowMs, name = 'rate', now = Date.now }) {
  const hits = new Map()

  return function rateLimit(req, res, next) {
    const key = req.user?.id || req.ip || 'anon'
    const t = now()
    const cutoff = t - windowMs
    const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff)

    if (recent.length >= limit) {
      hits.set(key, recent)
      const retryAfter = Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000))
      res.set('Retry-After', String(retryAfter))
      return res.status(429).json({
        success: false,
        error: 'rate_limited',
        scope: name,
        retryAfterSeconds: retryAfter,
      })
    }

    recent.push(t)
    hits.set(key, recent)

    // Opportunistic prune so the map can't grow without bound.
    if (hits.size > 1000) {
      for (const [k, v] of hits) {
        if (v.every((ts) => ts <= cutoff)) hits.delete(k)
      }
    }
    next()
  }
}
