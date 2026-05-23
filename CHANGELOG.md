# Changelog

All notable changes to **WelshDog Mission Control** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semver](https://semver.org/).

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
