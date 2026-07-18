# 🧠 Mission Control

> Course-ops dashboard for the **Vibe Coding Course**.
> Watch all. Do all. Behind the scenes. Audit everything.

[![Status: v0.12.0](https://img.shields.io/badge/Status-v0.12.0-brightgreen?style=for-the-badge)](#status)
[![Stack: Supabase + Express + React](https://img.shields.io/badge/Stack-Supabase%20%2B%20Express%20%2B%20React-purple?style=for-the-badge)](#stack)

---

## 🔴 ACTION REQUIRED — database migration pending

The original Supabase project **`yhtmuibgdnxhbgboajhc` was DELETED**. Everything server-side is
down until MC is repointed: login, Kanban, activity ticker, Grant Tokens, Refund, Catch Stragglers.

`mc_missions` + `mc_events` **rows are gone and not recoverable.** The *schema* is fine — both
migrations live in `supabase/migrations/` and rebuild in two `apply_migration` calls.

**Fix (see [Recovery runbook](#-recovery-runbook)):** repoint at the **Hyper Vibe Coding Course**
project. MC was always designed to share it — that's why every table is `mc_`-prefixed.

> `EcosystemHealth` still works — it reads a static JSON file and makes no Supabase call.
> The "is everything OK?" panel must never depend on the thing that might not be OK.

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
| DB + Auth | **Supabase** — Course project `tlavrxiaegbtyfmjfdcz` ⚠️ *(old `yhtmuibgdnxhbgboajhc` DELETED)* | Shares the `Hyper-Vibe-Coding-Course` project — admins log straight in. MC owns no project of its own; it lives there behind the `mc_` table prefix |
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

Then apply the migrations (via Supabase MCP `apply_migration` against the **Course** project `tlavrxiaegbtyfmjfdcz` — **NEVER `supabase db push`**, it reports "up to date" while doing nothing):

```
supabase/migrations/20260523130000_create_mc_missions_table.sql
supabase/migrations/20260524000000_mc_events_and_missions_schema_bump.sql
```

## 🧯 Recovery runbook

Follow this once, in order, after the `yhtmuibgdnxhbgboajhc` deletion.

1. **Get the Course project ref** from the Supabase dashboard (Project Settings → General).
2. **Replace `tlavrxiaegbtyfmjfdcz`** everywhere in this README and in `WHATS_DONE.md`.
3. **Local env** — update `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
4. **Production env — don't skip this.** Prod stays broken until both are updated:
   - **Render** (Express API) → the 5 secrets
   - **Vercel** (SPA) → the `VITE_*` vars, then redeploy
5. **Re-apply both migrations** via MCP `apply_migration` against the Course project.
6. **Confirm your admin row exists** in the new project — `requireAdmin` reads `users.role = 'admin'`. No row, no access, and the error surfaces as a `403`, not a helpful message.
7. **Smoke test in order:** log in → Kanban renders → create a manual mission → run Health Pulse → check the ticker shows the event.
8. `curl https://<render-svc>.onrender.com/api/health` → `{"ok":true,...}`

**What you will NOT get back:** every `mc_missions` card and `mc_events` audit row from before the deletion. Immutability triggers protect rows from edits — not from the project being deleted. The schema rebuilds; the history doesn't.

## 🗄️ Database policy — one project per *audience*, not per *app*

Supabase projects are capped (funds). The ecosystem runs on three:

| Project | Audience | Holds |
|---|---|---|
| `jnrkrnzeqeupjumkvobz` | Shop customers | `Hyperfocus-Home-Page` / welshdog.shop — 46 products, music social, blog |
| `tlavrxiaegbtyfmjfdcz` | Students + admin ops | `Hyper-Vibe-Coding-Course` **+ Mission Control (`mc_` prefix)** |
| `lmwrfiqmnfuqtocilawd` | Players | `SUPERPOWER-ARCADE` |

**A new app does not get a new project.** It joins an existing one behind a table prefix, exactly as MC does with `mc_`. This is why MC survives as a design even though it owns no database.

Because the Course project now holds student data *and* the ops spine, keep the `mc_` tables service-role-write-only (no INSERT policy) as built — a compromised student session must not be able to write ops rows.

## 🌐 Ecosystem Health (v0.12.0)

The "see all, know all" panel. Answers one question — **what needs me right now?**

Reads `public/ecosystem-map.json`, generated at the HperCore root by `scripts/gen_repo_map.py` — the same file that generates `AGENT-START.md` §2. Boot file and dashboard read identical bytes, so they cannot disagree.

```bash
npm run sync:ecosystem              # regenerate at root + copy into public/
npm run sync:ecosystem -- --copy-only
```

Set `HYPERCORE_ROOT` if the workspace isn't at `H:\HYPERFOCUSZONE\HperCore`.

**Triage rules** (`src/lib/ecosystem.js`):

| Signal | Level |
|---|---|
| `LIVE` repo untouched > 30d | 🔴 risk — people depend on it |
| `BUILDING` repo quiet > 21d | 🟠 warn — drifting |
| No `.hyperfocus.yml` | 🟠 warn — invisible to the generated map |
| Not a git repo / no commits | 🟠 warn |
| `PARKED` / `RETIRED` | ⚫ **muted — never scored, hidden by default** |

**The design rule that matters:** 26 repos × 5 metrics = 130 numbers = a panel you open once and never again. So: **one number at the top, then only what's red.** Everything healthy collapses to a single line. `PARKED` is frozen on purpose and must never generate visual guilt — that's the whole reason the tier exists.

Deliberately makes **no Supabase call**. The "is everything OK?" panel must not depend on the thing that might not be OK — proven when the DB was deleted and this panel kept working.

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
| `v0.12.0` (this commit) | **Ecosystem Health panel** — 26-repo triage from `ecosystem-map.json`, tier-aware, no Supabase dependency |
| `v0.11.0` | Drift Scan — 6th Agent Action, quiz positional scan over `hv_quizzes` |
| `v0.10.4` | Catch Stragglers Prometheus counters + `GET /metrics` |
| `v0.9.0` | ActivityTicker rebuilt on `mc_events` realtime — spine pays off in the UI |
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
- **One Supabase project per _audience_, not per _app_.** MC owns no project — it lives in the Course project behind the `mc_` prefix. New features get a prefix, not a project.
- **Ecosystem Health must never call Supabase.** The panel that reports whether things are OK cannot depend on a service that might be down.

---

*🐶♾️ Built by [@welshDog](https://github.com/welshDog) — Stop apologising for your brain. Start building.*
