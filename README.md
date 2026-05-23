# 🧠 Mission Control

> Course-ops dashboard for the **Vibe Coding Course**.
> Watch all. Do all. Behind the scenes.

[![Status: v0.3](https://img.shields.io/badge/Status-v0.3-blue?style=for-the-badge)](#status)
[![Stack: Supabase + Agents](https://img.shields.io/badge/Stack-Supabase%20%2B%20Agents-purple?style=for-the-badge)](#stack)

---

## 🎯 What this is

A **closed-loop ops brain** for the Vibe Coding Course. Not a passive admin
panel — Mission Control:

1. **Watches** every signal that matters (live via Supabase Realtime)
2. **Detects** drift / stuck students / quiet days
3. **Auto-creates Mission cards** on the Kanban when signals trip
4. You drag through `DETECTED → INVESTIGATING → FIXING → SHIPPED`
5. Card auto-archives when it lands in `shipped`

> *Mission Control was originally vibe-inspired by the WelshDog Designs
> admin UI, but it runs entirely on the course's own data — no shop
> coupling.*

## 🛠️ Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind + framer-motion + lucide-react | Premium feel, fast iteration |
| Backend | None yet — direct Supabase from the client | Less to break |
| DB + Auth | **Supabase** (the course project) | Same project as Hyper-Vibe-Coding-Course; admins log straight in |
| Realtime | **Supabase Realtime** (`postgres_changes`) | DB events arrive without polling |
| DnD | `@hello-pangea/dnd` | Maintained `react-beautiful-dnd` fork |
| Hosting | TBD — likely Vercel like the course | (Pi + NGINX still on the table for later) |

## 🚀 Quick start

```bash
git clone https://github.com/welshDog/WelshDog-Mission-Control.git
cd WelshDog-Mission-Control
npm install
cp .env.example .env.local       # fill in VITE_SUPABASE_ANON_KEY + your admin email
npm run dev                       # http://localhost:5174
```

Then apply the migration (via Supabase MCP `apply_migration` against the
course project — **NEVER `supabase db push`**):
`supabase/migrations/20260523130000_create_mc_missions_table.sql`

## 🤖 Agent Actions

The "do behind the scenes" panel. Each button triggers a real admin action.

| Button | Status | What it does |
|---|---|---|
| 🩺 **Health Pulse** | ✅ live | Scans course signals (stuck students, quiet days), auto-creates Mission cards |
| ☀️ **Morning Brief** | ✅ live | 60-second summary of the last 24h |
| 🤖 **Catch Stragglers** | soon | Idle-student finder + DM drafter (you approve before send) |
| 🎁 **Grant Tokens** | soon | Modal → `award_tokens()` with audit row |
| 🔁 **Refund** | soon | Stripe + token refund in one click (reversible, server-enforced) |
| 🧹 **Drift Scan** | soon | Re-run the quiz true/false-positional scan |

**ADHD pacing: one new button per commit.** Each ships a real working thing.

## 📦 Status

| Commit | What landed |
|---|---|
| `0659767` | bootstrap — auth-gated shell + live top bar |
| `fbd8cd2` | v0.2.0 — Kanban + planner + ticker (shop-coupled, superseded) |
| **`v0.3.0`** | pivot to course-ops — Missions Kanban + Agent Actions panel (2 live) |
| upcoming | one Agent Action per commit · Supabase TOTP MFA hardening · health pill heartbeat |

## 🔐 Sacred rules

- `.env*` files **never** committed (`.gitignore` blocks them).
- Apply DB migrations via Supabase MCP `apply_migration` — **NEVER `supabase db push`**.
- `mc_missions` is RLS-locked to `authenticated`; harden to admin-only via `is_admin()` in the next commit.
- Allowlist is empty by default → fail closed.

---

*🐶♾️ Built by [@welshDog](https://github.com/welshDog) — Stop apologising for your brain. Start building.*
