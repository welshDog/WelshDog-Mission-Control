import express from 'express'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { emitEvent } from '../lib/events.js'

const router = express.Router()

// ── /api/activity ─────────────────────────────────────────────────────
// Admin-only. Records completion of the FRONTEND-run, read-only agent
// actions (Health Pulse, Morning Brief) into mc_events. Those run in the
// browser (queries via the anon client), but mc_events INSERT is
// service-role-only by design, so the browser cannot write its own audit
// row. This thin endpoint stamps the verified actor and emits via
// service_role.
//
// `event_type` is mapped from a server-side whitelist — the client sends
// a `kind`, never a raw event_type, so a compromised session can't inject
// arbitrary audit types. The `summary` is coerced to bounded non-negative
// integers (the browser is the source; we don't trust its shape).
//
// Body: { kind: 'pulse' | 'brief', summary?: {...} }
// Returns: { success: true, event_type } · 400 unknown_activity_kind
const ACTIVITY_EVENTS = {
  pulse: 'pulse.completed',
  brief: 'brief.completed',
  drift: 'drift.completed',
}

router.post('/api/activity', requireAdmin, async (req, res) => {
  const { kind, summary } = req.body || {}
  const eventType = ACTIVITY_EVENTS[kind]
  if (!eventType) {
    return res.status(400).json({ success: false, error: 'unknown_activity_kind' })
  }

  const toCount = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0)
  const s = summary && typeof summary === 'object' ? summary : {}
  const payload =
    kind === 'pulse'
      ? { createdCount: toCount(s.createdCount), scanned: toCount(s.scanned), skipped: toCount(s.skipped) }
      : kind === 'brief'
      ? { rowCount: toCount(s.rowCount), skipped: toCount(s.skipped) }
      : { totalModules: toCount(s.totalModules), totalTrueFalse: toCount(s.totalTrueFalse), issueCount: toCount(s.issueCount) }

  await emitEvent({ eventType, actor: req.user?.email || 'unknown', payload })
  return res.json({ success: true, event_type: eventType })
})

export default router
