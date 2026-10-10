import express from 'express'
import { register } from 'prom-client'
import { createMetricsAuth } from '../metricsAuth.js'

const router = express.Router()

// ── /metrics ─────────────────────────────────────────────────────────
// Prometheus scrape target. Exposes dm_send_attempt_total +
// dm_send_failure_total (and prom-client default process metrics).
// Requires `Authorization: Bearer $METRICS_TOKEN` (see server/metricsAuth.js).
// In production with no token set it fails closed (503).
router.get('/metrics', createMetricsAuth(), async (_req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})

export default router
