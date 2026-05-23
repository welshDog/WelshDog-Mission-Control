# Changelog

All notable changes to **WelshDog Mission Control** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semver](https://semver.org/).

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
