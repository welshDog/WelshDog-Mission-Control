import { describe, it, expect, vi } from 'vitest'
import { createMetricsAuth } from '../../server/metricsAuth.js'

function run(mw, authorization) {
  const res = { statusCode: 200, body: null, headers: {} }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  res.set = (k, v) => { res.headers[k] = v; return res }
  const next = vi.fn()
  mw({ headers: authorization ? { authorization } : {} }, res, next)
  return { res, next }
}

describe('createMetricsAuth', () => {
  const mw = createMetricsAuth({ token: 's3cret', nodeEnv: 'production' })

  it('lets a correct bearer token through', () => {
    expect(run(mw, 'Bearer s3cret').next).toHaveBeenCalled()
  })

  it('401s with no header', () => {
    const { res, next } = run(mw)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.headers['WWW-Authenticate']).toBe('Bearer')
  })

  it('403s on a wrong token, including same-length and prefix guesses', () => {
    for (const bad of ['Bearer nope', 'Bearer s3creT', 'Bearer s3cre', 'Bearer s3cret-extra', 'Basic s3cret']) {
      const { res, next } = run(mw, bad)
      expect(next).not.toHaveBeenCalled()
      expect([401, 403]).toContain(res.statusCode)
    }
  })

  it('fails closed in production when no token is configured', () => {
    const closed = createMetricsAuth({ token: '', nodeEnv: 'production' })
    const { res, next } = run(closed)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(503)
  })

  it('treats a whitespace-only token as unset', () => {
    const closed = createMetricsAuth({ token: '   ', nodeEnv: 'production' })
    expect(run(closed, 'Bearer ').res.statusCode).toBe(503)
  })

  it('stays open in dev when no token is configured', () => {
    const dev = createMetricsAuth({ token: undefined, nodeEnv: 'development' })
    expect(run(dev).next).toHaveBeenCalled()
  })
})
