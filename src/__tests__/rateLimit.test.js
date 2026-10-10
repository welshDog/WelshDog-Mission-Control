import { describe, it, expect, vi } from 'vitest'
import { createRateLimiter } from '../../server/rateLimit.js'

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: null }
  res.set = (k, v) => { res.headers[k] = v; return res }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const call = (rl, user) => {
  const res = mockRes()
  const next = vi.fn()
  rl({ user: { id: user } }, res, next)
  return { res, next }
}

describe('createRateLimiter', () => {
  it('allows up to the limit, then 429s with Retry-After', () => {
    let t = 1_000_000
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, name: 'refund', now: () => t })
    for (let i = 0; i < 3; i++) expect(call(rl, 'u1').next).toHaveBeenCalled()

    const { res, next } = call(rl, 'u1')
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(429)
    expect(res.body).toMatchObject({ success: false, error: 'rate_limited', scope: 'refund' })
    expect(res.headers['Retry-After']).toBe('60')
  })

  it('limits each admin independently', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 })
    expect(call(rl, 'a').next).toHaveBeenCalled()
    expect(call(rl, 'a').res.statusCode).toBe(429)
    expect(call(rl, 'b').next).toHaveBeenCalled()
  })

  it('frees the slot once the window slides past', () => {
    let t = 0
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t })
    expect(call(rl, 'a').next).toHaveBeenCalled()
    t = 500
    expect(call(rl, 'a').res.statusCode).toBe(429)
    t = 1001
    expect(call(rl, 'a').next).toHaveBeenCalled()
  })

  it('rejected calls do not extend the lockout', () => {
    let t = 0
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t })
    call(rl, 'a')
    for (t = 100; t < 900; t += 100) call(rl, 'a') // hammering while blocked
    t = 1001
    expect(call(rl, 'a').next).toHaveBeenCalled()
  })
})
