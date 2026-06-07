// supabase.js — Mission Control's data layer.
//
// Points at the **Vibe Coding Course** Supabase project (NOT the shop).
// Everything below is course-ops scoped: missions Kanban, course signals,
// agent action endpoints.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.error('⚠️ Supabase credentials missing — set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env.local')
}

export const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '')

// =====================================================================
// MISSIONS (the Kanban) — table: public.mc_missions
// Schema lives in supabase/migrations/20260523130000_*.sql
// =====================================================================

export const fetchMissions = async (limit = 200) => {
  const { data, error } = await supabase
    .from('mc_missions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('fetchMissions failed:', error)
    return []
  }
  return data || []
}

// `mission_type` is NOT NULL on mc_missions (live schema — it was once
// mistakenly treated as a "phantom column" and left unset, which silently
// failed every insert). Defaults to 'manual' for the +New button; callers
// like Health Pulse pass their own category.
export const createMission = async ({ title, signal_source = 'manual', notes = null, lane = 'detected', mission_type = 'manual' }) => {
  const { data, error } = await supabase
    .from('mc_missions')
    .insert([{ title, signal_source, notes, lane, mission_type }])
    .select()
  if (error) {
    console.error('createMission failed:', error)
    throw error
  }
  return data?.[0] || null
}

export const updateMissionLane = async (id, lane) => {
  const { data, error } = await supabase
    .from('mc_missions')
    .update({ lane })       // resolved_at is auto-stamped by the trigger
    .eq('id', id)
    .select()
  if (error) {
    console.error('updateMissionLane failed:', error)
    throw error
  }
  return data?.[0] || null
}

export const deleteMission = async (id) => {
  const { error } = await supabase.from('mc_missions').delete().eq('id', id)
  if (error) {
    console.error('deleteMission failed:', error)
    throw error
  }
  return true
}

// =====================================================================
// AGENT ACTIONS — the "do behind the scenes" buttons.
// Each action is defensive: it tries each course signal, skips on schema
// mismatch, and reports which signals fired vs which were unavailable.
// Real signal queries land per-commit as Lyndz confirms course tables.
// =====================================================================

// 🩺 Health Pulse — scans for stuck students + flags drift signals.
// Returns: { createdCount, scanned, skipped }
export const runHealthPulse = async () => {
  const scanned = []
  const skipped = []
  let createdCount = 0

  // --- Signal: students stuck >7d on a level (probes user_level_progress).
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    // "Stuck" = no progress update in >7 days. user_level_progress is one
    // row per student (completed_levels int[] + xp + badges + updated_at) —
    // there is NO per-level row and NO completed_at column, so idle-by-
    // updated_at is the real signal on this schema.
    const { data, error } = await supabase
      .from('user_level_progress')
      .select('user_id, completed_levels, updated_at')
      .lt('updated_at', sevenDaysAgo)
      .limit(50)
    if (error) throw error
    scanned.push('user_level_progress')
    if (data && data.length > 0) {
      await createMission({
        title: `${data.length} student${data.length === 1 ? '' : 's'} with no progress in >7 days`,
        signal_source: 'health_pulse:stuck_students',
        mission_type: 'health_pulse',
        notes: `Found ${data.length} user_level_progress row${data.length === 1 ? '' : 's'} whose updated_at is older than 7 days (no level/xp progress).`,
      })
      createdCount += 1
    }
  } catch (e) {
    skipped.push(`user_level_progress (${e?.message || 'query failed'})`)
  }

  // --- Signal: zero-mission days. If no missions in 24h AND no completions, drop a "quiet" card.
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('mc_missions')
      .select('id')
      .gt('created_at', yesterday)
      .limit(1)
    scanned.push('mc_missions(activity)')
    // Intentionally noisy — proves the loop end-to-end even on a quiet day.
    if (!data || data.length === 0) {
      await createMission({
        title: `Health Pulse · ${new Date().toLocaleString()}`,
        signal_source: 'health_pulse:heartbeat',
        mission_type: 'health_pulse',
        notes: 'Quiet day — no new signals tripped. This heartbeat card confirms the pulse ran.',
      })
      createdCount += 1
    }
  } catch (e) {
    skipped.push(`mc_missions (${e?.message || 'query failed'})`)
  }

  return { createdCount, scanned, skipped }
}

// 🎯 Catch Stragglers — read+draft phase. Fetch idle students from
// `user_xp`, decorate with profile + last-completed lesson, hand back
// three tone-tagged DM variants per student so the operator can pick.
//
// Read-only against course tables. The actual DM SEND lives in
// server/index.js (POST /api/send-dm) so DISCORD_BOT_TOKEN stays out of
// the browser. Returns { drafts, total, skipped } — `skipped` carries
// any per-signal probe errors so the UI can render a clean diagnostic.
const dmVariants = (name, stuckModule) => [
  {
    tone: 'warm',
    text: `Hey ${name} 👋 We noticed you haven't been around lately. Totally get it — life gets busy! Whenever you're ready, ${stuckModule} is waiting for you. No rush. 🐶♾️`,
  },
  {
    tone: 'curious',
    text: `Hey ${name} — just checking in! Got stuck on ${stuckModule}? Drop a message and we'll help you unstick. You're closer than you think. 🚀`,
  },
  {
    tone: 'terse',
    text: `Hey ${name}. Still there? ${stuckModule} is ready when you are. 💪`,
  },
]

export const fetchStragglerDrafts = async ({ idleDays = 7, limit = 20 } = {}) => {
  const skipped = []
  const cutoff = new Date(Date.now() - idleDays * 24 * 60 * 60 * 1000).toISOString()

  // 1. Idle students (last_active older than cutoff).
  const { data: idle, error: idleErr } = await supabase
    .from('user_xp')
    .select('user_id, level, total_xp, last_active')
    .lt('last_active', cutoff)
    .order('last_active', { ascending: true })
    .limit(limit)
  if (idleErr) {
    return { drafts: [], total: 0, skipped: [`user_xp (${idleErr.message})`] }
  }
  if (!idle || idle.length === 0) return { drafts: [], total: 0, skipped }

  const userIds = idle.map((r) => r.user_id)

  // 2. Profile decoration. Defensive — a missing `users` row just means
  //    we fall back to "Student" / no discordId.
  const profileMap = new Map()
  try {
    const { data: profiles, error } = await supabase
      .from('users')
      .select('id, full_name, email, discord_id')
      .in('id', userIds)
    if (error) throw error
    for (const p of profiles || []) profileMap.set(p.id, p)
  } catch (e) {
    skipped.push(`users (${e?.message || 'profile probe failed'})`)
  }

  // 3. Last completed lesson per user (for the "stuck on" hint).
  const lastLessonMap = new Map()
  try {
    const { data: progress, error } = await supabase
      .from('lesson_progress')
      .select('user_id, lesson_id, completed_at')
      .in('user_id', userIds)
      .eq('completed', true)
      .order('completed_at', { ascending: false })
    if (error) throw error
    for (const row of progress || []) {
      if (!lastLessonMap.has(row.user_id)) lastLessonMap.set(row.user_id, row.lesson_id)
    }
  } catch (e) {
    skipped.push(`lesson_progress (${e?.message || 'progress probe failed'})`)
  }

  const drafts = idle.map((row) => {
    const profile = profileMap.get(row.user_id) || {}
    const name = profile.full_name || 'Student'
    const stuckModule = lastLessonMap.get(row.user_id) || 'their last module'
    const lastActive = row.last_active || null

    let daysIdle = '?'
    if (lastActive) {
      const ms = Date.now() - new Date(lastActive).getTime()
      if (!Number.isNaN(ms)) daysIdle = Math.max(0, Math.floor(ms / 86400000))
    }

    return {
      userId: row.user_id,
      name,
      email: profile.email || '',
      discordId: profile.discord_id || null,
      level: row.level ?? 1,
      totalXp: row.total_xp ?? 0,
      lastActive,
      daysIdle,
      stuckModule,
      dmVariants: dmVariants(name, stuckModule),
    }
  })

  return { drafts, total: drafts.length, skipped }
}

// 🎯 Catch Stragglers — snooze. Logs an audit row so the Kanban can see
// "Lyndz parked this one" without blocking re-fetching. UI handles the
// per-session skip; we don't auto-filter on next scan (that would make
// the scan behaviour surprising).
export const snoozeStraggler = async (userId, hours = 24) => {
  const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from('mc_missions').insert([
    {
      title: `Straggler snoozed · ${userId.slice(0, 8)}…`,
      signal_source: `catch_stragglers:snoozed:${userId}`,
      mission_type: 'straggler',
      lane: 'detected',
      notes: `Snoozed until ${until} by operator (24h cool-down on the UI list).`,
    },
  ])
  if (error) {
    console.error('snoozeStraggler audit insert failed:', error)
    throw error
  }
  return { ok: true, until }
}

// 🎯 Catch Stragglers — send a DM via the MC API (server/index.js).
// As of v0.6.0 the server requires an admin JWT — we attach the
// caller's Supabase session token as a Bearer header. If there's no
// session we fail fast with a synthetic 401 (matches the server's
// shape so the UI can render the same error path).
//
// Returns the server's response shape directly so the UI can branch on
// rate-limit / 401 / 403 / no-channel without re-parsing.
export const sendStragglerDM = async ({ userId, discordId, email, message, tone }) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { status: 401, success: false, userId, error: 'no_session' }
  }
  const res = await fetch('/api/send-dm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ userId, discordId, email, message, tone }),
  })
  const payload = await res.json().catch(() => ({}))
  return { status: res.status, ...payload }
}

// 💰 Grant Tokens — preview. Looks up the target user so the operator
// can confirm name + email + current balance before committing the
// grant. Read-only; no audit row (a preview that never grants
// shouldn't pollute the audit log).
export const previewGrantTokens = async ({ userId }) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { status: 401, success: false, error: 'no_session' }
  }
  const res = await fetch('/api/grant-tokens/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ userId }),
  })
  const payload = await res.json().catch(() => ({}))
  return { status: res.status, ...payload }
}

// 💰 Grant Tokens — commit. Calls the existing award_tokens() RPC via
// the server (server holds the service-role key + stamps the verified
// actor into mc_events). idempotencyKey is optional — server generates
// one if absent, but supplying a stable one from the UI lets retries
// be safe (RPC dedups on (user_id, reason, source_id)).
export const grantTokens = async ({ userId, amount, reason, idempotencyKey }) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { status: 401, success: false, error: 'no_session' }
  }
  const res = await fetch('/api/grant-tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ userId, amount, reason, idempotencyKey }),
  })
  const payload = await res.json().catch(() => ({}))
  return { status: res.status, ...payload }
}

// 💸 Refund — preview. Looks up the Stripe payment_intent + the
// token_transactions row that originally awarded BROski$ for it, plus
// the user's current balance. Returns canRefund + blocker so the UI
// can decide whether to enable Confirm.
export const previewRefund = async ({ paymentIntentId }) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { status: 401, success: false, error: 'no_session' }
  }
  const res = await fetch('/api/refund/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ paymentIntentId }),
  })
  const payload = await res.json().catch(() => ({}))
  return { status: res.status, ...payload }
}

// 💸 Refund — commit. Runs Stripe refund (with Idempotency-Key) +
// spend_tokens() deduction (matching p_source_id). Stable client-side
// UUID per editing session → safe retries on both sides.
export const runRefund = async ({ paymentIntentId, idempotencyKey }) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { status: 401, success: false, error: 'no_session' }
  }
  const res = await fetch('/api/refund', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ paymentIntentId, idempotencyKey }),
  })
  const payload = await res.json().catch(() => ({}))
  return { status: res.status, ...payload }
}

// ☀️ Morning Brief — last-24h aggregate. Returns a plain object so the UI
// can render it as a modal without leaking column-name assumptions.
export const runMorningBrief = async () => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const rows = []
  const skipped = []

  const probe = async (label, builder) => {
    try {
      const { count, error } = await builder()
      if (error) throw error
      rows.push({ label, value: count ?? 0 })
    } catch (e) {
      skipped.push(`${label} (${e?.message || 'query failed'})`)
    }
  }

  await probe('Missions detected (24h)', () =>
    supabase.from('mc_missions').select('id', { count: 'exact', head: true }).gt('created_at', oneDayAgo)
  )
  await probe('Missions shipped (24h)', () =>
    supabase.from('mc_missions').select('id', { count: 'exact', head: true })
      .eq('lane', 'shipped').gt('resolved_at', oneDayAgo)
  )
  await probe('Level progress events (24h)', () =>
    supabase.from('user_level_progress').select('user_id', { count: 'exact', head: true }).gt('updated_at', oneDayAgo)
  )

  return { rows, skipped, generatedAt: new Date() }
}

// 📡 Record a completed frontend-run agent action (Health Pulse / Morning
// Brief) into mc_events — via the MC API, because mc_events INSERT is
// service-role-only (the browser can't write its own audit row). The
// server maps `kind` → event_type from a whitelist and stamps the verified
// actor. Best-effort: never throws — a failed audit log must NOT break the
// action the operator already saw succeed.
export const recordActivity = async (kind, summary = {}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return { ok: false, error: 'no_session' }
    const res = await fetch('/api/activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ kind, summary }),
    })
    return { ok: res.ok }
  } catch (e) {
    console.error('recordActivity failed:', e)
    return { ok: false, error: e?.message || 'request_failed' }
  }
}
