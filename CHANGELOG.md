# Changelog

All notable changes to **WelshDog Mission Control** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semver](https://semver.org/).

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
