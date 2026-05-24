// server/index.js — Mission Control's tiny ops API.
//
// Endpoints:
//   GET  /api/health  — diagnostic (unauth, safe to expose)
//   POST /api/send-dm — admin-only (JWT-verified), Catch Stragglers DM delivery
//
// Auth model (v0.6.0):
//   Every protected endpoint runs the `requireAdmin` middleware, which:
//     1. Pulls Bearer JWT from Authorization header
//     2. Verifies it via supabase.auth.getUser(token) — service-role
//        client does the signature check using the project's JWT secret
//     3. Looks up `users.role` and rejects if not 'admin'
//     4. Attaches `req.user = { id, email }` so handlers can stamp the
//        verified actor into mc_events / mc_missions audit rows
//   CORS allowlist remains as defence-in-depth, but auth is now the
//   primary gate (CORS alone was a real hole — the service-role key
//   was bypassing all RLS, so anyone in the allowlist could send DMs).
//
// Catch Stragglers read+draft phase still runs directly against Supabase
// from the browser (mirrors runHealthPulse). The DM SEND lives server-
// side because DISCORD_BOT_TOKEN must NEVER reach the client.
//
// Audit pattern:
//   Every protected mutation writes BOTH an mc_missions row (operator-
//   visible Kanban card, lane-tracked) AND an mc_events row (immutable
//   detail, queryable by event_type / actor / payload). Together they
//   give us the "what shipped" (missions) + "what happened" (events)
//   split the v0.5.0 spine was built for.
//
// Sacred rules honoured:
// - DISCORD_BOT_TOKEN + SUPABASE_SERVICE_ROLE_KEY: env-only, never logged
// - CORS: locked to MC origins only (dev + configured prod)
// - Rate limit: 1 DM per user per 24h, enforced via mc_missions lookup
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
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN

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

// ── requireAdmin middleware ──────────────────────────────────────────
// Verifies an Authorization: Bearer <jwt> header against Supabase Auth,
// looks up the user's role, and rejects anything that isn't `admin`.
// On success: attaches `req.user = { id, email }`. Handlers downstream
// stamp these into mc_events.actor so the audit log is trustworthy.
//
// Why not just trust CORS + service_role? Because CORS isn't auth — any
// page in the allowlist could call /api/send-dm without proving who's
// behind it, and service_role would happily send the DM + write the
// "audit" row with no real actor. This middleware closes that hole.
async function requireAdmin(req, res, next) {
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'supabase not configured' })
  }
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return res.status(401).json({ success: false, error: 'missing_bearer_token' })
  }

  // Verify the JWT (signature + expiry) against Supabase Auth.
  const { data: userRes, error: jwtErr } = await supabase.auth.getUser(token)
  if (jwtErr || !userRes?.user) {
    return res.status(401).json({ success: false, error: 'invalid_token' })
  }

  // Role check — defence in depth on top of the AdminAuth client allowlist.
  const { data: profile, error: roleErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', userRes.user.id)
    .single()
  if (roleErr) {
    console.error('[mc-api] role lookup failed:', roleErr)
    return res.status(500).json({ success: false, error: 'role_lookup_failed' })
  }
  if (profile?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'forbidden_not_admin' })
  }

  req.user = { id: userRes.user.id, email: userRes.user.email }
  next()
}

// ── mc_events helper — single emit point so all handlers stamp the
//    same shape. `actor` defaults to req.user.email; pass 'system' for
//    autonomous events (cron, webhooks). Errors are logged but never
//    thrown — the audit row failing must NEVER fail the user-facing
//    action that already succeeded. ──────────────────────────────────
async function emitEvent({ missionId = null, eventType, actor, payload = {} }) {
  if (!supabase) return
  const { error } = await supabase.from('mc_events').insert([
    { mission_id: missionId, event_type: eventType, actor, payload },
  ])
  if (error) {
    console.error(`[mc-api] mc_events insert failed (${eventType}):`, error)
  }
}

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
// Admin-only. Body: { userId, discordId?, email?, message, tone? }
// Returns: { success: true,  userId, channel, messageId? }
//          { success: false, userId, error, retryAfter? }
//   401 = missing/invalid Bearer JWT · 403 = authenticated but not admin
app.post('/api/send-dm', requireAdmin, async (req, res) => {
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

  // ── Audit (the loop closes here) ────────────────────────────────────
  // Two-layer pattern: mc_missions = operator-visible Kanban card,
  // mc_events = immutable detail. Both writes are best-effort — if
  // either fails after the DM already shipped, we log + still return
  // success so the operator's UI moves on (the alternative is making
  // them think the DM didn't send, which is worse than a stale audit).
  const actor = req.user?.email || 'unknown'
  const noteLines = [
    `userId: ${userId}`,
    `channel: ${channel}`,
    `tone: ${tone || 'unknown'}`,
    `actor: ${actor}`,
    messageId ? `discord_message_id: ${messageId}` : null,
    discordError ? `discord_error: ${discordError}` : null,
    '',
    'message:',
    message,
  ].filter(Boolean)

  const { data: missionRows, error: insErr } = await supabase
    .from('mc_missions')
    .insert([
      {
        title:
          channel === 'discord'
            ? `Straggler DM sent · ${userId.slice(0, 8)}…`
            : `Straggler DM logged (email) · ${userId.slice(0, 8)}…`,
        signal_source: userSignal,
        lane: 'shipped',
        owner: actor,
        notes: noteLines.join('\n'),
      },
    ])
    .select('id')
  if (insErr) {
    console.error('[mc-api] mc_missions audit insert failed:', insErr)
  }
  const missionId = missionRows?.[0]?.id ?? null

  // mc_events row — first real consumer of the v0.5.0 spine. Structured
  // payload so future "show me every DM I sent in May" queries hit a
  // gin index instead of LIKE-scanning notes.
  await emitEvent({
    missionId,
    eventType: 'straggler.dm_sent',
    actor,
    payload: {
      userId,
      channel,
      tone: tone || null,
      discordMessageId: messageId || null,
      discordError: discordError || null,
      messageLength: message.length,
    },
  })

  return res.json({ success: true, userId, channel, messageId })
})

// ── Boot ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🛰️  mc-api listening on http://localhost:${PORT}`)
  console.log(`   CORS allowlist: ${[...corsAllowlist].join(', ') || '(empty)'}`)
})
