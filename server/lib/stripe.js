import { STRIPE_API, STRIPE_SECRET_KEY } from '../config.js'

// ── Stripe helpers (raw REST — no SDK, keeps deps slim) ──────────────
// Stripe expects application/x-www-form-urlencoded bodies. Auth is HTTP
// Basic with the secret key as the username (Bearer also works on most
// endpoints but Basic is documented + idiomatic).
export const stripeFetch = async (path, { method = 'GET', body = null, idempotencyKey = null } = {}) => {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured')
  }
  const headers = {
    Authorization: `Basic ${Buffer.from(`${STRIPE_SECRET_KEY}:`).toString('base64')}`,
  }
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: body ? new URLSearchParams(body).toString() : undefined,
  })
  const payload = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, payload }
}
