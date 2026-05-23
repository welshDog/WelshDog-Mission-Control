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

export const createMission = async ({ title, signal_source = 'manual', notes = null, lane = 'detected' }) => {
  const { data, error } = await supabase
    .from('mc_missions')
    .insert([{ title, signal_source, notes, lane }])
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
    const { data, error } = await supabase
      .from('user_level_progress')
      .select('user_id, level, updated_at', { count: 'exact' })
      .lt('updated_at', sevenDaysAgo)
      .is('completed_at', null)
      .limit(50)
    if (error) throw error
    scanned.push('user_level_progress')
    if (data && data.length > 0) {
      await createMission({
        title: `${data.length} student${data.length === 1 ? '' : 's'} stuck >7d on a level`,
        signal_source: 'health_pulse:stuck_students',
        notes: `Found ${data.length} user_level_progress rows with no completed_at and idle >7 days.`,
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
        notes: 'Quiet day — no new signals tripped. This heartbeat card confirms the pulse ran.',
      })
      createdCount += 1
    }
  } catch (e) {
    skipped.push(`mc_missions (${e?.message || 'query failed'})`)
  }

  return { createdCount, scanned, skipped }
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
