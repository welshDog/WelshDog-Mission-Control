// scripts/preflight-supabase.mjs — Phase 3 STOP GATE from docs/RECOVERY_2026-07-18.md.
//
//   npm run preflight:supabase
//
// Checks that .env.local points at the right Supabase project, that each key
// belongs to that project with the right role, and that the mc_* schema + an
// admin row exist. READ-ONLY. Never prints a key: it reports booleans, refs and
// counts only, and scrubs key values out of any error text.
//
// Override the expected project with EXPECTED_SUPABASE_REF.

import { fileURLToPath } from 'node:url'

export const DEFAULT_EXPECTED_REF = 'tlavrxiaegbtyfmjfdcz'
export const DELETED_REFS = ['yhtmuibgdnxhbgboajhc']

export function decodeJwt(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export function refFromUrl(url) {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/i.exec(String(url ?? '').trim())
  return m ? m[1].toLowerCase() : null
}

const r = (id, ok, msg) => ({ id, ok, msg })

/** Pure config checks — no network. */
export function checkConfig(env, { expectedRef = DEFAULT_EXPECTED_REF } = {}) {
  const out = []
  const viteRef = refFromUrl(env.VITE_SUPABASE_URL)
  const srvRef = refFromUrl(env.SUPABASE_URL)

  out.push(r('vite-url', !!viteRef, viteRef
    ? `VITE_SUPABASE_URL → ${viteRef}`
    : 'VITE_SUPABASE_URL missing or not https://<ref>.supabase.co'))
  out.push(r('server-url', !!srvRef, srvRef
    ? `SUPABASE_URL → ${srvRef}`
    : 'SUPABASE_URL missing (the Express API needs it; requireAdmin returns 500 without it)'))
  if (viteRef && srvRef) {
    out.push(r('same-project', viteRef === srvRef,
      viteRef === srvRef ? 'browser and server use the same project'
        : `VITE_SUPABASE_URL (${viteRef}) and SUPABASE_URL (${srvRef}) point at DIFFERENT projects`))
  }
  for (const ref of [viteRef, srvRef].filter(Boolean)) {
    if (DELETED_REFS.includes(ref)) {
      out.push(r('not-deleted', false, `${ref} is the DELETED project — repoint at ${expectedRef}`))
    }
  }
  const ref = srvRef || viteRef
  if (ref && !DELETED_REFS.includes(ref)) {
    out.push(r('expected-ref', ref === expectedRef,
      ref === expectedRef ? `project is the expected Course project (${expectedRef})`
        : `project ${ref} is not the runbook target ${expectedRef} (set EXPECTED_SUPABASE_REF if intentional)`))
  }

  const keyCheck = (id, name, value, wantRole) => {
    if (!value) return out.push(r(id, false, `${name} missing`))
    const p = decodeJwt(value)
    if (!p) return out.push(r(id, false, `${name} is not a valid JWT`))
    if (p.role !== wantRole) {
      return out.push(r(id, false, `${name} has role "${p.role}" — expected "${wantRole}" (keys swapped?)`))
    }
    if (ref && p.ref !== ref) {
      return out.push(r(id, false, `${name} belongs to project "${p.ref}", not ${ref} (old project's key?)`))
    }
    out.push(r(id, true, `${name} is the ${wantRole} key for ${p.ref}`))
  }
  keyCheck('anon-key', 'VITE_SUPABASE_ANON_KEY', env.VITE_SUPABASE_ANON_KEY, 'anon')
  keyCheck('service-key', 'SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY, 'service_role')
  return out
}

/** Live read-only checks using the service-role key. */
export async function checkLive(env, fetchFn = fetch) {
  const base = String(env.SUPABASE_URL).replace(/\/$/, '')
  const secrets = [env.SUPABASE_SERVICE_ROLE_KEY, env.VITE_SUPABASE_ANON_KEY].filter(Boolean)
  const scrub = (s) => secrets.reduce((acc, k) => acc.split(k).join('<key>'), String(s))
  const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  const out = []

  const get = async (path, headers = svc) => {
    try {
      const res = await fetchFn(base + path, { headers })
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* not json */ }
      return { status: res.status, json, text: scrub(text).slice(0, 160) }
    } catch (e) {
      return { status: 0, json: null, text: scrub(e?.cause?.code || e?.message || e) }
    }
  }

  const health = await get('/auth/v1/health', { apikey: env.VITE_SUPABASE_ANON_KEY })
  out.push(r('auth-health', health.status === 200, health.status === 200
    ? 'Supabase Auth reachable' : `Auth health failed (HTTP ${health.status}: ${health.text})`))

  for (const t of ['mc_missions', 'mc_events']) {
    const res = await get(`/rest/v1/${t}?select=id&limit=0`)
    out.push(r(`table-${t}`, res.status === 200, res.status === 200
      ? `${t} exists` : `${t} not readable (HTTP ${res.status}: ${res.text}) — apply the migrations (Phase 1)`))
  }
  const mt = await get('/rest/v1/mc_missions?select=mission_type&limit=0')
  out.push(r('mission_type', mt.status === 200, mt.status === 200
    ? 'mc_missions.mission_type exists'
    : `mission_type column missing (HTTP ${mt.status}) — apply 20260718000000_mc_missions_restore_adhoc_columns.sql`))

  const admins = await get('/rest/v1/users?select=id&role=eq.admin')
  const n = Array.isArray(admins.json) ? admins.json.length : -1
  out.push(r('admin-row', n >= 1, n >= 1 ? `${n} admin row(s) in public.users`
    : n === 0 ? 'no public.users row with role=admin — every protected endpoint will 403 (Phase 2)'
      : `could not read public.users (HTTP ${admins.status}: ${admins.text})`))
  return out
}

export function report(results) {
  for (const x of results) console.log(`${x.ok ? '  ✅' : '  ❌'} ${x.msg}`)
  const bad = results.filter((x) => !x.ok).length
  console.log(bad ? `\n${bad} check(s) failed.` : '\nAll checks passed — safe to continue to Phase 4 (Render + Vercel).')
  return bad === 0
}

async function main() {
  const { default: dotenv } = await import('dotenv')
  dotenv.config({ path: '.env.local' })
  dotenv.config()
  const env = process.env
  const expectedRef = env.EXPECTED_SUPABASE_REF || DEFAULT_EXPECTED_REF

  console.log('Config (offline)')
  const cfg = checkConfig(env, { expectedRef })
  let ok = report(cfg)
  const fatal = cfg.some((x) => !x.ok && ['server-url', 'service-key', 'anon-key', 'not-deleted', 'same-project'].includes(x.id))
  if (fatal) {
    console.log('\nSkipping live checks until the config above is fixed.')
    process.exit(1)
  }
  console.log('\nLive (read-only)')
  ok = report(await checkLive(env)) && ok
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
