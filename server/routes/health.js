import express from 'express'
import { supabase, DISCORD_BOT_TOKEN, RATE_LIMIT_MS } from '../config.js'

const router = express.Router()

// ── /api/health ───────────────────────────────────────────────────────
// `commit` lets us verify *which* build is live from outside (Render injects
// RENDER_GIT_COMMIT automatically). Falls back to GIT_COMMIT, then 'dev' for
// local runs. Server-internal changes have no other externally observable
// signal, so this is the deploy-verification marker.
router.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'dev',
    discordTokenPresent: Boolean(DISCORD_BOT_TOKEN),
    supabaseConfigured: Boolean(supabase),
    rateLimitHours: RATE_LIMIT_MS / 3600000,
  })
})

export default router
