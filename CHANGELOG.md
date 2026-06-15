# Changelog

All notable changes to **WelshDog Mission Control** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semver](https://semver.org/).

## [0.11.0] — 2026-06-15

### Added — **Drift Scan (6/6 Agent Actions live)**

Closes the final SOON tile. 6/6 Agent Actions are now live in Mission Control.

- `runDriftScan()` added to `src/lib/supabase.js` — fetches all `hv_quizzes` rows, walks every `true_false` question, checks `answer_index` is 0 or 1, and cross-checks explanation text agrees with the index (`"False" → 1`, `"True" → 0`). Creates an `mc_missions` card (`mission_type: 'drift_scan'`, `signal_source: 'drift_scan:true_false_mismatch'`) if any issues are found.
- `AgentActions.jsx` — Drift Scan tile flipped from `enabled: false` to `enabled: true`; result modal renders `totalModules / totalTrueFalse` header + per-issue list (module code, question ID, prompt, issue label) or green "All clear" banner.
- `server/index.js` `/api/activity` whitelist — `drift` kind already mapped to `'drift.completed'` event.
- **Verified live 2026-06-15:** 11 modules · 11 true/false questions scanned → "All clear — no answer_index drift detected". `drift.completed` events confirmed in Activity Ticker (09:13 PM, 06:57 PM, 06:55 PM).

## [0.10.4] — 2026-06-14

### Added — **Prometheus counters for Discord DM observability**
Closes the "Discord DM Observability" gap flagged in the 2026-06-13 ecosystem
audit (LIVE-MATRIX was 🔴 MISSING — now 🟢 LIVE).

- `prom-client ^15.1.3` added as a production dependency.
- Two counters wired into `POST /api/send-dm`:
  - `dm_send_attempt_total` — increments after the 24h rate-limit check passes
    (i.e. only on genuine delivery attempts, not blocked retries).
  - `dm_send_failure_total` — increments on 502 (Discord failed + no email
    fallback available).
- `GET /metrics` scrape endpoint added (unauthenticated; exposes the two DM
  counters plus prom-client default process metrics). Prometheus can scrape this
  directly from within the network.
- **E2E smoke test completed 2026-06-14:** `{ success: true, channel: "discord",
  messageId: "1515509899868766238" }` — DM delivered to Discord, `mc_missions`
  audit card written, `mc_events` `straggler.dm_sent` row written, rate limit
  enforced, `requireAdmin` JWT check passed.

## [0.10.3] — 2026-06-08

### Added — **`commit` field on `GET /api/health`**
Server-internal changes (e.g. the 0.10.2 `mission_type` fixes) had no
externally observable deploy signal — the MC API has no `/api/version`. Health
now returns `commit` (Render's injected `RENDER_GIT_COMMIT`, falling back to
`GIT_COMMIT`, then `'dev'` locally) so any build can be verified from outside.

## [0.10.2] — 2026-06-07

### Fixed — **Remaining `mc_missions.mission_type` NOT-NULL inserts (audit cards)**
Closes the follow-up flagged in 0.10.1. The same `mission_type` NOT-NULL bug
silently broke every server-side audit-card insert (the `mc_events` rows still
landed, so the actions "worked" but no Kanban card appeared). All now set a
semantic `mission_type`:

- `server/index.js` — **send-dm** → `'straggler'`, **grant-tokens** →
  `'grant_tokens'`, **refund** → `'refund'`.
- `src/lib/supabase.js` — **`snoozeStraggler`** → `'straggler'`.

Verified with a transactional dry-run covering all three server shapes
(including `lane: 'investigating'` + `priority: 'p0'` on the refund failure
path). CHANGELOG line 107's "every protected mutation writes mc_missions" is
now actually true again.

## [0.10.1] — 2026-06-07

### Fixed — **Health Pulse schema errors (mc_missions + user_level_progress)**
Running Health Pulse threw two schema errors, both from the live DB having
drifted from the repo's assumptions (verified against `yhtmuibgdnxhbgboajhc`):

- **`mc_missions.mission_type` NOT-NULL violation.** The column is `NOT NULL`
  with no default, but `createMission` never set it — so *every* insert
  silently failed (the table was empty). A prior session had labelled
  `mission_type`/`user_id`/`status`/`metadata` "phantom columns from a dead
  course branch" and ignored them; they're actually live. `createMission` now
  takes a `mission_type` (default `'manual'`); Health Pulse passes
  `'health_pulse'`. Verified with a transactional dry-run insert.
- **`user_level_progress.level` does not exist.** Nor does `completed_at`. The
  table is one row per student (`completed_levels int[]`, `xp`, `badges`,
  `updated_at`). The "stuck students" query now uses real columns and detects
  *no progress update in >7 days* via `updated_at`. Verified against live data.

> ⚠️ Same latent `mission_type` NOT-NULL bug still affects the **server-side**
> `mc_missions` audit inserts (grant / refund / send-dm) and `snoozeStraggler`
> — their Kanban cards have been silently failing too. Tracked for a follow-up.

## [0.10.0] — 2026-06-07

### Added — **Health Pulse + Morning Brief emit `mc_events`**
The last two Agent Actions that didn't feed the audit spine now do. Both
run client-side (read-only queries via the anon client), but `mc_events`
INSERT is **service-role-only** by design — so the browser can't write its
own audit row. A new thin endpoint bridges that safely.

- **`POST /api/activity`** (`requireAdmin`) — maps `kind: 'pulse' | 'brief'`
  to an `event_type` from a **server-side whitelist** (the client never
  sends a raw `event_type`, so a compromised session can't inject arbitrary
  audit types), stamps the **verified actor** (`req.user.email`), coerces the
  `summary` to bounded non-negative integers, and emits via the shared
  service-role `emitEvent` helper.
- **`recordActivity(kind, summary)`** (`src/lib/supabase.js`) — best-effort
  client helper; attaches the session bearer and never throws (a failed
  audit log must not break an action the operator already saw succeed).
- **`AgentActions`** fires `recordActivity` after Health Pulse / Morning
  Brief complete: `pulse.completed` (`{ createdCount, scanned, skipped }`)
  and `brief.completed` (`{ rowCount, skipped }`).
- **`ActivityTicker`** gains renderers for both (`Stethoscope` / `Sunrise`),
  and `health_pulse:` joins `AGENT_ACTION_PREFIXES` so the per-card mission
  INSERTs Health Pulse creates no longer double-appear next to the summary
  line (Morning Brief creates no card, so it needs no prefix).

## [0.9.1] — 2026-06-07

### Removed — **dead `zustand` dependency**
`zustand@^4.4.0` was declared in `package.json` but never imported
anywhere in the MC source — the server is Express and the frontend
uses React Context / hooks, with no zustand store. Removed it to slim
the dependency tree (no runtime or build impact; nothing referenced it).

> Context: the 2026-06-07 morning handover listed a "Zustand
> default-export deprecation" fix "across the frontend codebase." That
> task does **not** apply to MC — MC had no zustand usage at all, and
> every real zustand store elsewhere in the ecosystem (Course, V2.4
> dashboard) already uses the named `import { create } from 'zustand'`
> form. Nothing to migrate; the only MC action was deleting the unused dep.

## [0.9.0] — 2026-05-25

### Changed — **ActivityTicker rebuilt on `mc_events` realtime (v2)**
The v0.5.0 spine finally pays off in the UI. The ticker stops
proxying state-table mutations and reads the actual audit log
directly. Result: rich actor attribution, structured payload-aware
summaries, and queryable history (same rows the audit trail uses).

- **Primary stream — `mc_events`:**
  - Initial load: `SELECT id, event_type, actor, payload, created_at
    FROM mc_events ORDER BY created_at DESC LIMIT 50`. Empty-state
    distinguished from loading-state.
  - Realtime: INSERT subscription on the publication added in v0.5.0.
    New rows prepend, dedup by `id` on echo.
  - Per-event-type renderer with custom icon + accent + summary
    pulled from structured payload:
    - `straggler.dm_sent` → MessageSquare + cyan, "DM via {channel} → {email}"
    - `tokens.granted` → Coins + emerald, "+{amount} BROski$ → {email}"
    - `tokens.grant_skipped_duplicate` → Coins + amber, "Grant skipped (idempotent)"
    - `refund.issued` → Undo2 + rose, "Refund {Intl-formatted amount} → {email}"
    - `refund.failed` → AlertTriangle + rose
    - `refund.token_deduction_failed` → ShieldAlert + amber
    - Unknown event_types → Radio + raw type name (so future events
      appear instantly, just unstyled — no code change needed to
      surface a new event_type, only to style it)
  - Each row carries a `title` attribute exposing the full event_type
    + actor + ISO timestamp on hover (the structured detail without
    cluttering the line).

- **Fallback stream — `mc_missions`:**
  - Three sources still don't emit `mc_events` rows: manual creation
    (+ New button), drag-and-drop lane changes, Health Pulse /
    Morning Brief auto-cards. We keep the mc_missions INSERT +
    UPDATE + DELETE subscriptions for those.
  - DEDUP: mc_missions INSERTs whose `signal_source` starts with
    `catch_stragglers:` / `grant_tokens:` / `refund:` are SKIPPED —
    the matching mc_events row will render with richer detail.
    Extend `AGENT_ACTION_PREFIXES` when handover priority #4 lands
    Pulse + Brief event emission.

- **Dropped from v1:**
  - `user_level_progress` subscription — student-side noise that
    belongs on a per-student dashboard, not the ops feed.

- **Preserved from v1:**
  - `window.__mcExternalEventPush({ type, text })` — Socket.io /
    external-channel events pipe in unchanged, render with Sparkles
    + fuchsia.

- **UX touches:**
  - Bumped `MAX_EVENTS` 20 → 50 (the initial load already populates
    that much, no reason to truncate sooner).
  - Actor email shortened to local-part in the line (`· lyndzwills`),
    full email shown in the hover title. Keeps the row tight.
  - Loading state vs empty state distinguished so the operator knows
    "still fetching" vs "really nothing has happened".

### Files touched
- `src/components/mission/ActivityTicker.jsx` (full rewrite, ~270 LOC,
  was 113 LOC — extra weight is event-type rendering + dedup logic)

No server / schema / auth changes. mc_events realtime publication
was already live since v0.5.0.

## [0.8.0] — 2026-05-25

### Added — **Refund, live end-to-end (mirrors Grant Tokens v0.7.0)**
Fifth Agent Action shipped. Stripe charge refund + matching BROski$
deduction in one operator click. Both sides idempotent — Stripe
`Idempotency-Key` header AND `spend_tokens()` `p_source_id` use the
same UUID per editing session, so double-clicks / retries are safe
both ways.

- **Two-step server flow:**
  - `POST /api/refund/preview` (admin-only) — Stripe `GET /payment_intents/:id` +
    `GET /refunds?payment_intent=...` (already-refunded check) +
    `token_transactions` lookup (the row that awarded tokens for this
    PI) + user balance. Returns `{ paymentIntent, refundedAmount,
    refundable, tokensAwarded, user, canRefund, blocker }`.
  - `POST /api/refund` (admin-only) — re-runs the preview checks
    server-side (don't trust client state), then Stripe refund FIRST
    (real money first, with `Idempotency-Key`), then `spend_tokens()`
    with matching `p_source_id`.

- **Raw Stripe REST — no SDK** (no new deps). Helper `stripeFetch()`
  handles HTTP-Basic auth + form-encoded bodies + `Idempotency-Key`
  header. Three Stripe endpoints called: `GET /payment_intents/:id`,
  `GET /refunds?payment_intent=...`, `POST /refunds`.

- **Pre-flight balance check** at preview AND re-checked at commit:
  if `users.broski_tokens < tokensAwarded`, the UI's `canRefund`
  flag goes false with a `blocker` string, and the server returns
  `400 insufficient_balance_for_refund` if the operator somehow
  bypasses the UI. Avoids the "Stripe refunded, tokens couldn't be
  deducted" partial-failure trap on the common case.

- **Partial-failure handling** for the rare case where pre-flight
  passes but `spend_tokens()` still fails (e.g. balance changed in
  the TOCTOU window): server emits `refund.token_deduction_failed`
  event, writes an `investigating`-lane (NOT `shipped`) mc_missions
  card with priority `p0`, returns `success: true` + `awarded: false`
  + the spend_tokens error message. UI surfaces this clearly in the
  success card with amber styling so the operator knows to reconcile
  manually. The user still has their cash back; the token shortfall
  is logged forever in `mc_events`.

- **Audit pattern (same as v0.7.0 Grant Tokens):**
  - `mc_missions` shipped-lane card (or `investigating` for the
    partial-failure case). Owner stamped from JWT actor, priority
    based on refund amount (`p1` for ≥ $50, `p2` otherwise, `p0`
    for the partial-failure mission).
  - `mc_events` row — `refund.issued` (clean) /
    `refund.failed` (Stripe-side abort) /
    `refund.token_deduction_failed` (Stripe ok, tokens not). All
    rows carry the structured payload (paymentIntentId, refundId,
    refundedAmount, currency, tokensDeducted, newBalance, userId,
    email, idempotencyKey, sourceId).

- **No token_transactions row found** = abort with
  `404 no_token_award_found`. The server REFUSES to refund a Stripe
  charge that has no corresponding token award — too easy to leave
  the user with cash back AND tokens that were never associated
  with the original purchase. The operator can still refund manually
  via the Stripe dashboard for these edge cases.

- **UI — `src/components/mission/Refund.jsx`** (~325 LOC):
  - Two-step overlay: paste `pi_*` → **Preview refund** (verify) →
    **Refund $X.XX** (commit). Live `pi_*` format check on input.
  - Preview shows: recipient, Stripe amount + status, already-
    refunded amount + count, tokens originally awarded, current
    balance, projected after-refund balance.
  - Confirm button disabled with tooltip when `!canRefund` — the
    server-supplied `blocker` string surfaces as a red banner.
  - Success state distinguishes clean refund (emerald) from
    token-deduction-failed (amber + `ShieldAlert` + the
    spend_tokens error inline).
  - Esc-to-close disabled while a refund is in flight (real money
    involved, never silently abort on a stray keystroke).
  - `Intl.NumberFormat` for currency display (locale-aware symbol
    + decimal placement), falls back to `<amount> <CURRENCY>` if
    Intl rejects the currency code.

- **Wiring:** AgentActions Refund tile flipped to `enabled: true`.
  Live count `4/6 → 5/6`. Only `Drift Scan` remains as the
  `enabled: false` tile.

- **Env var added** (required for `/api/refund`):
  - `STRIPE_SECRET_KEY` — same key the course's `stripe-webhook`
    edge function uses. Server-only (no VITE_ prefix). Without it,
    `/api/refund` returns `500 stripe_not_configured` and the boot
    log surfaces ⚠️ `STRIPE_SECRET_KEY missing — /api/refund will 500`.

### What this unblocks / what's next
- All five Agent Actions are now end-to-end functional. Only
  `Drift Scan` remains (re-runs the quiz true/false positional scan
  from the May 18 fix; small in scope, but defer until we have a
  drift signal to scan against).
- **ActivityTicker v2** — three `mc_events` event types now flowing
  in production (`straggler.dm_sent`, `tokens.granted`,
  `refund.issued`) — enough variety to make a real Live Activity
  feed meaningful. Next obvious commit.
- **Vercel-Express deploy** — every Agent Action now writes audit
  rows that need the server to be live for prod use. Picks up
  pressure on choosing Render / Fly for the Express side (see
  May 25 handover priority #2).

### Sacred rules honoured
- ✅ Stripe `Idempotency-Key` on every refund POST (the only safe
  way to handle network retries against money-moving APIs).
- ✅ `STRIPE_SECRET_KEY` is server-only — no `VITE_` prefix; never
  reaches the browser.
- ✅ `mc_events` writes still service-role-only; immutability
  triggers from v0.5.0 cover this table.
- ✅ JWT middleware + `requireAdmin` reused unchanged.
- ✅ All env-only secrets remain so — no new VITE_* exposure.

## [0.7.1] — 2026-05-24

### Fixed — three layout bugs caught in pre-smoke review
Pre-smoke visual review of the v0.7.0 operator deck flagged three
cramped spots. None were functional, but all made the page read as
"compressed" rather than "deliberate":

- **MissionsKanban header row** — `0 missions` count + "New" / "Sync"
  buttons were running flush against each other (and visually
  bleeding into the column headers below on narrow viewports). Added
  `gap-x-4 gap-y-2` flex spacing + `mr-1` on the count text + bumped
  the row's `mb-4 → mb-5` so it owns its own breathing zone above
  the columns.
- **Pipeline columns cramped** — `gap-4` between the four lanes was
  too tight; bumped to `gap-5 md:gap-6` (and column interior padding
  `p-3 → p-4`). Column header gained `gap-3 pb-2 mb-1 border-b
  border-white/5` so the label + count are visually separated AND
  there's a subtle divider before the cards. Label is now
  `min-w-0 truncate` and icon/count are `shrink-0` so DETECTED /
  INVESTIGATING / FIXING / SHIPPED never overflow into the count.
- **`SOOND` badge bleed (SOON badge running into the next tile)** —
  AgentActions tiles had inconsistent heights, so the SOON badge on
  disabled tiles floated to wherever the desc text ended (and on
  short-desc tiles it visually touched the neighbour). Tiles are now
  `flex flex-col h-full min-h-[128px]` and SOON uses `mt-auto pt-2
  inline-block self-start` — pinned to the bottom-left of every
  tile, equal-height across the row. Icons gained `shrink-0` and
  the label gained `truncate` so no element can spill horizontally.

### Files touched
- `src/components/mission/MissionsKanban.jsx`
- `src/components/mission/AgentActions.jsx`

No server / schema / auth changes. v0.7.0 functionality identical
under the hood.

## [0.7.0] — 2026-05-24

### Added — **Grant Tokens, live end-to-end**
Fourth Agent Action shipped. Uses the existing `award_tokens()` RPC in
the course Supabase (SECURITY DEFINER, idempotent via the
`(user_id, reason, source_id)` partial unique constraint on
`token_transactions`) — no reinvention, no new DB primitives. The
v0.6.0 JWT middleware + v0.5.0 mc_events spine made this safe to
ship.

- **Two-step server flow (deliberate, prevents finger-trouble):**
  - `POST /api/grant-tokens/preview` (admin-only) — verify the
    userId resolves to a real user; returns `{ email, fullName,
    currentBalance, maxGrantPerCall }`. Read-only, no audit row.
  - `POST /api/grant-tokens` (admin-only) — calls `award_tokens()`,
    emits `mc_events`, writes `mc_missions` Kanban card. Returns
    `{ awarded, newBalance, email, fullName, idempotencyKey }`.

- **Validation hardened on the server:**
  - `userId` must match RFC-4122 v4 UUID regex
  - `amount` must be positive integer ≤ `MAX_GRANT_PER_CALL`
    (env-overrideable, default **10,000 BROski$**)
  - `reason` must be ≥ 3 chars after trim — required for audit
  - All four error shapes machine-readable for clean UI handling

- **Idempotency baked in:**
  - Client generates a stable UUID per editing session (re-used on
    retries; new on Reset / Grant another)
  - Server passes `mc-grant-<uuid>` as `p_source_id` into the RPC
  - Double-click / retry / network flake = `awarded: false` no-op,
    not a duplicate grant. UI distinguishes "Tokens granted" from
    "Already granted (idempotent no-op)"

- **Audit pattern matches Catch Stragglers (v0.6.0):**
  - `mc_missions` shipped-lane card (skipped on idempotent no-op so
    the operator doesn't see phantom cards)
  - `mc_events` row ALWAYS emitted, with `event_type` distinguishing
    `tokens.granted` vs `tokens.grant_skipped_duplicate` — the
    operator's INTENT to grant is itself audit-worthy
  - Mission row's `owner` + `priority` columns from v0.5.0 are
    stamped (priority `p1` for grants ≥1000, `p2` otherwise)
  - All actor stamps come from the verified JWT, never from the
    client payload

- **UI — `src/components/mission/GrantTokens.jsx`** (new, ~260 LOC):
  - Two-step overlay: fill form → **Preview user** (verify) → **Grant**
  - Live UUID validity check on the userId input
  - Per-call cap surfaced from the server preview
  - "After grant" projected balance shown once amount is entered
  - Success state shows recipient + new balance + "Grant another" /
    "Done" actions
  - Error surface distinguishes 401 (session expired), 403 (not
    admin), `user_not_found`, `amount_exceeds_cap`, etc.
  - Esc-to-close disabled while a grant is in flight (so a stray
    keystroke can't lose a half-finished grant)

- **Wiring:** AgentActions' "Grant Tokens" tile flipped to
  `enabled: true`. Live count `3/6 → 4/6`. Clicking opens the
  overlay (same pattern as Catch Stragglers).

- **Env var added** (optional, with sensible default):
  - `MAX_GRANT_PER_CALL` — int, default 10000. Documented in
    `.env.example` placeholder.

### What this unblocks / what's next
- **Refund** — symmetric to Grant: same auth + audit + idempotency
  pattern, plus Stripe idempotency keys for the cash-side refund.
- **Daily-aggregate cap on grants** — once we have a few days of
  audit data in `mc_events`, decide a sensible threshold and add a
  server-side rolling-window check.
- **User search picker** — currently the operator pastes a UUID;
  could add a search-by-email step once we know the operator flow.

### Sacred rules honoured
- ✅ `award_tokens()` is the existing course RPC — no schema changes,
  no new primitives, no duplication of token plumbing.
- ✅ JWT middleware + service_role pattern from v0.6.0 reused
  unchanged.
- ✅ `mc_events` writes still service-role-only; the immutability
  triggers from v0.5.0 still cover this table.
- ✅ All env-only secrets remain so — no new VITE_* exposure.

## [0.6.0] — 2026-05-24

### Added — **Server-side admin JWT auth + first `mc_events` consumer**
Closes the security gap surfaced earlier today and turns on the v0.5.0
spine for real. Every protected endpoint now requires a verified
admin JWT, and every protected mutation writes an immutable
`mc_events` row stamped with the verified actor.

- **`requireAdmin` Express middleware (`server/index.js`)**
  - Pulls `Authorization: Bearer <jwt>` from the request.
  - Verifies the JWT via `supabase.auth.getUser(token)` — the
    service-role client does the signature + expiry check using the
    project's JWT secret.
  - Looks up `users.role` and rejects with **403** if the caller
    isn't an admin (defence in depth on top of the AdminAuth client
    allowlist).
  - On success, attaches `req.user = { id, email }` so handlers stamp
    the verified actor — no more "trust the client payload" surface.
  - Error shapes: `401 missing_bearer_token` / `401 invalid_token` /
    `403 forbidden_not_admin` / `500 role_lookup_failed`.

- **`/api/send-dm` is the first protected route**
  - Was: CORS-only gate, anyone in the allowlist could send DMs.
  - Now: `requireAdmin` runs first; unauthed callers can't even
    enumerate the rate-limit endpoint, let alone send a message.

- **`emitEvent()` helper** — single entry point for every `mc_events`
  insert. Defaults `actor` to `req.user.email`, supports `'system'`
  for autonomous events (cron / webhooks later). Errors are logged
  but never thrown — the audit row failing must never fail the
  user-facing action that already succeeded.

- **`/api/send-dm` now emits a `straggler.dm_sent` event** to
  `mc_events` (in addition to the existing `mc_missions` Kanban row).
  Structured `payload` — `{ userId, channel, tone, discordMessageId,
  discordError, messageLength }` — so future "show me every DM I
  sent in May" queries hit the gin index instead of LIKE-scanning
  `notes`. Mission row's new `owner` column is also stamped now that
  the schema bump from v0.5.0 supports it.

- **Client side (`src/lib/supabase.js` + `CatchStragglers.jsx`)**
  - `sendStragglerDM` fetches `supabase.auth.getSession()` and attaches
    `Authorization: Bearer <access_token>` on every call. Synthetic
    `401 no_session` returned if there's no session (matches server
    error shape so the UI renders one error path).
  - `CatchStragglers` row error surface now distinguishes 401
    (session expired — sign out + back in), 403 (not admin — server
    blocked it), and 429 / generic. Clearer than "HTTP 401".

### Fixed — **server boot crash from earlier replace_all sloppiness**
`server/index.js` line 28 had `const DISCORD_BOT_TOKEN =
DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN` — a TDZ self-
reference my `replace_all: true` introduced when I renamed
`process.env.DISCORD_BOT_TOKEN` → `DISCORD_BOT_TOKEN` in v0.4.x.
Would have thrown `ReferenceError: Cannot access 'DISCORD_BOT_TOKEN'
before initialization` on first boot. Caught on read before any
smoke test had to surface it. Now correctly reads
`process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN`.
**Lesson noted for future: `replace_all` near a `const` declaration
is dangerous; always verify the declaration line by hand.**

### What this unblocks
- **Grant Tokens** — `/api/grant-tokens` can now ship without a real
  security surface: the JWT proves the caller, the audit row proves
  the action, the immutability triggers prove the history is real.
- **Refund** — same pattern + Stripe idempotency keys baked into
  `payload`.
- **Live Activity v2** — `mc_events` is now actively being written to,
  so swapping `ActivityTicker` over to subscribe from there yields a
  real stream of human actions, not a poll of state-table mutations.

### Sacred rules honoured
- ✅ `DISCORD_BOT_TOKEN` + `SUPABASE_SERVICE_ROLE_KEY` remain env-only;
  no new client-exposed env vars.
- ✅ `mc_events` writes still go through service_role (server only);
  the no-INSERT-policy hardening from v0.5.0 is preserved.
- ✅ Idempotent boot — server still starts even with missing env so
  `/api/health` works for diagnostics; protected routes return 500s
  cleanly until env is set.

## [0.5.0] — 2026-05-24

### Added — **`mc_events` spine + `mc_missions` schema bump**
The single highest-leverage move on the Mission Control roadmap.
`mc_missions` was doubling as state + history (signal_source carrying
userIds as a workaround). Splitting the two unlocks: a real Live
Activity feed, audit trails for every Agent Action, actor attribution,
and event-source replay.

- **Migration:** `supabase/migrations/20260524000000_mc_events_and_missions_schema_bump.sql`.
  Applied via Supabase MCP `apply_migration` against the Vibe Coding
  Course project (`yhtmuibgdnxhbgboajhc`). Verified on apply — all 6
  invariants returned true (table exists · 2 columns added to
  mc_missions · 4 custom indexes · 2 immutability triggers · RLS on ·
  realtime publication).

- **New table `public.mc_events`** — append-only event log:
  - Columns: `id uuid pk` · `mission_id uuid → mc_missions(id) ON DELETE SET NULL` ·
    `event_type text` · `actor text` · `payload jsonb` · `created_at timestamptz`.
    Deleting a mission preserves its history (FK nulls, doesn't cascade).
  - **Immutability triggers** block UPDATE + DELETE for every role
    (including service_role). Corrections are made by INSERTing a new
    event (e.g. `event_type = '*.corrected'`). TRUNCATE remains
    available for explicit ops resets.
  - Indexes for the four real query patterns:
    `(created_at DESC)` activity feed · `(mission_id, created_at DESC)`
    mission detail drawer · `(event_type, created_at DESC)` filter ·
    `GIN(payload)` for future `WHERE payload->>'user_id' = ?` queries.
  - **Realtime publication** added → Live Activity feed gets free
    streaming via supabase-js realtime.

- **Security tightening over the naive design:**
  - `mc_events` RLS enabled. **SELECT** policy for `authenticated`
    (defence in depth — AdminAuth allowlist gates the app already).
    **No INSERT policy at all.** Only `service_role` (the MC Express
    server) writes events; service_role bypasses RLS, so the absence
    of an INSERT policy is the security control. A compromised
    browser session cannot inject fake audit lines like
    `{actor: 'lyndzwills@gmail.com', event_type: 'tokens.granted', payload: {amount: 1_000_000}}`.

- **`mc_missions` columns added (both nullable, existing rows survive):**
  - `owner text` — free-form for now (email-shaped); may become
    `uuid → users.id` once mission-ownership UX firms up.
  - `priority text` — constrained by CHECK to `p0` / `p1` / `p2` /
    `p3` so the Kanban can colour-code rows reliably.
  - Partial indexes on both — only index rows where the column is set
    so the index stays small and pre-existing un-owned/un-prioritised
    rows don't consume space.

### What this unblocks (next commits)
- Live Activity feed v2 — `SELECT FROM mc_events ORDER BY created_at DESC LIMIT 50` + realtime subscribe; replaces the current mc_missions+user_level_progress proxy stream.
- Grant Tokens + Refund — each Agent Action emits a `tokens.granted` / `refund.issued` event with full audit detail, actor stamped from the JWT.
- Catch Stragglers audit upgrade — supplement the current `mc_missions` shipped-lane row with a structured `straggler.dm_sent` event (channel, tone, message hash, discord_message_id all queryable via `payload`).
- Missions Board owner/priority chips — UI work only, schema is now ready.

### Sacred rules honoured
- ✅ Applied via Supabase MCP `apply_migration` — never `supabase db push`.
- ✅ Migration is fully idempotent (`IF NOT EXISTS`, `DO $$ ... END $$` guards on constraints + publication adds, `OR REPLACE` on the trigger function).
- ✅ `DISCORD_BOT_TOKEN` + `SUPABASE_SERVICE_ROLE_KEY` remain env-only; no new client-exposed env vars in this commit.

## [0.4.0] — 2026-05-23

### Added — **Catch Stragglers, live end-to-end**
Third Agent Action shipped. The "one button per commit" cadence continues —
this one is rich enough to need its own panel, so we ship a full-screen
overlay plus a tiny Express service for the Discord delivery leg.

- **`server/index.js`** — first Express route lands: `POST /api/send-dm`.
  Opens a Discord DM channel via the bot REST API (`DISCORD_BOT_TOKEN`
  stays server-only) + sends the message. Falls back to `channel:
  email_logged` if `discord_id` is missing. 24h-per-user rate limit
  enforced via `mc_missions` (signal_source `catch_stragglers:dm_sent:<userId>`).
  Discord 429s are surfaced with `retryAfter` so the UI can backoff.
  Every send writes a shipped-lane audit row to `mc_missions` (full
  message + tone + channel in `notes`, visible on the Kanban). Service
  role key is used server-only to bypass RLS for that insert. Adds
  `GET /api/health` for diagnostics. CORS locked to `API_CORS_ORIGINS`.
- **`vite.config.js`** — dev proxy `/api/*` → `http://localhost:${API_PORT|3011}`
  so the SPA hits `/api/send-dm` with no separate base URL (mirrors
  the prod reverse-proxy pattern). Pair with `npm run dev:full`.
- **`src/components/mission/CatchStragglers.jsx`** — full-screen glass
  overlay. Esc-to-close, backdrop-click-to-close. Scan button hits
  `fetchStragglerDrafts()`; per-row tone picker (warm / curious /
  terse), editable textarea, snooze 24h, skip, send. Bulk "Approve all"
  for hyperfocus pacing. Row-level error surface for rate-limit /
  delivery failures (clears on tone change). Empty/loading/no-channel
  states all explicit.
- **`src/lib/supabase.js`** —
  - `fetchStragglerDrafts({ idleDays, limit })`: probes `user_xp` for
    idle students, decorates with `users` + `lesson_progress`, returns
    `{ drafts, total, skipped }` with three tone-tagged DM variants
    pre-baked per student. Defensive — each probe failure becomes a
    `skipped` string, never a crash.
  - `snoozeStraggler(userId)`: writes a `catch_stragglers:snoozed:<id>`
    audit row (UI-local list filtering — we don't auto-filter on the
    next scan; that would make the operator's mental model wobble).
  - `sendStragglerDM(payload)`: thin POST wrapper over `/api/send-dm`.
- **`src/components/mission/AgentActions.jsx`** — Catch Stragglers tile
  flipped to `enabled: true`; live count updated from `2 / 6` to
  `3 / 6`. Clicking the tile opens the overlay (the inline result
  modal handles the lighter Pulse/Brief actions).
- **`.env.example`** — `API_PORT`, `API_CORS_ORIGINS`, `DISCORD_BOT_TOKEN`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` documented with their why.

### Sacred-rules honoured
- `DISCORD_BOT_TOKEN` + `SUPABASE_SERVICE_KEY`: env-only, no `VITE_`
  prefix → never reachable from the browser.
- Schema source of truth is **MC's** `mc_missions` migration. The
  course repo's dead `api/routes/catch_stragglers.py` wrote to phantom
  columns (`mission_type`, `user_id`, `status`, `metadata`) — ignored
  on purpose; we didn't revive that dead branch.
- Course Python files were **not** touched.

### Known follow-ups (not blockers)
- `tests/setup.js` referenced by `vite.config.js` doesn't exist yet —
  unit tests for Catch Stragglers land when the setup is bootstrapped.
- Email fallback channel currently logs only (`email_logged`); real
  send wires when SMTP is picked.
- `MissionControl.jsx:119` has a pre-existing `react/no-unescaped-entities`
  lint warning (`don't` → `don&apos;t`). Unrelated to this commit.

## [0.3.0] — 2026-05-23

### Changed — **pivot to course-ops, drop the shop entirely**
The shop was vibe-only inspiration. Mission Control's actual domain is the
**Vibe Coding Course** — "watch all, do all, behind the scenes." This commit
strips every shop assumption and rewires onto the course's own data.

### Added
- **`src/components/mission/MissionsKanban.jsx`** — replaces `OrdersKanban`.
  4 lanes (`detected → investigating → fixing → shipped`) bound to
  `public.mc_missions`. Cards auto-archive (`resolved_at` stamped by a
  trigger) when they hit `shipped`; un-stamped if pulled back out.
- **`src/components/mission/AgentActions.jsx`** — six "do behind the
  scenes" buttons. Two LIVE end-to-end:
  - 🩺 **Health Pulse** — scans `user_level_progress` for stuck students
    (>7d idle, no completion); also drops a heartbeat card on quiet days
    so the loop is always provable.
  - ☀️ **Morning Brief** — last-24h aggregate (missions detected, missions
    shipped, level progress events). Defensive: missing tables surface as
    "skipped" rather than crashing.
  - Four scaffolded: Catch Stragglers · Grant Tokens · Refund · Drift Scan.
    **One per commit** from here.
- **Migration:** `supabase/migrations/20260523130000_create_mc_missions_table.sql`
  — idempotent: creates `public.mc_missions` + lane CHECK + indexes +
  auto-`updated_at`/`resolved_at` trigger + adds to `supabase_realtime` +
  RLS to `authenticated`. Apply via Supabase MCP `apply_migration` against
  the course project (`yhtmuibgdnxhbgboajhc`).
- **`src/components/mission/ActivityTicker.jsx`** — now streams
  `mc_missions.*` + `user_level_progress.UPDATE`. Skips missing tables
  gracefully. `window.__mcExternalEventPush` hook preserved for the
  Socket.io external channel (later commit).

### Removed
- `src/components/AdminCalendar.jsx` + `src/lib/seasonalEvents.js` — the
  seasonal planner is shop-marketing, not course-ops. Cut.
- `src/components/mission/OrdersKanban.jsx` — superseded by MissionsKanban.
- `supabase/migrations/20260523120000_add_mission_control_fulfillment_status.sql`
  — that was the shop migration; the course doesn't need a
  `fulfillment_status` column.
- All shop helpers in `src/lib/supabase.js` (orders / products / drops /
  demo_bookings). Only mission helpers + agent actions remain.
- `src/components/admin/AdminAuth.jsx` no longer calls the shop's
  `check-admin` edge function. New flow: Supabase Auth +
  `VITE_ADMIN_ALLOWLIST` (comma-separated, fail-closed). Hardening with
  Supabase TOTP MFA + an `is_admin()` RPC lands in the next commit.

### Apply
- Set `VITE_SUPABASE_URL` to the course project (`yhtmuibgdnxhbgboajhc`).
- Set `VITE_ADMIN_ALLOWLIST` to your admin email(s).
- Apply the migration via Supabase MCP.

## [0.2.0] — 2026-05-23

### Added — Kanban + planner + live activity ticker
- **`OrdersKanban`** — `@hello-pangea/dnd` board with 5 lanes
  (`pending → printing → packed → shipped → delivered`) bound to
  `orders.fulfillment_status`. Optimistic drag-and-drop persists via
  `updateFulfillmentStatus`. Subscribes to Supabase Realtime
  (`postgres_changes` on `orders`) so cards move when other clients update.
- **`AdminCalendar`** + `lib/seasonalEvents.js` — copied verbatim from the
  shop. Renders the current month with auto-highlight of today, dot markers
  for fixed + dynamic seasonal events (Easter, Black Friday, Cyber Monday,
  St. David's Day, Christmas chain), and the next 5 upcoming highlights.
- **`ActivityTicker`** — last 20 events from Supabase Realtime
  (`orders.*` + `demo_bookings.INSERT`). Window hook
  (`window.__mcExternalEventPush`) reserved for the Socket.io external
  channel arriving in commit #3.
- **Migration:** `supabase/migrations/20260523120000_add_mission_control_fulfillment_status.sql`
  — idempotently adds the `fulfillment_status` column, a CHECK constraint,
  an index, and adds `orders` + `demo_bookings` to the Realtime publication.

### Changed
- `MissionControl.jsx`: replaced the three placeholders with the real
  components. Top-bar shell + live clock unchanged.

### Apply
- Run the migration via Supabase MCP `apply_migration` against the
  WelshDog Designs Supabase project. **Sacred rule:** NEVER `supabase db push`
  for this repo (history desynced with the shop's local migration set).

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
