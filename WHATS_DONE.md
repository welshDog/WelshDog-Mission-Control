# WHATS_DONE — Mission Control

> Single source of truth. Never suggest rebuilding anything listed here.
> Full prose history lives in `CHANGELOG.md` — this file is the operator's
> at-a-glance cheat sheet. Updated 2026-06-14.

---

## v0.10.4 — June 14, 2026 — Catch Stragglers Prometheus counters
- `prom-client` added as a production dependency (`^15.1.3`).
- Two Prometheus counters wired into `POST /api/send-dm`:
  - `dm_send_attempt_total` — increments after rate-limit passes (actual delivery attempt)
  - `dm_send_failure_total` — increments on 502 (no Discord + no email channel)
- `GET /metrics` endpoint added (unauthenticated, Prometheus-scrape-safe).
- LIVE-MATRIX: Discord DM Observability row moves from 🔴 MISSING to 🟢 LIVE.
- Smoke test pending: Bro must add `DISCORD_BOT_TOKEN` to Render env, then test send-dm with 1 real discordId.

## v0.9.0 — May 25, 2026 — ActivityTicker v2 (mc_events realtime)
- `ActivityTicker.jsx` rewritten to read `mc_events` directly (realtime INSERT subscription on the v0.5.0 publication).
- Per-event-type renderer with icon + colour + summary pulled from structured `payload`:
  - `straggler.dm_sent`, `tokens.granted`, `tokens.grant_skipped_duplicate`, `refund.issued`, `refund.failed`, `refund.token_deduction_failed` — all styled.
  - Unknown `event_type` rows render with `Radio` icon + raw type name — new events surface instantly, no code change required to *appear* (only to style).
- `mc_missions` fallback subscription kept for: manual + DnD + Pulse/Brief auto-cards. Mission INSERTs whose `signal_source` starts with `catch_stragglers:` / `grant_tokens:` / `refund:` are deduped (the matching `mc_events` row wins).
- `window.__mcExternalEventPush` external-channel hook preserved.
- `MAX_EVENTS` 20 → 50; actor email shortened to local-part in line, full email on hover.
- Commit: `3e7738f`.

## v0.8.0 — May 25, 2026 — Refund (live end-to-end)
- 5th Agent Action shipped. Stripe charge refund + matching BROski$ deduction in one operator click.
- New routes: `POST /api/refund/preview`, `POST /api/refund` (admin-only).
- Raw Stripe REST via `stripeFetch()` helper — no SDK, no new deps. `Idempotency-Key` header + `spend_tokens()` `p_source_id` both keyed off one editing-session UUID → safe under double-click / retry / network flake.
- Pre-flight balance check at preview AND re-checked at commit (`400 insufficient_balance_for_refund` if bypassed).
- Refund execution order: Stripe first, then tokens. Partial-failure path (Stripe ok, `spend_tokens` fails) writes a `p0` `investigating`-lane `mc_missions` card + `refund.token_deduction_failed` event for manual reconciliation.
- `404 no_token_award_found` if there's no `token_transactions` row for the PI — refuses to refund cash without a matching token award (manual Stripe-dashboard refund still available for edge cases).
- UI: `src/components/mission/Refund.jsx` (~325 LOC) — paste `pi_*` → Preview → Commit. `Intl.NumberFormat` currency display. Esc-to-close disabled while in flight.
- AgentActions live count `4/6 → 5/6`. Only `Drift Scan` remains as a SOON tile.
- Env added: `STRIPE_SECRET_KEY` (server-only, no `VITE_` prefix).
- Commit: `00c59ed`.

## v0.7.1 — May 24, 2026 — Three layout polishes
- `MissionsKanban` header row: gap + margin spacing so the count + buttons don't bleed into the lane headers.
- Pipeline columns: `gap-5 md:gap-6`, `p-4` interior, divider line under each lane header. Labels truncate, icons + counts `shrink-0`.
- `AgentActions` tiles: `flex flex-col h-full min-h-[128px]`, `SOON` badge pinned bottom-left with `mt-auto`. Equal-height tiles across rows.
- No server / schema / auth changes.

## v0.7.0 — May 24, 2026 — Grant Tokens (live end-to-end)
- 4th Agent Action shipped. Uses the course's existing `award_tokens()` RPC (SECURITY DEFINER, idempotent via `(user_id, reason, source_id)` partial unique).
- New routes: `POST /api/grant-tokens/preview`, `POST /api/grant-tokens` (admin-only).
- Server validation: UUID v4 on `userId`, positive int `amount` ≤ `MAX_GRANT_PER_CALL` (default 10000, env-overrideable), `reason` ≥ 3 chars after trim.
- Idempotency: client emits stable session UUID, server passes `mc-grant-<uuid>` as `p_source_id`. UI distinguishes "Tokens granted" from "Already granted (idempotent no-op)".
- Audit: `mc_missions` shipped-lane card (skipped on no-op) + `mc_events` row (`tokens.granted` vs `tokens.grant_skipped_duplicate`) — actor stamped from JWT, priority `p1` ≥1000 else `p2`.
- UI: `src/components/mission/GrantTokens.jsx` (~260 LOC) — two-step overlay, projected balance, error surface distinguishes 401 / 403 / `user_not_found` / `amount_exceeds_cap`.
- Env added: `MAX_GRANT_PER_CALL` (optional, default 10000).

## v0.6.0 — May 24, 2026 — Server-side admin JWT + first mc_events consumer
- `requireAdmin` Express middleware: Bearer JWT → `supabase.auth.getUser()` → `users.role = 'admin'` → attach `req.user` for actor stamping.
- Error shapes: `401 missing_bearer_token` / `401 invalid_token` / `403 forbidden_not_admin` / `500 role_lookup_failed`.
- `/api/send-dm` is the first protected route + first `mc_events` consumer (`straggler.dm_sent` with structured payload).
- `emitEvent()` helper — single insert point, defaults `actor` to `req.user.email`, never throws (audit failures don't fail user-facing actions).
- Client (`supabase.js` + `CatchStragglers.jsx`) attaches `Authorization: Bearer <access_token>`; row error surface distinguishes 401 / 403 / 429.
- DB migration applied: `add_mc_missions_signal_source_lane_title_notes` (`signal_source TEXT`, `lane TEXT DEFAULT 'todo'`, `title TEXT`, `notes TEXT`, + index on `signal_source`).
- Admin role confirmed: `users.role = 'admin'` for `63df5bcb-9c5a-4b7b-992d-3e3e7b3295d9`.
- Server boot crash fixed (`const DISCORD_BOT_TOKEN = DISCORD_BOT_TOKEN || ...` TDZ self-reference from a sloppy `replace_all`) — now reads `process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN`.

## v0.5.0 — May 24, 2026 — mc_events spine + mc_missions schema bump
- Migration `20260524000000_mc_events_and_missions_schema_bump.sql` applied via Supabase MCP.
- New `public.mc_events`: append-only event log, `mission_id` FK with `ON DELETE SET NULL` (history survives mission deletion).
- Immutability triggers block UPDATE + DELETE for every role incl. service_role. Corrections via new `*.corrected` event INSERT.
- Indexes: `(created_at DESC)`, `(mission_id, created_at DESC)`, `(event_type, created_at DESC)`, `GIN(payload)`.
- Realtime publication: `mc_events` added → free streaming.
- RLS: SELECT for `authenticated` (defence in depth); **no INSERT policy** — only service_role writes. Compromised browser sessions cannot inject fake audit lines.
- `mc_missions` added nullable `owner text` + `priority text` (CHECK `p0|p1|p2|p3`), partial indexes.

## v0.4.0 — May 23, 2026 — Catch Stragglers (live end-to-end)
- First Express route `POST /api/send-dm` — Discord bot REST API DM delivery, `DISCORD_BOT_TOKEN` server-only.
- 24h-per-user rate limit via `mc_missions` `signal_source` `catch_stragglers:dm_sent:<userId>`.
- Vite dev proxy `/api/*` → `http://localhost:${API_PORT|3011}`; pair with `npm run dev:full`.
- `CatchStragglers.jsx` full-screen overlay: scan → tone-pick (warm/curious/terse) → editable draft → snooze/skip/send. Bulk "Approve all" supported.
- Helpers: `fetchStragglerDrafts`, `snoozeStraggler`, `sendStragglerDM` (`src/lib/supabase.js`).

## v0.3.0 — May 23, 2026 — Pivot to course-ops, drop the shop
- `MissionsKanban` replaces `OrdersKanban`. 4 lanes: `detected → investigating → fixing → shipped`. Auto-archive trigger stamps `resolved_at` on entering `shipped`.
- `AgentActions` 6-tile strip (2 live: Health Pulse + Morning Brief; 4 scaffolded).
- Migration `20260523130000_create_mc_missions_table.sql` applied via MCP.
- Removed: `AdminCalendar`, `OrdersKanban`, shop migrations, shop helpers.

## v0.2.0 / v0.1.0 — May 23, 2026 — Skeleton + first Kanban
- Repo bootstrap: Vite + React 18 + Tailwind + Supabase + framer-motion + lucide-react.
- Auth gate, top bar (live clock + health pill placeholder), Mission Control shell.
- Vite dev port 5174 (so the shop on 5173 can run side-by-side).

---

## Post-v0.9.0 plumbing (not feature-version-tagged)

- **`render.yaml` deploy blueprint** (`68c0a7a`) — Express API deployable to Render. `PORT` fallback added so the same `server/index.js` runs locally on 3011 and on whatever Render assigns.
- **`vercel.json` API proxy rewrites** (`b7d74fd`) — frontend on Vercel proxies `/api/*` to the deployed Express service. Hosts split cleanly: Vercel = SPA, Render = Express.
- **`vitest` smoke test** (`732d053`) — minimum vital-signs test wired (`tests/`).
- **Stragglers modal state lifted to parent** (`b64e27c`) — `activePanel` lives in `MissionControl.jsx`; AgentActions sets it. Cleaner ownership.
- **Old handover docs cleared** (`f3e155c`, `30a7f82`) — historical handovers retired; current handover lives at repo root as the dated file.
- **`docs/` additions** (`a37cdef`, `6fc4b3d`, `e4ba1ed`) — GitHub Issues roadmap tracker, BROski Hyper Config Layer (sandbox/rules/agents/MCP), Hyper Report v1.

---

## Current state — Supabase / server / docker

### Supabase (`yhtmuibgdnxhbgboajhc`)
- Tables: `users`, `mc_missions`, `mc_events`.
- `mc_missions` cols: `id`, `created_at`, `mission_type`, `trigger_source`, `user_id`, `status`, `metadata`, `owner`, `priority`, `signal_source`, `lane`, `title`, `notes`.
- `mc_events` cols: `id`, `mission_id`, `event_type`, `actor`, `payload`, `created_at` — immutability triggers active, RLS-by-absence-of-INSERT-policy.

### Server (`server/index.js` — port 3011 local, `$PORT` on Render)
- Live endpoints: `GET /api/health` (unauth), `POST /api/send-dm`, `POST /api/grant-tokens/preview`, `POST /api/grant-tokens`, `POST /api/refund/preview`, `POST /api/refund` — all admin-gated by `requireAdmin`.
- CORS: env-driven (`API_CORS_ORIGINS`, comma-separated), defaults to `http://localhost:5174` for dev. Set this in Render env for prod origins.
- Rate limit: 1 DM per user per 24h via `mc_missions` `signal_source` lookup.
- Audit: every protected mutation writes `mc_missions` (Kanban) + `mc_events` (immutable detail).
- Dev runner: `npm run dev:full` (vite + server concurrently).

### Docker stack (HyperCode-V2.4 — sibling repo)
- 48 containers healthy. `broski-bot` running on Discord profile.
- NemoClaw alive L1-3.5. Weekly digest posting confirmed.

---

## Do NOT rebuild
- `requireAdmin` middleware — done (v0.6.0).
- `mc_missions` migrations — applied (v0.3.0, v0.5.0 schema bump, v0.6.0 column adds).
- `mc_events` spine — immutability triggers, indexes, realtime publication (v0.5.0).
- Discord DM path (`/api/send-dm`) — proven end-to-end (v0.4.0 + v0.6.0 auth + v0.9.0 event flow).
- `mc_events` audit pattern (`emitEvent` helper, `straggler.dm_sent` / `tokens.granted` / `refund.issued`) — wired.
- Grant Tokens (`/api/grant-tokens` + `GrantTokens.jsx`) — built and live (v0.7.0).
- Refund (`/api/refund` + `Refund.jsx`) — built and live (v0.8.0).
- ActivityTicker v2 (`mc_events` realtime + dedup) — done (v0.9.0).
- `CatchStragglers.jsx` mounted in `MissionControl.jsx` as `activePanel === 'stragglers'` overlay; trigger lives in `AgentActions.jsx`.
- `render.yaml` Express deploy blueprint + `vercel.json` API rewrites.
- `Drift Scan` (6th tile) — built and live (v0.11.0, commit `45625e0`). Re-runs the quiz true/false positional scan over `hv_quizzes` (`runDriftScan()` in `src/lib/supabase.js`); flags mismatches as an `mc_missions` card. Verified live 2026-06-15.

## Open gaps (Agent Actions grid complete — 6/6 live)
- Health Pulse + Morning Brief still poll-based — not yet `mc_events` emitters. Adding `pulse.completed` / `brief.completed` event types would let `ActivityTicker` show them too (currently filtered out as state-table noise).
- Email fallback channel logs only (`email_logged`); real send wires when SMTP is picked.
- Vercel (SPA) + Render (Express) prod env vars need to stay in sync — see commits since v0.9.0 for the deploy plumbing.
