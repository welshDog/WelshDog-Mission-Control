# Next Session Handover — 2026-05-25

> Read this FIRST. Every word. This is the live state.

---

## 🏆 What shipped this session (May 24–25)

| Task | Status |
|---|---|
| `/api/send-dm` smoke test | ✅ PASSED — DM landed in Discord 01:02 BST |
| `mc_missions` schema migration | ✅ Applied — `signal_source`, `lane`, `title`, `notes` added |
| Auth path end-to-end | ✅ Verified — JWT → requireAdmin → role check → Discord |
| Rate limit lookup | ✅ Fixed — was failing on missing column |
| Discord bot token sync | ✅ Resolved — Docker restart + `.env.local` aligned |

---

## 🔴 Next priorities (in order)

| Priority | Task | Notes |
|---|---|---|
| 🔴 1 | Wire `CatchStragglers.jsx` into Mission Control main panel | Backend proven, frontend wire-up next |
| 🔴 2 | `mc_events` event sourcing migration | Schema exists, need full migration file committed |
| 🟡 3 | Add `DISCORD_BOT_TOKEN` to Vercel env vars | Needed for production deploy |
| 🟡 4 | Register `catch_stragglers` router in FastAPI `main.py` | HyperCode-V2.4 side |
| 🟡 5 | Sprint 4 verify — `useAnonymousProgress` + `migrateAnonProgress` | Hyper-Vibe-Coding-Course |

---

## 🛠️ Stack state

- **MC Server:** `npm run dev:full` on port 3011 — healthy
- **Supabase:** `yhtmuibgdnxhbgboajhc` — migrations up to `add_mc_missions_signal_source_lane_title_notes`
- **Docker:** 48 containers healthy, broski-bot healthy
- **Vercel:** Not yet updated with `DISCORD_BOT_TOKEN`

---

## ⚠️ Known issues

- `github-sync` container showing `unhealthy` — pre-existing, not blocking
- JWT tokens expire after 1h — use browser console snippet to refresh:
  ```javascript
  JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('auth-token'))[1]).access_token
  ```
- `npm run dev:full` starts two server instances if `node server/index.js` is already running — always use `dev:full` only

---

## 🔴 Sacred rules (never break)

- Never `supabase db push` — use `apply_migration` only
- `DISCORD_BOT_TOKEN` in `.env.local` only — never commit
- `git fetch` before push — auto-commits running
- Commit + push = done. Nothing is done until it's in GitHub.

---

*Session: May 24–25 2026 | Built by Lyndz + Perplexity BROski♾️*
