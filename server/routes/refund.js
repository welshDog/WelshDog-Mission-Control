import express from 'express'
import { randomUUID } from 'node:crypto'
import { supabase, STRIPE_PI_RE, STRIPE_SECRET_KEY } from '../config.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { emitEvent } from '../lib/events.js'
import { stripeFetch } from '../lib/stripe.js'
import { refundPreviewLimit, refundCommitLimit } from '../lib/limits.js'

const router = express.Router()

// ── /api/refund/preview ───────────────────────────────────────────────
// Admin-only. Body: { paymentIntentId }
// Returns: enough state for the operator to make an informed Confirm:
//   - Stripe payment_intent: amount, currency, status, customer
//   - Prior refunds against that PI (if any) — surfaces double-refunds
//   - The token_transactions row that originally awarded tokens for this PI
//   - The user's current broski_tokens balance
//   - canRefund flag + blocker string when something pre-empts
router.post('/api/refund/preview', requireAdmin, refundPreviewLimit, async (req, res) => {
  const { paymentIntentId } = req.body || {}
  if (!paymentIntentId || typeof paymentIntentId !== 'string' || !STRIPE_PI_RE.test(paymentIntentId)) {
    return res.status(400).json({ success: false, error: 'paymentIntentId_must_be_pi_format' })
  }
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ success: false, error: 'stripe_not_configured' })
  }
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'supabase not configured' })
  }

  // 1. Stripe PI lookup
  const piRes = await stripeFetch(`/payment_intents/${paymentIntentId}`).catch((e) => ({
    ok: false, status: 500, payload: { error: { message: e?.message || 'fetch failed' } },
  }))
  if (!piRes.ok) {
    return res.status(piRes.status === 404 ? 404 : 502).json({
      success: false,
      error: piRes.status === 404 ? 'payment_intent_not_found' : 'stripe_lookup_failed',
      detail: piRes.payload?.error?.message || null,
    })
  }
  const pi = piRes.payload

  // 2. Prior refunds against this PI — used both for the UI badge and
  //    to compute remaining refundable amount.
  const refundsRes = await stripeFetch(`/refunds?payment_intent=${paymentIntentId}&limit=10`)
  const priorRefunds = refundsRes.ok ? (refundsRes.payload?.data || []) : []
  const refundedAmount = priorRefunds.reduce((acc, r) => acc + (r.status === 'succeeded' ? r.amount : 0), 0)
  const refundable = Math.max(0, (pi.amount || 0) - refundedAmount)

  // 3. token_transactions row for this PI (the original token award)
  const { data: txnRow, error: txnErr } = await supabase
    .from('token_transactions')
    .select('user_id, amount, reason, created_at')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (txnErr) {
    console.error('[mc-api] token_transactions lookup failed:', txnErr)
    return res.status(500).json({ success: false, error: 'token_lookup_failed' })
  }
  if (!txnRow) {
    return res.status(404).json({
      success: false,
      error: 'no_token_award_found',
      detail: 'No token_transactions row references this payment_intent. Refund the Stripe charge manually via the dashboard if needed; this MC flow refuses to act without a token side to reverse.',
    })
  }

  // 4. User profile + current balance
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, full_name, broski_tokens')
    .eq('id', txnRow.user_id)
    .maybeSingle()
  if (userErr || !user) {
    return res.status(500).json({ success: false, error: 'user_lookup_failed' })
  }

  // 5. Decide canRefund
  let canRefund = true
  let blocker = null
  if (pi.status !== 'succeeded') {
    canRefund = false
    blocker = `Stripe payment_intent status is "${pi.status}" — only succeeded charges can be refunded.`
  } else if (refundable <= 0) {
    canRefund = false
    blocker = 'This payment has already been fully refunded.'
  } else if ((user.broski_tokens ?? 0) < txnRow.amount) {
    canRefund = false
    blocker = `Token deduction would require ${txnRow.amount} BROski$ but user balance is only ${user.broski_tokens ?? 0}. Cannot guarantee a clean reversal.`
  }

  return res.json({
    success: true,
    paymentIntent: {
      id: pi.id,
      amount: pi.amount,            // in minor units (cents)
      currency: pi.currency,
      status: pi.status,
      customer: pi.customer || null,
      created: pi.created,
    },
    refundedAmount,                  // already-refunded amount (minor units)
    refundable,                      // remaining refundable (minor units)
    priorRefundCount: priorRefunds.length,
    tokensAwarded: txnRow.amount,
    tokenReason: txnRow.reason,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      currentBalance: user.broski_tokens ?? 0,
    },
    canRefund,
    blocker,
  })
})

// ── /api/refund ───────────────────────────────────────────────────────
// Admin-only. Body: { paymentIntentId, idempotencyKey? }
// Returns: { success, refundId, refundedAmount, currency, newBalance, idempotencyKey, awarded }
//
// Order of operations is DELIBERATE:
//   1. Re-run preview checks server-side (don't trust client state)
//   2. Stripe refund FIRST with Idempotency-Key — real money first;
//      retries / double-clicks are safe.
//   3. If Stripe succeeds, call spend_tokens() with matching p_source_id
//      so the token side dedups the same way.
//   4. If Stripe succeeds but spend_tokens fails, emit a
//      `refund.token_deduction_failed` event and return success with
//      `awarded: false` so the operator sees the discrepancy and can
//      reconcile manually. The user has their cash back; the token
//      shortfall is logged forever.
//
// Audit:
//   - mc_missions card (shipped lane, owner = actor, priority based on amount)
//   - mc_events row — `refund.issued` (clean) / `refund.token_deduction_failed`
router.post('/api/refund', requireAdmin, refundCommitLimit, async (req, res) => {
  const { paymentIntentId } = req.body || {}
  const idempotencyKey =
    typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.length > 0
      ? req.body.idempotencyKey
      : randomUUID()

  if (!paymentIntentId || typeof paymentIntentId !== 'string' || !STRIPE_PI_RE.test(paymentIntentId)) {
    return res.status(400).json({ success: false, error: 'paymentIntentId_must_be_pi_format' })
  }
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ success: false, error: 'stripe_not_configured' })
  }
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'supabase not configured' })
  }

  const actor = req.user?.email || 'unknown'
  const sourceId = `mc-refund-${idempotencyKey}`

  // 1. Re-run server-side checks (defensive — preview state may be stale)
  const { data: txnRow, error: txnErr } = await supabase
    .from('token_transactions')
    .select('user_id, amount, reason')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (txnErr) return res.status(500).json({ success: false, error: 'token_lookup_failed' })
  if (!txnRow) return res.status(404).json({ success: false, error: 'no_token_award_found' })

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, full_name, broski_tokens')
    .eq('id', txnRow.user_id)
    .maybeSingle()
  if (userErr || !user) return res.status(500).json({ success: false, error: 'user_lookup_failed' })

  if ((user.broski_tokens ?? 0) < txnRow.amount) {
    return res.status(400).json({
      success: false,
      error: 'insufficient_balance_for_refund',
      detail: `User balance ${user.broski_tokens ?? 0} < required deduction ${txnRow.amount}`,
    })
  }

  // 2. Stripe refund (idempotent — Stripe dedups via Idempotency-Key header)
  const stripeRes = await stripeFetch('/refunds', {
    method: 'POST',
    body: { payment_intent: paymentIntentId, reason: 'requested_by_customer' },
    idempotencyKey: sourceId,
  })
  if (!stripeRes.ok) {
    const errMsg = stripeRes.payload?.error?.message || `stripe_${stripeRes.status}`
    await emitEvent({
      eventType: 'refund.failed',
      actor,
      payload: { paymentIntentId, stage: 'stripe', error: errMsg, idempotencyKey, sourceId },
    })
    return res.status(502).json({ success: false, error: 'stripe_refund_failed', detail: errMsg })
  }
  const refund = stripeRes.payload

  // 3. Token deduction (best-effort; failure does NOT roll back Stripe)
  let awarded = false
  let newBalance = user.broski_tokens ?? 0
  let tokenDeductionError = null
  try {
    const { data: spendData, error: spendErr } = await supabase.rpc('spend_tokens', {
      p_user_id: txnRow.user_id,
      p_amount: txnRow.amount,
      p_reason: `refund of ${paymentIntentId}`,
      p_source_id: sourceId,
    })
    if (spendErr) throw spendErr
    awarded = spendData?.spent === true || spendData?.success === true
    newBalance = spendData?.new_balance ?? newBalance
  } catch (e) {
    tokenDeductionError = e?.message || 'spend_tokens RPC failed'
    console.error('[mc-api] post-refund token deduction failed:', tokenDeductionError)
  }

  // 4. Audit — both layers, regardless of token-side outcome
  let missionId = null
  const noteLines = [
    `paymentIntent: ${paymentIntentId}`,
    `refundId: ${refund.id}`,
    `refundedAmount: ${refund.amount} ${refund.currency}`,
    `tokensDeducted: ${awarded ? txnRow.amount : 0}${tokenDeductionError ? ' (FAILED)' : ''}`,
    `newBalance: ${newBalance}`,
    `actor: ${actor}`,
    `idempotency_key: ${idempotencyKey}`,
    tokenDeductionError ? `token_deduction_error: ${tokenDeductionError}` : null,
    '',
    `user: ${user.email || user.id}`,
  ].filter(Boolean)

  const { data: missionRows, error: insErr } = await supabase
    .from('mc_missions')
    .insert([
      {
        title: tokenDeductionError
          ? `Refund landed BUT token deduction FAILED · ${paymentIntentId.slice(0, 12)}…`
          : `Refunded ${refund.amount} ${refund.currency} · ${user.email || paymentIntentId.slice(0, 12) + '…'}`,
        signal_source: `refund:${idempotencyKey}`,
        mission_type: 'refund',
        lane: tokenDeductionError ? 'investigating' : 'shipped',
        owner: actor,
        priority: tokenDeductionError ? 'p0' : (refund.amount >= 5000 ? 'p1' : 'p2'),
        notes: noteLines.join('\n'),
      },
    ])
    .select('id')
  if (insErr) {
    console.error('[mc-api] mc_missions audit insert failed:', insErr)
  } else {
    missionId = missionRows?.[0]?.id ?? null
  }

  await emitEvent({
    missionId,
    eventType: tokenDeductionError ? 'refund.token_deduction_failed' : 'refund.issued',
    actor,
    payload: {
      paymentIntentId,
      refundId: refund.id,
      refundedAmount: refund.amount,
      currency: refund.currency,
      tokensDeducted: awarded ? txnRow.amount : 0,
      newBalance,
      userId: txnRow.user_id,
      email: user.email,
      idempotencyKey,
      sourceId,
      tokenDeductionError,
    },
  })

  return res.json({
    success: true,
    refundId: refund.id,
    refundedAmount: refund.amount,
    currency: refund.currency,
    newBalance,
    awarded,
    tokenDeductionError,
    idempotencyKey,
  })
})

export default router
