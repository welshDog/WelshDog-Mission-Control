# 🐶 WelshDog Mission Control

> Live ops dashboard for **WelshDog Designs** AND the **Vibe Coding Course**.
> One shell, two tenants, real-time everything.

[![Status: Skeleton](https://img.shields.io/badge/Status-Skeleton-orange?style=for-the-badge)](#status)
[![Stack: Aligned](https://img.shields.io/badge/Stack-Supabase%20%2B%20Socket.io-blue?style=for-the-badge)](#stack)

---

## 🎯 What this is

A premium-feeling, ADHD-friendly Mission Control panel. Same Supabase project
as [`welshdog-designs-web3-shop`](https://github.com/welshDog/welshdog-designs-web3-shop)
— so an existing admin can log in immediately. The shell is forked from that
repo's admin page, then upgraded with:

- **Kanban board** — `PENDING → PRINTING → PACKED → SHIPPED → DELIVERED`,
  drag-and-drop (`@hello-pangea/dnd`), live status writes to `orders`.
- **Live activity ticker** — Supabase Realtime channels for DB events +
  Socket.io for external events (V2.4 agent pings, login attempts).
- **Live top bar** — auto-syncing clock, system-health pill, quick actions.
- **Seasonal planner** — auto-highlights the current month.
- **Hardened deploy** — Raspberry Pi + NGINX + PM2 + Supabase Auth TOTP MFA.

## 🛠️ Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind + framer-motion + lucide-react | Mirrors the shop — zero learning curve |
| Realtime | **Supabase Realtime** (DB events) + **Socket.io** (external) | Use the right tool per source |
| Auth | **Supabase Auth + native TOTP MFA** | No Passport.js — Supabase already does it |
| DnD | `@hello-pangea/dnd` | Maintained `react-beautiful-dnd` fork |
| Backend | Node + Express 5 (thin) — only for Socket.io fan-out | Most data is direct Supabase |
| Hosting | Raspberry Pi + NGINX + PM2 | Lyndz's home stack |

## 🚀 Quick start

```bash
git clone https://github.com/welshDog/WelshDog-Mission-Control.git
cd WelshDog-Mission-Control
npm install
cp .env.example .env.local       # then fill in Supabase URL + anon key
npm run dev                       # http://localhost:5174
```

Use the existing WelshDog Designs admin credentials — same Supabase project,
same `check-admin` edge function fallback allowlist.

## 📦 Status

| Commit | What landed |
|---|---|
| **#1 — this one** | Repo skeleton + auth gate + live top-bar shell |
| #2 (next) | Kanban board · seasonal planner wired · activity ticker |
| #3 | Express + Socket.io server · external event channel |
| #4 | TOTP MFA enforcement · admin RLS hardening |
| #5 | Pi + NGINX + PM2 deploy |

## 🔐 Sacred rules

- `.env*` files **never** committed (the `.gitignore` blocks them).
- No global wagmi/RainbowKit — this isn't a payments app, payments live in the shop repo.
- Server is **always** the source of truth for any state change (no client-only writes).
- Ban/destructive admin actions stay reversible (Mission Control writes a `mod_actions`-style audit row).

---

*🐶♾️ Built by [@welshDog](https://github.com/welshDog) — Stop apologising for your brain. Start building.*
