# 🤖 BROski Agent Rules — Mission Control

> Auto-detected by Hyper IDE + TRAE. These rules apply to ALL agents working in this workspace.

## 🏗️ Project Context

- Stack: React + Vite + Tailwind CSS + Supabase + JavaScript
- Deploy targets: Vercel (frontend), Render (backend/server), Railway (optional)
- Auth: Supabase Auth
- Database: Supabase PostgreSQL
- Payments: Stripe (webhook is RATE-LIMIT EXEMPT — never rate-limit `/api/webhook`)

## ⚡ Sacred Rules (NEVER Break)

- `.env` files are NEVER committed to git — use `.env.example` for templates
- Stripe webhook endpoint (`/api/webhook`) is ALWAYS rate-limit exempt
- Python indent = 4 spaces, NEVER 3, NEVER mixed
- Redis DB 1 = cache, DB 2 = rate limits — NEVER mix
- Frontend dev command = `npm run dev:frontend` (NOT `npm run dev`)
- Import style: `from app.X import Y` — NEVER `from backend.app.X`

## 🎨 Code Style

- JavaScript/React: functional components, hooks only — no class components
- Tailwind: utility-first, mobile-first responsive design
- Component files: PascalCase (`MissionPanel.jsx`)
- Utility files: camelCase (`formatDate.js`)
- Constants: UPPER_SNAKE_CASE
- CSS: Tailwind classes only — no custom CSS unless absolutely necessary

## 🗂️ File Structure

```
src/
  components/    ← reusable UI components
  pages/         ← route-level page components
  hooks/         ← custom React hooks
  lib/           ← utility functions, API clients
  store/         ← state management
server/          ← Express/Node backend
supabase/        ← DB migrations, edge functions
docs/            ← specs, reports, architecture
.hyper/          ← agent config, rules, sandbox policy
```

## 🔐 Security Rules

- Never log API keys, tokens, or secrets — not even partial values
- All environment variables via `.env` — check `.env.example` for required keys
- Supabase RLS (Row Level Security) must be enabled on all user-facing tables
- API routes must validate auth before any DB operation

## 🧠 Neurodivergent-Friendly UX (Always Apply)

- Labels before inputs — never placeholder-only forms
- Error messages: plain language, actionable ("Try again" not "Error 422")
- Loading states on every async action
- No surprise modal interrupts — use toast/banner notifications
- Keyboard navigable — all interactive elements must be focusable

## 🚫 Agent Don'ts

- Never suggest anything already in `WHATS_DONE.md`
- Never run `rm -rf` without explicit user confirmation
- Never commit directly to `main` without a PR unless explicitly told to
- Never expose `.env` contents in responses or logs
