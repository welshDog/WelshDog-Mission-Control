# Changelog

All notable changes to **WelshDog Mission Control** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semver](https://semver.org/).

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
