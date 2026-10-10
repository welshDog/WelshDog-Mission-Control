// server/config.js — env loading, shared constants, Prometheus counters and the
// service-role Supabase client. Importing this module (first, from anything that
// reads process.env) is what guarantees dotenv has run.
import { createClient } from '@supabase/supabase-js'
import { Counter } from 'prom-client'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config() // fall back to .env

// ── Discord token (accept ecosystem-standard name OR the short form
//    the broski Discord bot uses; either lands here). ────────────────
export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN

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
export const PORT = Number(process.env.PORT) || Number(process.env.API_PORT) || 3011
export const DISCORD_API = 'https://discord.com/api/v10'
export const RATE_LIMIT_MS = 24 * 60 * 60 * 1000

// Token grant guardrails (env-overrideable). Hard cap per single call —
// catches finger-trouble. Daily-aggregate caps land in a follow-up
// once we have enough audit data to set them sensibly.
export const MAX_GRANT_PER_CALL = Number(process.env.MAX_GRANT_PER_CALL) || 10000

// UUID v4 shape check (cheap pre-validation before we hit the DB).
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Prometheus counters — DM observability (LIVE-MATRIX: Discord DM Observability)
export const dmSendAttemptTotal = new Counter({
  name: 'dm_send_attempt_total',
  help: 'Total DM send attempts via /api/send-dm (after rate-limit passes)',
})
export const dmSendFailureTotal = new Counter({
  name: 'dm_send_failure_total',
  help: 'Total DM send failures via /api/send-dm (no delivery channel succeeded)',
})

// Stripe payment_intent shape check + API base.
export const STRIPE_PI_RE = /^pi_[A-Za-z0-9_]+$/
export const STRIPE_API = 'https://api.stripe.com/v1'
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

// ── Supabase (service-role; server-only, bypasses RLS) ────────────────
export const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null
