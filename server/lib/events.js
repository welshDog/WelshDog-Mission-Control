import { supabase } from '../config.js'

// ── mc_events helper — single emit point so all handlers stamp the
//    same shape. `actor` defaults to req.user.email; pass 'system' for
//    autonomous events (cron, webhooks). Errors are logged but never
//    thrown — the audit row failing must NEVER fail the user-facing
//    action that already succeeded. ──────────────────────────────────
export async function emitEvent({ missionId = null, eventType, actor, payload = {} }) {
  if (!supabase) return
  const { error } = await supabase.from('mc_events').insert([
    { mission_id: missionId, event_type: eventType, actor, payload },
  ])
  if (error) {
    console.error(`[mc-api] mc_events insert failed (${eventType}):`, error)
  }
}
