// Guard for GET /metrics (Prometheus scrape target).
//
//   METRICS_TOKEN set                -> require `Authorization: Bearer <token>`
//   unset, NODE_ENV=production       -> fail closed (503): never expose metrics
//                                       publicly by accident
//   unset, anything else (dev/test)  -> open, so `npm run server` just works
//
// Prometheus config:  authorization: { credentials: <METRICS_TOKEN> }

import { timingSafeEqual } from 'node:crypto'

function safeEqual(a, b) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // timingSafeEqual throws on length mismatch; that check leaks only length.
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function createMetricsAuth({ token = process.env.METRICS_TOKEN, nodeEnv = process.env.NODE_ENV } = {}) {
  const expected = (token || '').trim()

  return function metricsAuth(req, res, next) {
    if (!expected) {
      if (nodeEnv === 'production') {
        return res.status(503).json({ success: false, error: 'metrics_token_not_configured' })
      }
      return next()
    }
    const header = req.headers.authorization || ''
    const given = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!given) {
      res.set('WWW-Authenticate', 'Bearer')
      return res.status(401).json({ success: false, error: 'missing_bearer_token' })
    }
    if (!safeEqual(given, expected)) {
      return res.status(403).json({ success: false, error: 'invalid_metrics_token' })
    }
    next()
  }
}
