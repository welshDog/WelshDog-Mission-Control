// server/index.js — Mission Control's tiny ops API.
//
// Endpoints:
//   GET  /api/health                 — diagnostic (unauth, safe to expose)
//   POST /api/send-dm                — admin-only, Catch Stragglers DM delivery
//   POST /api/grant-tokens/preview   — admin-only, look up user before grant
//   POST /api/grant-tokens           — admin-only, award BROski$ via existing award_tokens() RPC
//   POST /api/refund/preview         — admin-only, look up Stripe PI + token award before refund
//   POST /api/refund                 — admin-only, Stripe refund + token deduction in one go (idempotent both sides)
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
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { Counter, register } from 'prom-client'

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

// PORT resolution: Render (and most PaaS) auto-injects PORT and
// requires the service to bind to it. Falls back to API_PORT for
// existing local setups, then to 3011 as the dev default.
const PORT = Number(process.env.PORT) || Number(process.env.API_PORT) || 3011
const DISCORD_API = 'https://discord.com/api/v10'
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000

// Token grant guardrails (env-overrideable). Hard cap per single call —
// catches finger-trouble. Daily-aggregate caps land in a follow-up
// once we have enough audit data to set them sensibly.
const MAX_GRANT_PER_CALL = Number(process.env.MAX_GRANT_PER_CALL) || 10000

// UUID v4 shape check (cheap pre-validation before we hit the DB).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Prometheus counters — DM observability (LIVE-MATRIX: Discord DM Observability)
const dmSendAttemptTotal = new Counter({
  name: 'dm_send_attempt_total',
  help: 'Total DM send attempts via /api/send-dm (after rate-limit passes)',
})
const dmSendFailureTotal = new Counter({
  name: 'dm_send_failure_total',
  help: 'Total DM send failures via /api/send-dm (no delivery channel succeeded)',
})

// Stripe payment_intent shape check + API base.
const STRIPE_PI_RE = /^pi_[A-Za-z0-9_]+$/
const STRIPE_API = 'https://api.stripe.com/v1'
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

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
// `commit` lets us verify *which* build is live from outside (Render injects
// RENDER_GIT_COMMIT automatically). Falls back to GIT_COMMIT, then 'dev' for
// local runs. Server-internal changes have no other externally observable
// signal, so this is the deploy-verification marker.
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'dev',
    discordTokenPresent: Boolean(DISCORD_BOT_TOKEN),
    supabaseConfigured: Boolean(supabase),
    rateLimitHours: RATE_LIMIT_MS / 3600000,
  })
})

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

app.post('/api/activity', requireAdmin, async (req, res) => {
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

  dmSendAttemptTotal.inc()

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
    dmSendFailureTotal.inc()
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
        mission_type: 'straggler',
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

// ── /api/grant-tokens/preview ─────────────────────────────────────────
// Admin-only. Body: { userId }
// Returns: { success: true, userId, email, fullName, currentBalance, maxGrantPerCall }
//          { success: false, error }
//
// Purpose: before the operator commits a grant, confirm the userId
// resolves to a real user and surface current balance. Cheap read,
// no side effects, no audit row (a preview that didn't run shouldn't
// pollute the audit log).
app.post('/api/grant-tokens/preview', requireAdmin, async (req, res) => {
  const { userId } = req.body || {}
  if (!userId || typeof userId !== 'string' || !UUID_RE.test(userId)) {
    return res.status(400).json({ success: false, error: 'userId_must_be_uuid' })
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, full_name, broski_tokens')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[mc-api] preview user lookup failed:', error)
    return res.status(500).json({ success: false, error: 'user_lookup_failed' })
  }
  if (!user) {
    return res.status(404).json({ success: false, error: 'user_not_found' })
  }

  return res.json({
    success: true,
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    currentBalance: user.broski_tokens ?? 0,
    maxGrantPerCall: MAX_GRANT_PER_CALL,
  })
})

// ── /api/grant-tokens ─────────────────────────────────────────────────
// Admin-only. Body: { userId, amount, reason, idempotencyKey? }
// Returns: { success, awarded, newBalance, email, fullName, idempotencyKey }
//
// award_tokens() in the course Supabase is SECURITY DEFINER + idempotent
// via the (user_id, reason, source_id) partial unique constraint on
// token_transactions. We pass `mc-grant-<idempotencyKey>` as p_source_id
// so a double-click / retry never grants twice; the RPC's `awarded:false`
// return lets us tell the operator "already done" without erroring.
//
// Audit: emit a `tokens.granted` mc_events row (and an mc_missions
// shipped-lane card the operator can see on the Kanban). Both writes
// are best-effort — if either fails after the grant landed, we log and
// still return success so the operator's UI moves on.
app.post('/api/grant-tokens', requireAdmin, async (req, res) => {
  const { userId, amount, reason } = req.body || {}
  const idempotencyKey =
    typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.length > 0
      ? req.body.idempotencyKey
      : randomUUID()

  // Validate.
  if (!userId || typeof userId !== 'string' || !UUID_RE.test(userId)) {
    return res.status(400).json({ success: false, error: 'userId_must_be_uuid' })
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'amount_must_be_positive_integer' })
  }
  if (amount > MAX_GRANT_PER_CALL) {
    return res.status(400).json({
      success: false,
      error: 'amount_exceeds_cap',
      maxGrantPerCall: MAX_GRANT_PER_CALL,
    })
  }
  if (typeof reason !== 'string' || reason.trim().length < 3) {
    return res.status(400).json({ success: false, error: 'reason_required_min_3_chars' })
  }

  const actor = req.user?.email || 'unknown'
  const sourceId = `mc-grant-${idempotencyKey}`

  // Call award_tokens — atomic ledger insert + balance bump in one RPC.
  const { data: grantData, error: grantErr } = await supabase.rpc('award_tokens', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason.trim(),
    p_source_id: sourceId,
  })
  if (grantErr) {
    console.error('[mc-api] award_tokens RPC failed:', grantErr)
    return res.status(500).json({ success: false, error: 'award_tokens_rpc_failed', detail: grantErr.message })
  }

  const awarded = grantData?.awarded === true
  const newBalance = grantData?.new_balance ?? null

  // Pull profile fields for the audit + the UI's success message.
  let userEmail = null
  let userName = null
  try {
    const { data: profile } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', userId)
      .maybeSingle()
    userEmail = profile?.email ?? null
    userName = profile?.full_name ?? null
  } catch (e) {
    console.error('[mc-api] profile lookup post-grant failed:', e)
  }

  // mc_missions audit (Kanban card). Skipped on idempotent no-op so the
  // operator doesn't see a phantom "shipped" card for a grant that
  // didn't actually move the balance.
  let missionId = null
  if (awarded) {
    const notes = [
      `userId: ${userId}`,
      `email: ${userEmail || 'unknown'}`,
      `amount: +${amount} BROski$`,
      `new_balance: ${newBalance}`,
      `actor: ${actor}`,
      `idempotency_key: ${idempotencyKey}`,
      '',
      'reason:',
      reason.trim(),
    ].join('\n')

    const { data: missionRows, error: insErr } = await supabase
      .from('mc_missions')
      .insert([
        {
          title: `Granted ${amount} BROski$ · ${userEmail || userId.slice(0, 8) + '…'}`,
          signal_source: `grant_tokens:${idempotencyKey}`,
          mission_type: 'grant_tokens',
          lane: 'shipped',
          owner: actor,
          priority: amount >= 1000 ? 'p1' : 'p2',
          notes,
        },
      ])
      .select('id')
    if (insErr) {
      console.error('[mc-api] mc_missions audit insert failed:', insErr)
    } else {
      missionId = missionRows?.[0]?.id ?? null
    }
  }

  // mc_events row — ALWAYS, even on idempotent no-op, because the
  // operator's INTENT to grant is itself audit-worthy ("tried again,
  // got the idempotent no-op"). event_type encodes the outcome.
  await emitEvent({
    missionId,
    eventType: awarded ? 'tokens.granted' : 'tokens.grant_skipped_duplicate',
    actor,
    payload: {
      userId,
      email: userEmail,
      amount,
      reason: reason.trim(),
      newBalance,
      idempotencyKey,
      sourceId,
    },
  })

  return res.json({
    success: true,
    awarded,
    newBalance,
    email: userEmail,
    fullName: userName,
    idempotencyKey,
  })
})

// ── Stripe helpers (raw REST — no SDK, keeps deps slim) ──────────────
// Stripe expects application/x-www-form-urlencoded bodies. Auth is HTTP
// Basic with the secret key as the username (Bearer also works on most
// endpoints but Basic is documented + idiomatic).
const stripeFetch = async (path, { method = 'GET', body = null, idempotencyKey = null } = {}) => {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured')
  }
  const headers = {
    Authorization: `Basic ${Buffer.from(`${STRIPE_SECRET_KEY}:`).toString('base64')}`,
  }
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: body ? new URLSearchParams(body).toString() : undefined,
  })
  const payload = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, payload }
}

// ── /api/refund/preview ───────────────────────────────────────────────
// Admin-only. Body: { paymentIntentId }
// Returns: enough state for the operator to make an informed Confirm:
//   - Stripe payment_intent: amount, currency, status, customer
//   - Prior refunds against that PI (if any) — surfaces double-refunds
//   - The token_transactions row that originally awarded tokens for this PI
//   - The user's current broski_tokens balance
//   - canRefund flag + blocker string when something pre-empts
app.post('/api/refund/preview', requireAdmin, async (req, res) => {
  const { paymentIntentId } = req.body || {}
  if (!paymentIntentId || typeof paymentIntentId !== 'string' || !STRIPE_PI_RE.test(paymentIntentId)) {
    return res.status(400).json({ success: false, error: 'paymentIntentId_must_be_pi_format' })
  }
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ success: false, error: 'stripe_not_configured' })
  }
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'supabase not configured' })
  }

  // 1. Stripe PI lookup
  const piRes = await stripeFetch(`/payment_intents/${paymentIntentId}`).catch((e) => ({
    ok: false, status: 500, payload: { error: { message: e?.message || 'fetch failed' } },
  }))
  if (!piRes.ok) {
    return res.status(piRes.status === 404 ? 404 : 502).json({
      success: false,
      error: piRes.status === 404 ? 'payment_intent_not_found' : 'stripe_lookup_failed',
      detail: piRes.payload?.error?.message || null,
    })
  }
  const pi = piRes.payload

  // 2. Prior refunds against this PI — used both for the UI badge and
  //    to compute remaining refundable amount.
  const refundsRes = await stripeFetch(`/refunds?payment_intent=${paymentIntentId}&limit=10`)
  const priorRefunds = refundsRes.ok ? (refundsRes.payload?.data || []) : []
  const refundedAmount = priorRefunds.reduce((acc, r) => acc + (r.status === 'succeeded' ? r.amount : 0), 0)
  const refundable = Math.max(0, (pi.amount || 0) - refundedAmount)

  // 3. token_transactions row for this PI (the original token award)
  const { data: txnRow, error: txnErr } = await supabase
    .from('token_transactions')
    .select('user_id, amount, reason, created_at')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (txnErr) {
    console.error('[mc-api] token_transactions lookup failed:', txnErr)
    return res.status(500).json({ success: false, error: 'token_lookup_failed' })
  }
  if (!txnRow) {
    return res.status(404).json({
      success: false,
      error: 'no_token_award_found',
      detail: 'No token_transactions row references this payment_intent. Refund the Stripe charge manually via the dashboard if needed; this MC flow refuses to act without a token side to reverse.',
    })
  }

  // 4. User profile + current balance
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, full_name, broski_tokens')
    .eq('id', txnRow.user_id)
    .maybeSingle()
  if (userErr || !user) {
    return res.status(500).json({ success: false, error: 'user_lookup_failed' })
  }

  // 5. Decide canRefund
  let canRefund = true
  let blocker = null
  if (pi.status !== 'succeeded') {
    canRefund = false
    blocker = `Stripe payment_intent status is "${pi.status}" — only succeeded charges can be refunded.`
  } else if (refundable <= 0) {
    canRefund = false
    blocker = 'This payment has already been fully refunded.'
  } else if ((user.broski_tokens ?? 0) < txnRow.amount) {
    canRefund = false
    blocker = `Token deduction would require ${txnRow.amount} BROski$ but user balance is only ${user.broski_tokens ?? 0}. Cannot guarantee a clean reversal.`
  }

  return res.json({
    success: true,
    paymentIntent: {
      id: pi.id,
      amount: pi.amount,            // in minor units (cents)
      currency: pi.currency,
      status: pi.status,
      customer: pi.customer || null,
      created: pi.created,
    },
    refundedAmount,                  // already-refunded amount (minor units)
    refundable,                      // remaining refundable (minor units)
    priorRefundCount: priorRefunds.length,
    tokensAwarded: txnRow.amount,
    tokenReason: txnRow.reason,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      currentBalance: user.broski_tokens ?? 0,
    },
    canRefund,
    blocker,
  })
})

// ── /api/refund ───────────────────────────────────────────────────────
// Admin-only. Body: { paymentIntentId, idempotencyKey? }
// Returns: { success, refundId, refundedAmount, currency, newBalance, idempotencyKey, awarded }
//
// Order of operations is DELIBERATE:
//   1. Re-run preview checks server-side (don't trust client state)
//   2. Stripe refund FIRST with Idempotency-Key — real money first;
//      retries / double-clicks are safe.
//   3. If Stripe succeeds, call spend_tokens() with matching p_source_id
//      so the token side dedups the same way.
//   4. If Stripe succeeds but spend_tokens fails, emit a
//      `refund.token_deduction_failed` event and return success with
//      `awarded: false` so the operator sees the discrepancy and can
//      reconcile manually. The user has their cash back; the token
//      shortfall is logged forever.
//
// Audit:
//   - mc_missions card (shipped lane, owner = actor, priority based on amount)
//   - mc_events row — `refund.issued` (clean) / `refund.token_deduction_failed`
app.post('/api/refund', requireAdmin, async (req, res) => {
  const { paymentIntentId } = req.body || {}
  const idempotencyKey =
    typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.length > 0
      ? req.body.idempotencyKey
      : randomUUID()

  if (!paymentIntentId || typeof paymentIntentId !== 'string' || !STRIPE_PI_RE.test(paymentIntentId)) {
    return res.status(400).json({ success: false, error: 'paymentIntentId_must_be_pi_format' })
  }
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ success: false, error: 'stripe_not_configured' })
  }
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'supabase not configured' })
  }

  const actor = req.user?.email || 'unknown'
  const sourceId = `mc-refund-${idempotencyKey}`

  // 1. Re-run server-side checks (defensive — preview state may be stale)
  const { data: txnRow, error: txnErr } = await supabase
    .from('token_transactions')
    .select('user_id, amount, reason')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (txnErr) return res.status(500).json({ success: false, error: 'token_lookup_failed' })
  if (!txnRow) return res.status(404).json({ success: false, error: 'no_token_award_found' })

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, full_name, broski_tokens')
    .eq('id', txnRow.user_id)
    .maybeSingle()
  if (userErr || !user) return res.status(500).json({ success: false, error: 'user_lookup_failed' })

  if ((user.broski_tokens ?? 0) < txnRow.amount) {
    return res.status(400).json({
      success: false,
      error: 'insufficient_balance_for_refund',
      detail: `User balance ${user.broski_tokens ?? 0} < required deduction ${txnRow.amount}`,
    })
  }

  // 2. Stripe refund (idempotent — Stripe dedups via Idempotency-Key header)
  const stripeRes = await stripeFetch('/refunds', {
    method: 'POST',
    body: { payment_intent: paymentIntentId, reason: 'requested_by_customer' },
    idempotencyKey: sourceId,
  })
  if (!stripeRes.ok) {
    const errMsg = stripeRes.payload?.error?.message || `stripe_${stripeRes.status}`
    await emitEvent({
      eventType: 'refund.failed',
      actor,
      payload: { paymentIntentId, stage: 'stripe', error: errMsg, idempotencyKey, sourceId },
    })
    return res.status(502).json({ success: false, error: 'stripe_refund_failed', detail: errMsg })
  }
  const refund = stripeRes.payload

  // 3. Token deduction (best-effort; failure does NOT roll back Stripe)
  let awarded = false
  let newBalance = user.broski_tokens ?? 0
  let tokenDeductionError = null
  try {
    const { data: spendData, error: spendErr } = await supabase.rpc('spend_tokens', {
      p_user_id: txnRow.user_id,
      p_amount: txnRow.amount,
      p_reason: `refund of ${paymentIntentId}`,
      p_source_id: sourceId,
    })
    if (spendErr) throw spendErr
    awarded = spendData?.spent === true || spendData?.success === true
    newBalance = spendData?.new_balance ?? newBalance
  } catch (e) {
    tokenDeductionError = e?.message || 'spend_tokens RPC failed'
    console.error('[mc-api] post-refund token deduction failed:', tokenDeductionError)
  }

  // 4. Audit — both layers, regardless of token-side outcome
  let missionId = null
  const noteLines = [
    `paymentIntent: ${paymentIntentId}`,
    `refundId: ${refund.id}`,
    `refundedAmount: ${refund.amount} ${refund.currency}`,
    `tokensDeducted: ${awarded ? txnRow.amount : 0}${tokenDeductionError ? ' (FAILED)' : ''}`,
    `newBalance: ${newBalance}`,
    `actor: ${actor}`,
    `idempotency_key: ${idempotencyKey}`,
    tokenDeductionError ? `token_deduction_error: ${tokenDeductionError}` : null,
    '',
    `user: ${user.email || user.id}`,
  ].filter(Boolean)

  const { data: missionRows, error: insErr } = await supabase
    .from('mc_missions')
    .insert([
      {
        title: tokenDeductionError
          ? `Refund landed BUT token deduction FAILED · ${paymentIntentId.slice(0, 12)}…`
          : `Refunded ${refund.amount} ${refund.currency} · ${user.email || paymentIntentId.slice(0, 12) + '…'}`,
        signal_source: `refund:${idempotencyKey}`,
        mission_type: 'refund',
        lane: tokenDeductionError ? 'investigating' : 'shipped',
        owner: actor,
        priority: tokenDeductionError ? 'p0' : (refund.amount >= 5000 ? 'p1' : 'p2'),
        notes: noteLines.join('\n'),
      },
    ])
    .select('id')
  if (insErr) {
    console.error('[mc-api] mc_missions audit insert failed:', insErr)
  } else {
    missionId = missionRows?.[0]?.id ?? null
  }

  await emitEvent({
    missionId,
    eventType: tokenDeductionError ? 'refund.token_deduction_failed' : 'refund.issued',
    actor,
    payload: {
      paymentIntentId,
      refundId: refund.id,
      refundedAmount: refund.amount,
      currency: refund.currency,
      tokensDeducted: awarded ? txnRow.amount : 0,
      newBalance,
      userId: txnRow.user_id,
      email: user.email,
      idempotencyKey,
      sourceId,
      tokenDeductionError,
    },
  })

  return res.json({
    success: true,
    refundId: refund.id,
    refundedAmount: refund.amount,
    currency: refund.currency,
    newBalance,
    awarded,
    tokenDeductionError,
    idempotencyKey,
  })
})

// ── /metrics ─────────────────────────────────────────────────────────
// Prometheus scrape target. Exposes dm_send_attempt_total +
// dm_send_failure_total (and prom-client default process metrics).
// No auth — Prometheus scrapes this from within the network.
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})

// ── Boot ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🛰️  mc-api listening on http://localhost:${PORT}`)
  console.log(`   CORS allowlist: ${[...corsAllowlist].join(', ') || '(empty)'}`)
  console.log(`   Max grant per call: ${MAX_GRANT_PER_CALL} BROski$`)
  console.log(`   Stripe refunds: ${STRIPE_SECRET_KEY ? 'configured' : '⚠️  STRIPE_SECRET_KEY missing — /api/refund will 500'}`)
})
