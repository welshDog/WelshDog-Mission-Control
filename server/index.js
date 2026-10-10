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
//
// Layout (v0.12.x split — behaviour-preserving):
//   index.js            — boot: listen + startup banner
//   app.js              — Express app: CORS, body parsing, request log, routers
//   config.js           — dotenv, env, shared constants, counters, Supabase client
//   middleware/         — requireAdmin
//   lib/                — limits (rate-limit instances), events (mc_events), stripe (REST helper)
//   routes/             — one router per feature (health, activity, sendDm, grantTokens, refund, nextMove, metrics)
//   rateLimit.js, metricsAuth.js, cooBrief.js — small pure helpers (unit-tested)
import { app, corsAllowlist } from './app.js'
import { PORT, MAX_GRANT_PER_CALL, STRIPE_SECRET_KEY } from './config.js'

// ── Boot ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🛰️  mc-api listening on http://localhost:${PORT}`)
  console.log(`   CORS allowlist: ${[...corsAllowlist].join(', ') || '(empty)'}`)
  console.log(`   Max grant per call: ${MAX_GRANT_PER_CALL} BROski$`)
  console.log(`   Stripe refunds: ${STRIPE_SECRET_KEY ? 'configured' : '⚠️  STRIPE_SECRET_KEY missing — /api/refund will 500'}`)
})
