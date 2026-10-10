import { supabase } from '../config.js'

// ── requireAdmin middleware ──────────────────────────────────────────
// Verifies an Authorization: Bearer <jwt> header against Supabase Auth,
// looks up the user's role, and rejects anything that isn't `admin`.
// On success: attaches `req.user = { id, email }`. Handlers downstream
// stamp these into mc_events.actor so the audit log is trustworthy.
//
// Why not just trust CORS + service_role? Because CORS isn't auth — any
// page in the allowlist could call /api/send-dm without proving who's
// behind it, and service_role would happily send the DM + write the
// "audit" row with no real actor. This middleware closes that hole.
export async function requireAdmin(req, res, next) {
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'supabase not configured' })
  }
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return res.status(401).json({ success: false, error: 'missing_bearer_token' })
  }

  // Verify the JWT (signature + expiry) against Supabase Auth.
  const { data: userRes, error: jwtErr } = await supabase.auth.getUser(token)
  if (jwtErr || !userRes?.user) {
    return res.status(401).json({ success: false, error: 'invalid_token' })
  }

  // Role check — defence in depth on top of the AdminAuth client allowlist.
  const { data: profile, error: roleErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', userRes.user.id)
    .single()
  if (roleErr) {
    console.error('[mc-api] role lookup failed:', roleErr)
    return res.status(500).json({ success: false, error: 'role_lookup_failed' })
  }
  if (profile?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'forbidden_not_admin' })
  }

  req.user = { id: userRes.user.id, email: userRes.user.email }
  next()
}
