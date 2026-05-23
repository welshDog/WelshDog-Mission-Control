// server/index.js — Mission Control's tiny ops API.
//
// Shipped with one route this commit: POST /api/send-dm.
// Catch Stragglers' read+draft phase still runs directly against Supabase
// from the browser (mirrors runHealthPulse). The DM SEND has to live
// server-side because DISCORD_BOT_TOKEN must NEVER reach the client.
//
// Sacred rules honoured:
// - DISCORD_BOT_TOKEN: env-only, never logged in full
// - SUPABASE_SERVICE_ROLE_KEY: env-only, bypasses RLS so mc_missions inserts
//   land even though the server has no Supabase Auth session
// - CORS: locked to MC origins only (dev + configured prod)
// - Rate limit: 1 DM per user per 24h, enforced via mc_missions
//   (signal_source `catch_stragglers:dm_sent:<userId>` lookup)
//
// Sibling repo: Hyper-Vibe-Coding-Course. Keep that boundary clean —
// MC's server NEVER imports from there.
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })
dotenv.config() // fall back to .env

// ── Discord token (accept ecosystem-standard name OR the short form
//    the broski Discord bot uses; either lands here). ────────────────
const DISCORD_BOT_TOKEN = DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN

// ── Required env (fail fast) ──────────────────────────────────────────
const required = {
  DISCORD_BOT_TOKEN: DISCORD_BOT_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
}
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k)
if (missing.length > 0) {
  console.error(`⚠️  Missing required env: ${missing.join(', ')}`)
  console.error('   Server cannot send DMs. Add them to .env.local and restart.')
  console.error('   Note: DISCORD_BOT_TOKEN is also accepted as DISCORD_TOKEN.')
  // We still boot so /api/health works for diagnostic; /api/send-dm will 500.
}

const PORT = Number(process.env.API_PORT) || 3011
const DISCORD_API = 'https://discord.com/api/v10'
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000

// ── Supabase (service-role; server-only, bypasses RLS) ────────────────
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null

// ── Express app ───────────────────────────────────────────────────────
const app = express()

// CORS: explicit allowlist (defence in depth — same Supabase + admin
// allowlist already protect the data layer, but no reason to be loose).
const corsAllowlist = new Set(
  (process.env.API_CORS_ORIGINS || 'http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / curl (no Origin header) + the allowlist.
      if (!origin || corsAllowlist.has(origin)) return cb(null, true)
      return cb(new Error(`Origin ${origin} not in CORS allowlist`))
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  }),
)
app.use(express.json({ limit: '64kb' }))

// Lightweight request log (no body — message text might be sensitive).
app.use((req, _res, next) => {
  console.log(`[mc-api] ${req.method} ${req.path}`)
  next()
})

// ── /api/health ───────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    discordTokenPresent: Boolean(DISCORD_BOT_TOKEN),
    supabaseConfigured: Boolean(supabase),
    rateLimitHours: RATE_LIMIT_MS / 3600000,
  })
})

// ── /api/send-dm ──────────────────────────────────────────────────────
// Body: { userId, discordId?, email?, message, tone? }
// Returns: { success: true,  userId, channel, messageId? }
//          { success: false, userId, error, retryAfter? }
app.post('/api/send-dm', async (req, res) => {
  const { userId, discordId, email, message, tone } = req.body || {}

  if (!userId || !message) {
    return res.status(400).json({ success: false, error: 'userId and message are required' })
  }
  if (!supabase) {
    return res.status(500).json({ success: false, userId, error: 'supabase not configured' })
  }
  if (!DISCORD_BOT_TOKEN) {
    return res.status(500).json({ success: false, userId, error: 'discord token missing' })
  }

  // ── 24h rate limit (mc_missions is the source of truth) ────────────
  const cutoff = new Date(Date.now() - RATE_LIMIT_MS).toISOString()
  const userSignal = `catch_stragglers:dm_sent:${userId}`
  const { data: recent, error: rlErr } = await supabase
    .from('mc_missions')
    .select('id, created_at')
    .eq('signal_source', userSignal)
    .gt('created_at', cutoff)
    .limit(1)
  if (rlErr) {
    console.error('[mc-api] rate-limit lookup failed:', rlErr)
    return res.status(500).json({ success: false, userId, error: 'rate_limit_lookup_failed' })
  }
  if (recent && recent.length > 0) {
    const sentAt = new Date(recent[0].created_at).getTime()
    const retryAfter = Math.max(0, Math.ceil((sentAt + RATE_LIMIT_MS - Date.now()) / 1000))
    return res.status(429).json({ success: false, userId, error: 'rate_limited', retryAfter })
  }

  // ── Discord delivery (DM channel → send message). Fall back to ─────
  // email_logged on failure so the operator can chase manually.
  let channel = 'none'
  let messageId
  let discordError

  if (discordId) {
    try {
      const openRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipient_id: discordId }),
      })
      if (!openRes.ok) {
        discordError = `open_dm ${openRes.status}`
      } else {
        const { id: channelId } = await openRes.json()
        const sendRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: message }),
        })
        if (sendRes.status === 429) {
          const body = await sendRes.json().catch(() => ({}))
          return res.status(429).json({
            success: false,
            userId,
            error: 'discord_rate_limited',
            retryAfter: body.retry_after || 1,
          })
        }
        if (!sendRes.ok) {
          discordError = `send_dm ${sendRes.status}`
        } else {
          const sent = await sendRes.json()
          channel = 'discord'
          messageId = sent.id
        }
      }
    } catch (e) {
      discordError = e?.message || 'discord_fetch_failed'
    }
  }

  if (channel === 'none' && email) {
    // No SMTP wired yet — we LOG the email-fallback so the operator can
    // see exactly who needs a manual chase. Real send lands in a later
    // commit when the email provider is picked.
    channel = 'email_logged'
  }

  if (channel === 'none') {
    return res.status(502).json({
      success: false,
      userId,
      error: discordError || 'no_delivery_channel',
    })
  }

  // ── Audit row (the loop closes here) ────────────────────────────────
  const noteLines = [
    `userId: ${userId}`,
    `channel: ${channel}`,
    `tone: ${tone || 'unknown'}`,
    messageId ? `discord_message_id: ${messageId}` : null,
    discordError ? `discord_error: ${discordError}` : null,
    '',
    'message:',
    message,
  ].filter(Boolean)

  const { error: insErr } = await supabase.from('mc_missions').insert([
    {
      title:
        channel === 'discord'
          ? `Straggler DM sent · ${userId.slice(0, 8)}…`
          : `Straggler DM logged (email) · ${userId.slice(0, 8)}…`,
      signal_source: userSignal,
      lane: 'shipped',
      notes: noteLines.join('\n'),
    },
  ])
  if (insErr) {
    // Delivery already happened — surface the audit failure but still
    // return success so the operator's UI moves on.
    console.error('[mc-api] mc_missions audit insert failed:', insErr)
  }

  return res.json({ success: true, userId, channel, messageId })
})

// ── Boot ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🛰️  mc-api listening on http://localhost:${PORT}`)
  console.log(`   CORS allowlist: ${[...corsAllowlist].join(', ') || '(empty)'}`)
})
