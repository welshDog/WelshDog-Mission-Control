import express from 'express'
import { randomUUID } from 'node:crypto'
import { supabase, MAX_GRANT_PER_CALL, UUID_RE } from '../config.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { emitEvent } from '../lib/events.js'
import { grantPreviewLimit, grantCommitLimit } from '../lib/limits.js'

const router = express.Router()

// ── /api/grant-tokens/preview ─────────────────────────────────────────
// Admin-only. Body: { userId }
// Returns: { success: true, userId, email, fullName, currentBalance, maxGrantPerCall }
//          { success: false, error }
//
// Purpose: before the operator commits a grant, confirm the userId
// resolves to a real user and surface current balance. Cheap read,
// no side effects, no audit row (a preview that didn't run shouldn't
// pollute the audit log).
router.post('/api/grant-tokens/preview', requireAdmin, grantPreviewLimit, async (req, res) => {
  const { userId } = req.body || {}
  if (!userId || typeof userId !== 'string' || !UUID_RE.test(userId)) {
    return res.status(400).json({ success: false, error: 'userId_must_be_uuid' })
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, full_name, broski_tokens')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[mc-api] preview user lookup failed:', error)
    return res.status(500).json({ success: false, error: 'user_lookup_failed' })
  }
  if (!user) {
    return res.status(404).json({ success: false, error: 'user_not_found' })
  }

  return res.json({
    success: true,
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    currentBalance: user.broski_tokens ?? 0,
    maxGrantPerCall: MAX_GRANT_PER_CALL,
  })
})

// ── /api/grant-tokens ─────────────────────────────────────────────────
// Admin-only. Body: { userId, amount, reason, idempotencyKey? }
// Returns: { success, awarded, newBalance, email, fullName, idempotencyKey }
//
// award_tokens() in the course Supabase is SECURITY DEFINER + idempotent
// via the (user_id, reason, source_id) partial unique constraint on
// token_transactions. We pass `mc-grant-<idempotencyKey>` as p_source_id
// so a double-click / retry never grants twice; the RPC's `awarded:false`
// return lets us tell the operator "already done" without erroring.
//
// Audit: emit a `tokens.granted` mc_events row (and an mc_missions
// shipped-lane card the operator can see on the Kanban). Both writes
// are best-effort — if either fails after the grant landed, we log and
// still return success so the operator's UI moves on.
router.post('/api/grant-tokens', requireAdmin, grantCommitLimit, async (req, res) => {
  const { userId, amount, reason } = req.body || {}
  const idempotencyKey =
    typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.length > 0
      ? req.body.idempotencyKey
      : randomUUID()

  // Validate.
  if (!userId || typeof userId !== 'string' || !UUID_RE.test(userId)) {
    return res.status(400).json({ success: false, error: 'userId_must_be_uuid' })
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'amount_must_be_positive_integer' })
  }
  if (amount > MAX_GRANT_PER_CALL) {
    return res.status(400).json({
      success: false,
      error: 'amount_exceeds_cap',
      maxGrantPerCall: MAX_GRANT_PER_CALL,
    })
  }
  if (typeof reason !== 'string' || reason.trim().length < 3) {
    return res.status(400).json({ success: false, error: 'reason_required_min_3_chars' })
  }

  const actor = req.user?.email || 'unknown'
  const sourceId = `mc-grant-${idempotencyKey}`

  // Call award_tokens — atomic ledger insert + balance bump in one RPC.
  const { data: grantData, error: grantErr } = await supabase.rpc('award_tokens', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason.trim(),
    p_source_id: sourceId,
  })
  if (grantErr) {
    console.error('[mc-api] award_tokens RPC failed:', grantErr)
    return res.status(500).json({ success: false, error: 'award_tokens_rpc_failed', detail: grantErr.message })
  }

  const awarded = grantData?.awarded === true
  const newBalance = grantData?.new_balance ?? null

  // Pull profile fields for the audit + the UI's success message.
  let userEmail = null
  let userName = null
  try {
    const { data: profile } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', userId)
      .maybeSingle()
    userEmail = profile?.email ?? null
    userName = profile?.full_name ?? null
  } catch (e) {
    console.error('[mc-api] profile lookup post-grant failed:', e)
  }

  // mc_missions audit (Kanban card). Skipped on idempotent no-op so the
  // operator doesn't see a phantom "shipped" card for a grant that
  // didn't actually move the balance.
  let missionId = null
  if (awarded) {
    const notes = [
      `userId: ${userId}`,
      `email: ${userEmail || 'unknown'}`,
      `amount: +${amount} BROski$`,
      `new_balance: ${newBalance}`,
      `actor: ${actor}`,
      `idempotency_key: ${idempotencyKey}`,
      '',
      'reason:',
      reason.trim(),
    ].join('\n')

    const { data: missionRows, error: insErr } = await supabase
      .from('mc_missions')
      .insert([
        {
          title: `Granted ${amount} BROski$ · ${userEmail || userId.slice(0, 8) + '…'}`,
          signal_source: `grant_tokens:${idempotencyKey}`,
          mission_type: 'grant_tokens',
          lane: 'shipped',
          owner: actor,
          priority: amount >= 1000 ? 'p1' : 'p2',
          notes,
        },
      ])
      .select('id')
    if (insErr) {
      console.error('[mc-api] mc_missions audit insert failed:', insErr)
    } else {
      missionId = missionRows?.[0]?.id ?? null
    }
  }

  // mc_events row — ALWAYS, even on idempotent no-op, because the
  // operator's INTENT to grant is itself audit-worthy ("tried again,
  // got the idempotent no-op"). event_type encodes the outcome.
  await emitEvent({
    missionId,
    eventType: awarded ? 'tokens.granted' : 'tokens.grant_skipped_duplicate',
    actor,
    payload: {
      userId,
      email: userEmail,
      amount,
      reason: reason.trim(),
      newBalance,
      idempotencyKey,
      sourceId,
    },
  })

  return res.json({
    success: true,
    awarded,
    newBalance,
    email: userEmail,
    fullName: userName,
    idempotencyKey,
  })
})

export default router
