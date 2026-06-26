# 🧠 Mission Control

> Course-ops dashboard for the **Vibe Coding Course**.
> Watch all. Do all. Behind the scenes. Audit everything.

[![Status: v0.9.0](https://img.shields.io/badge/Status-v0.9.0-brightgreen?style=for-the-badge)](#status)
[![Stack: Supabase + Express + React](https://img.shields.io/badge/Stack-Supabase%20%2B%20Express%20%2B%20React-purple?style=for-the-badge)](#stack)

---

## 🎯 What this is

A **closed-loop ops brain** for the Vibe Coding Course. Not a passive admin panel — Mission Control:

1. **Watches** every signal that matters (live via Supabase Realtime)
2. **Detects** drift / stuck students / quiet days
3. **Auto-creates Mission cards** on the Kanban when signals trip
4. You drag through `DETECTED → INVESTIGATING → FIXING → SHIPPED`
5. **Audits every action** to an append-only `mc_events` log (actor + payload + ts)
6. **Streams it all live** in the right-sidebar activity ticker

> The Live Activity ticker reads the same `mc_events` rows the audit trail uses — what you see is what's actually true.

## 🛠️ Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind + framer-motion + lucide-react | Premium feel, fast iteration |
| Backend | **Express** (`server/index.js`) — tiny ops API | Holds `DISCORD_BOT_TOKEN` + `STRIPE_SECRET_KEY` + `SUPABASE_SERVICE_ROLE_KEY` server-side, away from the browser |
| DB + Auth | **Supabase** (project `yhtmuibgdnxhbgboajhc`) | Same project as `Hyper-Vibe-Coding-Course` — admins log straight in |
| Audit spine | **`mc_events`** — append-only, immutability-triggered | Powers the activity feed + queryable history; service-role-only writes |
| Realtime | **Supabase Realtime** (`postgres_changes`) | DB events arrive without polling |
| DnD | `@hello-pangea/dnd` | Maintained `react-beautiful-dnd` fork |
| Hosting (SPA) | Vercel | Same as the course |
| Hosting (API) | Render (blueprint shipped — `render.yaml`) | Vercel can't run a long-lived Node process |

## 🚀 Quick start

```bash
git clone https://github.com/welshDog/WelshDog-Mission-Control.git
cd WelshDog-Mission-Control
npm install
cp .env.example .env.local        # then fill in the secrets — see .env.example
npm run dev:full                   # Vite :5174 + Express :3011 side by side
```

Required env vars (see `.env.example` for the full list with rationale):

| Var | What | Where used |
|---|---|---|
| `VITE_SUPABASE_URL` | Course Supabase URL | Client (SPA login + reads) |
| `VITE_SUPABASE_ANON_KEY` | Course Supabase anon key | Client |
| `VITE_ADMIN_ALLOWLIST` | Comma-separated admin emails | Client AdminAuth gate |
| `SUPABASE_URL` | Same as VITE_ — Express uses it too | Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — bypasses RLS for audit writes | Server only — never expose |
| `DISCORD_BOT_TOKEN` (or `DISCORD_TOKEN`) | Catch Stragglers DM delivery | Server only |
| `STRIPE_SECRET_KEY` | Refund Stripe charges | Server only |
| `MAX_GRANT_PER_CALL` | Grant Tokens hard cap (default 10000) | Server |

Then apply the migrations (via Supabase MCP `apply_migration` against project `yhtmuibgdnxhbgboajhc` — **NEVER `supabase db push`**):

```
supabase/migrations/20260523130000_create_mc_missions_table.sql
supabase/migrations/20260524000000_mc_events_and_missions_schema_bump.sql
```

## 🤖 Agent Actions

The "do behind the scenes" panel. 6/6 live end-to-end.

| Button | Status | What it does |
|---|---|---|
| 🩺 **Health Pulse** | ✅ live | Scans course signals (stuck students, quiet days) → auto-creates Mission cards |
| ☀️ **Morning Brief** | ✅ live | 60-second summary of the last 24h |
| 🤖 **Catch Stragglers** | ✅ live (v0.4.0) | Idle-student finder + tone-tagged DM drafter (you approve before send). Smoke-tested 2026-05-25. |
| 🎁 **Grant Tokens** | ✅ live (v0.7.0) | Pick user + amount + reason → `award_tokens()` RPC + audit. Idempotent. |
| 🔁 **Refund** | ✅ live (v0.8.0) | Stripe charge refund + matching BROski$ deduction in one click. Both sides idempotent (Stripe `Idempotency-Key` + `spend_tokens()` `p_source_id`). |
| 🧹 **Drift Scan** | ✅ live (v0.11.0) | Re-runs the quiz true/false positional scan over `hv_quizzes` (validates `answer_index` ∈ {0,1} + cross-checks explanation text). Flags mismatches as an `mc_missions` card. Verified live 2026-06-15. |

**ADHD pacing:** one new button per commit. Each ships a real working thing.

## 🛡️ Auth + audit model

Every protected endpoint runs `requireAdmin` middleware (v0.6.0):

1. Pulls `Authorization: Bearer <jwt>` from the request
2. Verifies the JWT via `supabase.auth.getUser(token)`
3. Looks up `users.role` and rejects with `403` if not `admin`
4. Attaches `req.user = { id, email }` so handlers stamp the verified actor into `mc_events.actor` — no "trust the client payload" surface

Every mutation writes:
- An `mc_missions` Kanban card (operator-visible state)
- An immutable `mc_events` row (queryable history with structured payload)

The two are deliberately separate: state vs history. `mc_events` cannot be UPDATEd or DELETEd (DB triggers block it for every role, including service_role); corrections happen by INSERTing a new event with a `*.corrected` type.

## 🚀 Production deploy

The SPA + API split (Vercel can't run a long-lived Node process):

1. **SPA → Vercel** — standard Vite build, already wired
2. **API → Render** — use the included `render.yaml` blueprint:
   - Render dashboard → New → Blueprint → connect this repo → `main`
   - Set the 5 secrets in the Render dashboard (`sync: false` so they stay out of git)
   - First deploy ~3 min, then `curl https://<your-svc>.onrender.com/api/health` → `{"ok":true,...}`
3. **Wire SPA ↔ API** — two options (documented at the top of `render.yaml`):
   - **A (recommended)**: Vercel `rewrites` in `vercel.json` → no client code changes
   - **B**: `VITE_MC_API_URL` env + prefix every `fetch('/api/...')` call

## 📦 Status

| Version | Highlights |
|---|---|
| `v0.9.0` (this commit) | ActivityTicker rebuilt on `mc_events` realtime — spine pays off in the UI |
| `v0.8.0` | Refund (Stripe + token deduction, idempotent both sides) |
| `v0.7.1` | UI polish — pipeline columns + SOON badge + Kanban header spacing |
| `v0.7.0` | Grant Tokens (preview + commit + idempotency via `award_tokens()`) |
| `v0.6.0` | `requireAdmin` JWT middleware + `emitEvent()` helper + first `mc_events` consumer |
| `v0.5.0` | `mc_events` spine migration (append-only, immutability triggers, realtime) + `mc_missions` `owner` + `priority` |
| `v0.4.0` | Catch Stragglers full-panel overlay + read-phase + Express `/api/send-dm` |
| `v0.3.0` | Pivot to course-ops — Missions Kanban + Agent Actions |

## 🔐 Sacred rules

- `.env*` files **never** committed (`.gitignore` blocks them).
- `DISCORD_BOT_TOKEN`, `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are **server-only** — never prefixed `VITE_`.
- Apply DB migrations via Supabase MCP `apply_migration` — **NEVER `supabase db push`**.
- `mc_events` is append-only — corrections by INSERT, never UPDATE/DELETE (triggers enforce this even for service_role).
- `mc_missions` is RLS-locked to `authenticated`; the AdminAuth allowlist gates the app client-side as defence in depth.
- Stripe refunds **always** include an `Idempotency-Key` header. Matching `p_source_id` feeds `spend_tokens()` so retries are safe both sides.
- `git fetch` before every push — parallel auto-commits run out-of-band.

---

*🐶♾️ Built by [@welshDog](https://github.com/welshDog) — Stop apologising for your brain. Start building.*
