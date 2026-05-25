# WHATS_DONE — Mission Control

> Single source of truth. Never suggest rebuilding anything listed here.

---

## v0.6.0 — May 25, 2026

### ✅ /api/send-dm — SMOKE TEST PASSED
- Auth path: `requireAdmin` middleware wired + verified
- Rate-limit lookup: `mc_missions.signal_source` column added via migration
- Discord DM delivery: end-to-end confirmed — message landed in Discord at 01:02 BST May 25
- DB migration applied: `add_mc_missions_signal_source_lane_title_notes`
  - Added: `signal_source TEXT`, `lane TEXT DEFAULT 'todo'`, `title TEXT`, `notes TEXT`
  - Index: `idx_mc_missions_signal_source` on `mc_missions(signal_source)`
- Admin role confirmed: `users.role = 'admin'` for `63df5bcb-9c5a-4b7b-992d-3e3e7b3295d9`

### ✅ Server stack
- `server/index.js` — single ops API on port 3011
- Endpoints live: `GET /api/health`, `POST /api/send-dm`, `POST /api/grant-tokens/preview`, `POST /api/grant-tokens`
- CORS locked to `http://localhost:5174`
- Rate limit: 1 DM per user per 24h via `mc_missions` signal_source lookup
- Audit: `mc_missions` (Kanban card) + `mc_events` (immutable detail) on every DM
- `npm run dev:full` = correct way to run (vite + server concurrently)

### ✅ Supabase project
- Project ID: `yhtmuibgdnxhbgboajhc`
- Tables confirmed: `users`, `mc_missions`, `mc_events`
- `mc_missions` columns: `id`, `created_at`, `mission_type`, `trigger_source`, `user_id`, `status`, `metadata`, `owner`, `priority`, `signal_source`, `lane`, `title`, `notes`

### ✅ Docker stack (HyperCode-V2.4)
- 48 containers healthy
- `broski-bot` running on Discord profile — healthy
- NemoClaw alive L1-3.5
- Weekly digest posting confirmed in Discord

---

## Do NOT rebuild
- `requireAdmin` middleware — done
- `mc_missions` migration — applied, columns exist
- Discord DM path — proven end-to-end
- `mc_events` audit pattern — wired
- `/api/grant-tokens` — built and live
