# Changelog

All notable changes to **WelshDog Mission Control** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semver](https://semver.org/).

## [0.6.0] — 2026-05-24

### Added — **Server-side admin JWT auth + first `mc_events` consumer**
Closes the security gap surfaced earlier today and turns on the v0.5.0
spine for real. Every protected endpoint now requires a verified
admin JWT, and every protected mutation writes an immutable
`mc_events` row stamped with the verified actor.

- **`requireAdmin` Express middleware (`server/index.js`)**
  - Pulls `Authorization: Bearer <jwt>` from the request.
  - Verifies the JWT via `supabase.auth.getUser(token)` — the
    service-role client does the signature + expiry check using the
    project's JWT secret.
  - Looks up `users.role` and rejects with **403** if the caller
    isn't an admin (defence in depth on top of the AdminAuth client
    allowlist).
  - On success, attaches `req.user = { id, email }` so handlers stamp
    the verified actor — no more "trust the client payload" surface.
  - Error shapes: `401 missing_bearer_token` / `401 invalid_token` /
    `403 forbidden_not_admin` / `500 role_lookup_failed`.

- **`/api/send-dm` is the first protected route**
  - Was: CORS-only gate, anyone in the allowlist could send DMs.
  - Now: `requireAdmin` runs first; unauthed callers can't even
    enumerate the rate-limit endpoint, let alone send a message.

- **`emitEvent()` helper** — single entry point for every `mc_events`
  insert. Defaults `actor` to `req.user.email`, supports `'system'`
  for autonomous events (cron / webhooks later). Errors are logged
  but never thrown — the audit row failing must never fail the
  user-facing action that already succeeded.

- **`/api/send-dm` now emits a `straggler.dm_sent` event** to
  `mc_events` (in addition to the existing `mc_missions` Kanban row).
  Structured `payload` — `{ userId, channel, tone, discordMessageId,
  discordError, messageLength }` — so future "show me every DM I
  sent in May" queries hit the gin index instead of LIKE-scanning
  `notes`. Mission row's new `owner` column is also stamped now that
  the schema bump from v0.5.0 supports it.

- **Client side (`src/lib/supabase.js` + `CatchStragglers.jsx`)**
  - `sendStragglerDM` fetches `supabase.auth.getSession()` and attaches
    `Authorization: Bearer <access_token>` on every call. Synthetic
    `401 no_session` returned if there's no session (matches server
    error shape so the UI renders one error path).
  - `CatchStragglers` row error surface now distinguishes 401
    (session expired — sign out + back in), 403 (not admin — server
    blocked it), and 429 / generic. Clearer than "HTTP 401".

### Fixed — **server boot crash from earlier replace_all sloppiness**
`server/index.js` line 28 had `const DISCORD_BOT_TOKEN =
DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN` — a TDZ self-
reference my `replace_all: true` introduced when I renamed
`process.env.DISCORD_BOT_TOKEN` → `DISCORD_BOT_TOKEN` in v0.4.x.
Would have thrown `ReferenceError: Cannot access 'DISCORD_BOT_TOKEN'
before initialization` on first boot. Caught on read before any
smoke test had to surface it. Now correctly reads
`process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN`.
**Lesson noted for future: `replace_all` near a `const` declaration
is dangerous; always verify the declaration line by hand.**

### What this unblocks
- **Grant Tokens** — `/api/grant-tokens` can now ship without a real
  security surface: the JWT proves the caller, the audit row proves
  the action, the immutability triggers prove the history is real.
- **Refund** — same pattern + Stripe idempotency keys baked into
  `payload`.
- **Live Activity v2** — `mc_events` is now actively being written to,
  so swapping `ActivityTicker` over to subscribe from there yields a
  real stream of human actions, not a poll of state-table mutations.

### Sacred rules honoured
- ✅ `DISCORD_BOT_TOKEN` + `SUPABASE_SERVICE_ROLE_KEY` remain env-only;
  no new client-exposed env vars.
- ✅ `mc_events` writes still go through service_role (server only);
  the no-INSERT-policy hardening from v0.5.0 is preserved.
- ✅ Idempotent boot — server still starts even with missing env so
  `/api/health` works for diagnostics; protected routes return 500s
  cleanly until env is set.

## [0.5.0] — 2026-05-24

### Added — **`mc_events` spine + `mc_missions` schema bump**
The single highest-leverage move on the Mission Control roadmap.
`mc_missions` was doubling as state + history (signal_source carrying
userIds as a workaround). Splitting the two unlocks: a real Live
Activity feed, audit trails for every Agent Action, actor attribution,
and event-source replay.

- **Migration:** `supabase/migrations/20260524000000_mc_events_and_missions_schema_bump.sql`.
  Applied via Supabase MCP `apply_migration` against the Vibe Coding
  Course project (`yhtmuibgdnxhbgboajhc`). Verified on apply — all 6
  invariants returned true (table exists · 2 columns added to
  mc_missions · 4 custom indexes · 2 immutability triggers · RLS on ·
  realtime publication).

- **New table `public.mc_events`** — append-only event log:
  - Columns: `id uuid pk` · `mission_id uuid → mc_missions(id) ON DELETE SET NULL` ·
    `event_type text` · `actor text` · `payload jsonb` · `created_at timestamptz`.
    Deleting a mission preserves its history (FK nulls, doesn't cascade).
  - **Immutability triggers** block UPDATE + DELETE for every role
    (including service_role). Corrections are made by INSERTing a new
    event (e.g. `event_type = '*.corrected'`). TRUNCATE remains
    available for explicit ops resets.
  - Indexes for the four real query patterns:
    `(created_at DESC)` activity feed · `(mission_id, created_at DESC)`
    mission detail drawer · `(event_type, created_at DESC)` filter ·
    `GIN(payload)` for future `WHERE payload->>'user_id' = ?` queries.
  - **Realtime publication** added → Live Activity feed gets free
    streaming via supabase-js realtime.

- **Security tightening over the naive design:**
  - `mc_events` RLS enabled. **SELECT** policy for `authenticated`
    (defence in depth — AdminAuth allowlist gates the app already).
    **No INSERT policy at all.** Only `service_role` (the MC Express
    server) writes events; service_role bypasses RLS, so the absence
    of an INSERT policy is the security control. A compromised
    browser session cannot inject fake audit lines like
    `{actor: 'lyndzwills@gmail.com', event_type: 'tokens.granted', payload: {amount: 1_000_000}}`.

- **`mc_missions` columns added (both nullable, existing rows survive):**
  - `owner text` — free-form for now (email-shaped); may become
    `uuid → users.id` once mission-ownership UX firms up.
  - `priority text` — constrained by CHECK to `p0` / `p1` / `p2` /
    `p3` so the Kanban can colour-code rows reliably.
  - Partial indexes on both — only index rows where the column is set
    so the index stays small and pre-existing un-owned/un-prioritised
    rows don't consume space.

### What this unblocks (next commits)
- Live Activity feed v2 — `SELECT FROM mc_events ORDER BY created_at DESC LIMIT 50` + realtime subscribe; replaces the current mc_missions+user_level_progress proxy stream.
- Grant Tokens + Refund — each Agent Action emits a `tokens.granted` / `refund.issued` event with full audit detail, actor stamped from the JWT.
- Catch Stragglers audit upgrade — supplement the current `mc_missions` shipped-lane row with a structured `straggler.dm_sent` event (channel, tone, message hash, discord_message_id all queryable via `payload`).
- Missions Board owner/priority chips — UI work only, schema is now ready.

### Sacred rules honoured
- ✅ Applied via Supabase MCP `apply_migration` — never `supabase db push`.
- ✅ Migration is fully idempotent (`IF NOT EXISTS`, `DO $$ ... END $$` guards on constraints + publication adds, `OR REPLACE` on the trigger function).
- ✅ `DISCORD_BOT_TOKEN` + `SUPABASE_SERVICE_ROLE_KEY` remain env-only; no new client-exposed env vars in this commit.

## [0.4.0] — 2026-05-23

### Added — **Catch Stragglers, live end-to-end**
Third Agent Action shipped. The "one button per commit" cadence continues —
this one is rich enough to need its own panel, so we ship a full-screen
overlay plus a tiny Express service for the Discord delivery leg.

- **`server/index.js`** — first Express route lands: `POST /api/send-dm`.
  Opens a Discord DM channel via the bot REST API (`DISCORD_BOT_TOKEN`
  stays server-only) + sends the message. Falls back to `channel:
  email_logged` if `discord_id` is missing. 24h-per-user rate limit
  enforced via `mc_missions` (signal_source `catch_stragglers:dm_sent:<userId>`).
  Discord 429s are surfaced with `retryAfter` so the UI can backoff.
  Every send writes a shipped-lane audit row to `mc_missions` (full
  message + tone + channel in `notes`, visible on the Kanban). Service
  role key is used server-only to bypass RLS for that insert. Adds
  `GET /api/health` for diagnostics. CORS locked to `API_CORS_ORIGINS`.
- **`vite.config.js`** — dev proxy `/api/*` → `http://localhost:${API_PORT|3011}`
  so the SPA hits `/api/send-dm` with no separate base URL (mirrors
  the prod reverse-proxy pattern). Pair with `npm run dev:full`.
- **`src/components/mission/CatchStragglers.jsx`** — full-screen glass
  overlay. Esc-to-close, backdrop-click-to-close. Scan button hits
  `fetchStragglerDrafts()`; per-row tone picker (warm / curious /
  terse), editable textarea, snooze 24h, skip, send. Bulk "Approve all"
  for hyperfocus pacing. Row-level error surface for rate-limit /
  delivery failures (clears on tone change). Empty/loading/no-channel
  states all explicit.
- **`src/lib/supabase.js`** —
  - `fetchStragglerDrafts({ idleDays, limit })`: probes `user_xp` for
    idle students, decorates with `users` + `lesson_progress`, returns
    `{ drafts, total, skipped }` with three tone-tagged DM variants
    pre-baked per student. Defensive — each probe failure becomes a
    `skipped` string, never a crash.
  - `snoozeStraggler(userId)`: writes a `catch_stragglers:snoozed:<id>`
    audit row (UI-local list filtering — we don't auto-filter on the
    next scan; that would make the operator's mental model wobble).
  - `sendStragglerDM(payload)`: thin POST wrapper over `/api/send-dm`.
- **`src/components/mission/AgentActions.jsx`** — Catch Stragglers tile
  flipped to `enabled: true`; live count updated from `2 / 6` to
  `3 / 6`. Clicking the tile opens the overlay (the inline result
  modal handles the lighter Pulse/Brief actions).
- **`.env.example`** — `API_PORT`, `API_CORS_ORIGINS`, `DISCORD_BOT_TOKEN`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` documented with their why.

### Sacred-rules honoured
- `DISCORD_BOT_TOKEN` + `SUPABASE_SERVICE_KEY`: env-only, no `VITE_`
  prefix → never reachable from the browser.
- Schema source of truth is **MC's** `mc_missions` migration. The
  course repo's dead `api/routes/catch_stragglers.py` wrote to phantom
  columns (`mission_type`, `user_id`, `status`, `metadata`) — ignored
  on purpose; we didn't revive that dead branch.
- Course Python files were **not** touched.

### Known follow-ups (not blockers)
- `tests/setup.js` referenced by `vite.config.js` doesn't exist yet —
  unit tests for Catch Stragglers land when the setup is bootstrapped.
- Email fallback channel currently logs only (`email_logged`); real
  send wires when SMTP is picked.
- `MissionControl.jsx:119` has a pre-existing `react/no-unescaped-entities`
  lint warning (`don't` → `don&apos;t`). Unrelated to this commit.

## [0.3.0] — 2026-05-23

### Changed — **pivot to course-ops, drop the shop entirely**
The shop was vibe-only inspiration. Mission Control's actual domain is the
**Vibe Coding Course** — "watch all, do all, behind the scenes." This commit
strips every shop assumption and rewires onto the course's own data.

### Added
- **`src/components/mission/MissionsKanban.jsx`** — replaces `OrdersKanban`.
  4 lanes (`detected → investigating → fixing → shipped`) bound to
  `public.mc_missions`. Cards auto-archive (`resolved_at` stamped by a
  trigger) when they hit `shipped`; un-stamped if pulled back out.
- **`src/components/mission/AgentActions.jsx`** — six "do behind the
  scenes" buttons. Two LIVE end-to-end:
  - 🩺 **Health Pulse** — scans `user_level_progress` for stuck students
    (>7d idle, no completion); also drops a heartbeat card on quiet days
    so the loop is always provable.
  - ☀️ **Morning Brief** — last-24h aggregate (missions detected, missions
    shipped, level progress events). Defensive: missing tables surface as
    "skipped" rather than crashing.
  - Four scaffolded: Catch Stragglers · Grant Tokens · Refund · Drift Scan.
    **One per commit** from here.
- **Migration:** `supabase/migrations/20260523130000_create_mc_missions_table.sql`
  — idempotent: creates `public.mc_missions` + lane CHECK + indexes +
  auto-`updated_at`/`resolved_at` trigger + adds to `supabase_realtime` +
  RLS to `authenticated`. Apply via Supabase MCP `apply_migration` against
  the course project (`yhtmuibgdnxhbgboajhc`).
- **`src/components/mission/ActivityTicker.jsx`** — now streams
  `mc_missions.*` + `user_level_progress.UPDATE`. Skips missing tables
  gracefully. `window.__mcExternalEventPush` hook preserved for the
  Socket.io external channel (later commit).

### Removed
- `src/components/AdminCalendar.jsx` + `src/lib/seasonalEvents.js` — the
  seasonal planner is shop-marketing, not course-ops. Cut.
- `src/components/mission/OrdersKanban.jsx` — superseded by MissionsKanban.
- `supabase/migrations/20260523120000_add_mission_control_fulfillment_status.sql`
  — that was the shop migration; the course doesn't need a
  `fulfillment_status` column.
- All shop helpers in `src/lib/supabase.js` (orders / products / drops /
  demo_bookings). Only mission helpers + agent actions remain.
- `src/components/admin/AdminAuth.jsx` no longer calls the shop's
  `check-admin` edge function. New flow: Supabase Auth +
  `VITE_ADMIN_ALLOWLIST` (comma-separated, fail-closed). Hardening with
  Supabase TOTP MFA + an `is_admin()` RPC lands in the next commit.

### Apply
- Set `VITE_SUPABASE_URL` to the course project (`yhtmuibgdnxhbgboajhc`).
- Set `VITE_ADMIN_ALLOWLIST` to your admin email(s).
- Apply the migration via Supabase MCP.

## [0.2.0] — 2026-05-23

### Added — Kanban + planner + live activity ticker
- **`OrdersKanban`** — `@hello-pangea/dnd` board with 5 lanes
  (`pending → printing → packed → shipped → delivered`) bound to
  `orders.fulfillment_status`. Optimistic drag-and-drop persists via
  `updateFulfillmentStatus`. Subscribes to Supabase Realtime
  (`postgres_changes` on `orders`) so cards move when other clients update.
- **`AdminCalendar`** + `lib/seasonalEvents.js` — copied verbatim from the
  shop. Renders the current month with auto-highlight of today, dot markers
  for fixed + dynamic seasonal events (Easter, Black Friday, Cyber Monday,
  St. David's Day, Christmas chain), and the next 5 upcoming highlights.
- **`ActivityTicker`** — last 20 events from Supabase Realtime
  (`orders.*` + `demo_bookings.INSERT`). Window hook
  (`window.__mcExternalEventPush`) reserved for the Socket.io external
  channel arriving in commit #3.
- **Migration:** `supabase/migrations/20260523120000_add_mission_control_fulfillment_status.sql`
  — idempotently adds the `fulfillment_status` column, a CHECK constraint,
  an index, and adds `orders` + `demo_bookings` to the Realtime publication.

### Changed
- `MissionControl.jsx`: replaced the three placeholders with the real
  components. Top-bar shell + live clock unchanged.

### Apply
- Run the migration via Supabase MCP `apply_migration` against the
  WelshDog Designs Supabase project. **Sacred rule:** NEVER `supabase db push`
  for this repo (history desynced with the shop's local migration set).

## [0.1.0] — 2026-05-23

### Added — skeleton commit
- Repo bootstrap: Vite + React 18 + Tailwind + Supabase + framer-motion + lucide-react.
- `MissionControl` page with auth gate (reuses `welshdog-designs-web3-shop`'s
  Supabase `check-admin` edge function + allowlist fallback).
- Top bar: live auto-updating clock, system-health pill (placeholder GREEN),
  Sync / Deploy / Health quick-action buttons (disabled — wired in #2),
  signed-in admin email + sign-out.
- Main canvas + right sidebar placeholders for the Kanban / seasonal planner
  / live activity ticker.
- Brand alignment with the shop (same `brand.*` Tailwind tokens, same glass
  panel utility classes).

### Decided (architecture)
- **Stack-aligned** with the shop instead of rewriting on Prisma/Passport —
  keeps Supabase Auth (TOTP MFA built-in), RLS, and Realtime.
- Socket.io reserved for **external** events (V2.4 agent pings) — DB events
  use Supabase Realtime directly.
- Vite dev port set to **5174** so the shop (5173) and Mission Control can
  run side-by-side during development.

[0.1.0]: https://github.com/welshDog/WelshDog-Mission-Control/releases/tag/v0.1.0
