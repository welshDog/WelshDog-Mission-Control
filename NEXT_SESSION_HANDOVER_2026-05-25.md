# Next Session Handover — 2026-05-25 (v2, post-trap-audit)

> ⚠️ **SUPERSEDED by `NEXT_SESSION_HANDOVER_2026-05-26.md`** (2026-05-25 EOD).
> Most priorities in this doc shipped that same evening: Refund v0.8.0
> (`00c59ed`), render.yaml v0.8.0+ (`68c0a7a`), ActivityTicker v2 v0.9.0
> (`3e7738f`). Read the 2026-05-26 handover for the current state; keep
> this file as the historical record of the morning's reset.
>
> ---
>
> Read this FIRST. Every word. This is the live state.
> v1 (Perplexity, ~01:30 BST) was reverse-engineered from in-flight state and
> carried 4 stale items that mapped to already-done or already-corrected work.
> v2 (Claude, post-audit) tightens the priorities to what's *genuinely* next.

---

## 🏆 What shipped this session (May 24–25) — VERIFIED

| Task | Status |
|---|---|
| `/api/send-dm` smoke test | ✅ PASSED — DM landed in Discord 01:02 BST |
| `mc_events` + `mc_missions` schema bump migration | ✅ Applied via Supabase MCP yesterday (`9dbd95a`); columns added: `owner`, `priority` on `mc_missions` + new `mc_events` table with append-only triggers + RLS + realtime publication |
| `requireAdmin` JWT middleware (v0.6.0) | ✅ Live `6f3f706` — Bearer JWT → `auth.getUser` → role check → `req.user` attached |
| `emitEvent()` helper + first `mc_events` consumer (v0.6.0) | ✅ Live — `/api/send-dm` writes both `mc_missions` Kanban card + `mc_events` `straggler.dm_sent` row |
| Grant Tokens end-to-end (v0.7.0) | ✅ Live `f07597c` — preview + commit endpoints, idempotent via `award_tokens()` `p_source_id`, UI overlay, audit |
| UI polish — Kanban gaps + SOON badge + column padding (v0.7.1) | ✅ Live `4bf5fe8` — pre-smoke layout bugs fixed |
| Auth path end-to-end | ✅ Verified — JWT → requireAdmin → role check → Discord |
| Vercel env vars | ✅ Done — all 6 vars added, build passed, deployed 01:37 BST |
| **`/admin/mission-control` launchpad** (course repo) | ✅ Live `cb21de9` — easter-egg `weird` link no longer 404s; launchpad opens external MC app |
| **Sprint 4 anon → signup conversion** (course repo) | ✅ Live since **May 19** `a12ecd0` — `lib/anonProgress.ts` + `useProgress.reconcile()` through `claim_level_reward` RPC. **Don't rebuild.** The v2-duplicate files (`useAnonymousProgress`, `migrateAnonProgress`, `ClaimXPModal`) were the trap that we deleted in `c4a9274` to prevent a security regression. |
| **Catch Stragglers wired into MC main panel** | ✅ Live since v0.4.0 (May 23, `ceadad2`) — `stragglers` tile is `enabled: true` in `AgentActions.jsx`, opens overlay via `showStragglers` state. The smoke test that passed at 01:02 BST ran through this wiring. |

---

## 🔴 Genuinely-next priorities (v2 reordering)

| Priority | Task | Notes |
|---|---|---|
| 🔴 1 | **Build Refund** — mirrors Grant Tokens pattern (server `/api/refund/preview` + `/api/refund` + UI overlay + `mc_events` `refund.issued` audit) | New feature. Stripe `Idempotency-Key` header on every refund call + matching `p_source_id` for the token-deduction RPC so retries are safe both sides |
| 🔴 2 | **Pick a host for the Express side of MC + deploy** | Vercel cannot run `server/index.js` as a long-lived process. Vercel currently serves the SPA only — `/api/send-dm`, `/api/grant-tokens`, `/api/health` will 404 in prod. Recommend Render or Fly. Once deployed, set `VITE_MISSION_CONTROL_URL` in the course's Vercel env to point the launchpad at it. |
| 🟡 3 | **Rebuild `ActivityTicker` on `mc_events` realtime** | Drop the current `mc_missions + user_level_progress` proxy stream. Subscribe to `mc_events` directly (publication added in v0.5.0). First real payoff of the spine in the UI. |
| 🟡 4 | **Real signals in Health Pulse + Morning Brief, persisted via `mc_events`** | Currently both run synchronously on operator click and don't persist results. Wire `mc_events.event_type = 'health_pulse.ran' / 'morning_brief.ran'` so trends are queryable. |
| 🟢 5 | **Add scheduler / cron** | Morning Brief + Health Pulse auto-fire daily (Supabase `pg_cron` or a node-cron in `server/index.js`). |
| 🟢 6 | **Delete dead planning artifacts** from course repo | `api/routes/catch_stragglers.py` + `discord-bot/dm_sender.py` + `frontend/components/mission-control/CatchStragglers.jsx` — all dead, all confuse future agents who grep for `catch_stragglers`. |

### 🪤 Items the v1 handover listed that are NOT real to-dos

1. ~~"Wire `CatchStragglers.jsx` into Mission Control main panel"~~ — already wired since v0.4.0 (`ceadad2`, May 23). The Catch Stragglers smoke that PASSED at 01:02 BST ran through this wiring.
2. ~~"`mc_events` event sourcing migration"~~ — migration committed yesterday at `supabase/migrations/20260524000000_mc_events_and_missions_schema_bump.sql` (`9dbd95a`). Applied to Supabase via MCP. v0.6.0 + v0.7.0 already write to it.
3. ~~"Register `catch_stragglers` router in FastAPI `main.py`"~~ — course has NO FastAPI; it's a Vite SPA on Vercel. The catch_stragglers backend lives at `WelshDog-Mission-Control/server/index.js`. See course `CLAUDE.md §0b`.
4. ~~"Sprint 4 verify — `useAnonymousProgress` + `migrateAnonProgress`"~~ — Sprint 4 has been LIVE since May 19 (`a12ecd0`) on a different (RPC-gated) architecture. The named files were the duplicate-v2 trap, deleted in `c4a9274` to prevent a security regression. Asking to "verify" them = asking to verify deleted code.

---

## 🛠️ Stack state

- **MC Server:** `npm run dev:full` on port 3011 — healthy
- **Supabase:** `yhtmuibgdnxhbgboajhc` — migrations up to `20260524000000_mc_events_and_missions_schema_bump.sql`
- **Docker:** 48 containers healthy, broski-bot healthy
- **Vercel (course):** ✅ deployed at `hyper-vibe-coding-course.vercel.app` — the `/admin/mission-control` launchpad lives here
- **Vercel (MC):** ⚠️ SPA deployed but **API endpoints are not running** — Vercel SPA hosting serves `dist/` only; `server/index.js` needs a Node runtime that Vercel only offers as serverless functions (and MC's Express isn't structured as serverless). See priority #2.

---

## ⚠️ Known issues

- `github-sync` container showing `unhealthy` — pre-existing, not blocking
- JWT tokens expire after 1h — use browser console snippet to refresh:
  ```javascript
  JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('auth-token'))[1]).access_token
  ```
- `npm run dev:full` starts two server instances if `node server/index.js` is already running — always use `dev:full` only
- **`/api/*` on Vercel will 404 until we pick a Node host (Render / Fly) for the Express server** — see priority #2 above. Local `:3011` is fine; prod is not.

---

## 🔴 Sacred rules (never break)

- Never `supabase db push` — use `apply_migration` only
- `DISCORD_BOT_TOKEN` in `.env.local` only — never commit
- `git fetch` before push — auto-commits running
- Commit + push = done. Nothing is done until it's in GitHub.

---

*Session: May 24–25 2026 | Built by Lyndz + Perplexity BROski♾️*
