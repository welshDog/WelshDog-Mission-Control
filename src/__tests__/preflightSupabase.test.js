import { describe, it, expect } from 'vitest'
import {
  checkConfig, checkLive, decodeJwt, refFromUrl, DEFAULT_EXPECTED_REF, DELETED_REFS,
} from '../../scripts/preflight-supabase.mjs'

const jwt = (payload) =>
  ['h', Buffer.from(JSON.stringify(payload)).toString('base64url'), 's'].join('.')
const REF = DEFAULT_EXPECTED_REF
const URL_OK = `https://${REF}.supabase.co`
const good = () => ({
  VITE_SUPABASE_URL: URL_OK,
  SUPABASE_URL: URL_OK,
  VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: REF }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: REF }),
})
const failing = (res) => res.filter((x) => !x.ok).map((x) => x.id)

describe('helpers', () => {
  it('refFromUrl accepts only https://<20-char-ref>.supabase.co', () => {
    expect(refFromUrl(URL_OK)).toBe(REF)
    expect(refFromUrl(URL_OK + '/')).toBe(REF)
    expect(refFromUrl('http://' + REF + '.supabase.co')).toBeNull()
    expect(refFromUrl('https://evil.example')).toBeNull()
    expect(refFromUrl(undefined)).toBeNull()
  })
  it('decodeJwt returns null for junk and never throws', () => {
    expect(decodeJwt('nope')).toBeNull()
    expect(decodeJwt('a.b.c')).toBeNull()
    expect(decodeJwt(undefined)).toBeNull()
    expect(decodeJwt(jwt({ role: 'anon' }))).toEqual({ role: 'anon' })
  })
})

describe('checkConfig', () => {
  it('passes a correct config', () => {
    expect(failing(checkConfig(good()))).toEqual([])
  })

  it('flags the CURRENT broken state: old deleted project + no server URL', () => {
    const old = DELETED_REFS[0]
    const env = {
      VITE_SUPABASE_URL: `https://${old}.supabase.co`,
      VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: old }),
      SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: old }),
    }
    const f = failing(checkConfig(env))
    expect(f).toContain('server-url')
    expect(f).toContain('not-deleted')
  })

  it('catches vite/server pointing at different projects', () => {
    const env = { ...good(), SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co' }
    expect(failing(checkConfig(env))).toContain('same-project')
  })

  it('catches swapped keys (service key in the anon slot and vice versa)', () => {
    const g = good()
    const env = { ...g, VITE_SUPABASE_ANON_KEY: g.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE_KEY: g.VITE_SUPABASE_ANON_KEY }
    expect(failing(checkConfig(env))).toEqual(expect.arrayContaining(['anon-key', 'service-key']))
  })

  it("catches a key that belongs to a different project than the URL", () => {
    const env = { ...good(), SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: DELETED_REFS[0] }) }
    expect(failing(checkConfig(env))).toEqual(['service-key'])
  })

  it('catches missing and malformed keys', () => {
    expect(failing(checkConfig({ ...good(), VITE_SUPABASE_ANON_KEY: '' }))).toEqual(['anon-key'])
    expect(failing(checkConfig({ ...good(), SUPABASE_SERVICE_ROLE_KEY: 'garbage' }))).toEqual(['service-key'])
  })

  it('flags a project other than the runbook target unless overridden', () => {
    const other = 'bbbbbbbbbbbbbbbbbbbb'
    const env = {
      VITE_SUPABASE_URL: `https://${other}.supabase.co`, SUPABASE_URL: `https://${other}.supabase.co`,
      VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: other }),
      SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: other }),
    }
    expect(failing(checkConfig(env))).toEqual(['expected-ref'])
    expect(failing(checkConfig(env, { expectedRef: other }))).toEqual([])
  })
})

describe('checkLive', () => {
  const env = good()
  const mkFetch = (routes) => async (url) => {
    const path = new URL(url).pathname + new URL(url).search
    const hit = Object.entries(routes).find(([k]) => path.startsWith(k))
    const [status, body] = hit ? hit[1] : [404, { message: 'nope' }]
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }
  const allGood = {
    '/auth/v1/health': [200, { ok: true }],
    '/rest/v1/mc_missions': [200, []],
    '/rest/v1/mc_events': [200, []],
    '/rest/v1/users': [200, [{ id: 'u1' }]],
  }

  it('passes when schema and an admin row exist', async () => {
    expect(failing(await checkLive(env, mkFetch(allGood)))).toEqual([])
  })

  it('flags missing tables, missing mission_type column, and no admin', async () => {
    const res = await checkLive(env, mkFetch({
      '/auth/v1/health': [200, {}],
      '/rest/v1/mc_missions?select=mission_type': [400, { message: 'column mission_type does not exist' }],
      '/rest/v1/mc_missions': [200, []],
      '/rest/v1/mc_events': [404, { message: 'relation does not exist' }],
      '/rest/v1/users': [200, []],
    }))
    expect(failing(res)).toEqual(['table-mc_events', 'mission_type', 'admin-row'])
  })

  it('reports a network failure instead of throwing', async () => {
    const res = await checkLive(env, async () => { throw new Error('ECONNREFUSED') })
    expect(failing(res).length).toBeGreaterThan(0)
  })

  it('never leaks a key into its messages, even if upstream errors echo it', async () => {
    const res = await checkLive(env, async () => {
      throw new Error(`bad auth ${env.SUPABASE_SERVICE_ROLE_KEY} and ${env.VITE_SUPABASE_ANON_KEY}`)
    })
    const all = JSON.stringify(res)
    expect(all).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY)
    expect(all).not.toContain(env.VITE_SUPABASE_ANON_KEY)

    const echoing = await checkLive(env, mkFetch({
      '/rest/v1/users': [401, `invalid key ${env.SUPABASE_SERVICE_ROLE_KEY}`],
    }))
    expect(JSON.stringify(echoing)).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY)
  })
})
