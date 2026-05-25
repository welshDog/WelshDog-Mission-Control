// Refund — admin overlay for refunding a Stripe charge + reversing
// the BROski$ that were awarded for it.
//
// Two-step flow (mirrors GrantTokens — deliberate, prevents
// finger-trouble against real money):
//   1. Paste a Stripe payment_intent ID (pi_*) → click PREVIEW →
//      server looks up the PI on Stripe, the token_transactions row
//      that awarded tokens for it, and the user's current balance.
//      Returns canRefund + blocker so the UI can refuse to Confirm
//      when the refund would create an unclean state (e.g. tokens
//      already spent, PI not succeeded, already refunded).
//   2. Operator confirms → Stripe refund (with Idempotency-Key) →
//      spend_tokens() with matching p_source_id → audit rows.
//
// Partial-failure handling: if Stripe succeeds but spend_tokens fails
// (rare; pre-flight balance check catches the common case), the
// server emits `refund.token_deduction_failed`. UI surfaces the
// discrepancy clearly so the operator can reconcile.
//
// Idempotency: a single client-side UUID per editing session — the
// server feeds it to both Stripe's Idempotency-Key header AND the
// spend_tokens() p_source_id. Double-click / retry = no double action.
//
// Auth: JWT attached on every fetch via lib/supabase.js wrappers;
// requireAdmin middleware does role check server-side.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Undo2,
  Search,
  Loader,
  CheckCircle2,
  X,
  AlertTriangle,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { previewRefund, runRefund } from '../../lib/supabase'

const STRIPE_PI_RE = /^pi_[A-Za-z0-9_]+$/

const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

// Stripe amounts are in minor units (cents). Format for display using
// the currency code from the PI — Intl handles the symbol + decimal
// placement automatically.
const formatStripeAmount = (minor, currency) => {
  if (minor == null || !currency) return '–'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(minor / 100)
  } catch {
    return `${minor / 100} ${currency.toUpperCase()}`
  }
}

const errorToMessage = (out) => {
  if (!out) return 'Network error'
  if (out.error === 'no_session' || out.error === 'invalid_token' || out.error === 'missing_bearer_token' || out.status === 401)
    return 'Session expired — sign out and back in, then retry'
  if (out.error === 'forbidden_not_admin' || out.status === 403)
    return 'Your account is not in the admin role — refund blocked server-side'
  if (out.error === 'paymentIntentId_must_be_pi_format')
    return 'Payment intent must look like pi_xxx…'
  if (out.error === 'payment_intent_not_found')
    return 'Stripe says this payment_intent doesn’t exist'
  if (out.error === 'no_token_award_found')
    return 'No token_transactions row references this payment. Refund manually via Stripe dashboard if needed; this flow refuses to act without a token side to reverse.'
  if (out.error === 'insufficient_balance_for_refund')
    return out.detail || 'User balance is too low to deduct the awarded tokens'
  if (out.error === 'stripe_refund_failed')
    return `Stripe refused: ${out.detail || 'unknown'}`
  if (out.error === 'stripe_not_configured')
    return 'STRIPE_SECRET_KEY is missing on the server — refund disabled'
  if (out.error === 'stripe_lookup_failed')
    return `Stripe lookup failed: ${out.detail || 'unknown'}`
  return out.error || `HTTP ${out.status || '???'}`
}

export default function Refund({ onClose }) {
  const [paymentIntentId, setPI]      = useState('')
  const [preview, setPreview]         = useState(null)
  const [previewing, setPreviewing]   = useState(false)
  const [previewError, setPreviewErr] = useState(null)
  const [refunding, setRefunding]     = useState(false)
  const [refundResult, setResult]     = useState(null)
  const [refundError, setRefundErr]   = useState(null)
  const [idempotencyKey]              = useState(newIdempotencyKey)

  // Esc closes (but only when not mid-refund — a half-finished refund
  // never silently aborts on a stray keystroke; real money is involved).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !refunding) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, refunding])

  const piValid = useMemo(() => STRIPE_PI_RE.test(paymentIntentId.trim()), [paymentIntentId])

  const runPreview = useCallback(async () => {
    setPreviewing(true); setPreviewErr(null); setPreview(null); setRefundErr(null)
    const out = await previewRefund({ paymentIntentId: paymentIntentId.trim() })
    if (out.success) {
      setPreview(out)
    } else {
      setPreviewErr(errorToMessage(out))
    }
    setPreviewing(false)
  }, [paymentIntentId])

  const runConfirm = useCallback(async () => {
    setRefunding(true); setRefundErr(null)
    const out = await runRefund({
      paymentIntentId: paymentIntentId.trim(),
      idempotencyKey,
    })
    if (out.success) {
      setResult(out)
    } else {
      setRefundErr(errorToMessage(out))
    }
    setRefunding(false)
  }, [paymentIntentId, idempotencyKey])

  const reset = () => {
    setResult(null); setRefundErr(null); setPreviewErr(null); setPreview(null); setPI('')
  }

  return (
    <AnimatePresence>
      <motion.div
        key="refund-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch justify-center p-4 sm:p-8"
        onClick={(e) => { if (e.target === e.currentTarget && !refunding) onClose?.() }}
        role="dialog"
        aria-modal="true"
        aria-label="Refund a Stripe charge + reverse BROski$"
      >
        <motion.div
          initial={{ scale: 0.97, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.97, y: 12 }}
          transition={{ duration: 0.18 }}
          className="glass-panel rounded-2xl border border-white/10 w-full max-w-2xl flex flex-col overflow-hidden"
        >
          <header className="flex items-start gap-4 px-6 py-4 border-b border-white/10">
            <div className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center shrink-0">
              <Undo2 className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-black accent-gradient-text leading-tight">Refund</h2>
              <p className="text-xs text-gray-400">
                Stripe charge refund + matching BROski$ deduction. Both sides idempotent (Stripe Idempotency-Key + spend_tokens p_source_id).
              </p>
            </div>
            <button
              onClick={() => !refunding && onClose?.()}
              disabled={refunding}
              className="text-gray-400 hover:text-white disabled:opacity-40"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
            {/* ─── SUCCESS STATE ───────────────────────────────────── */}
            {refundResult && (
              <div className={`rounded-xl border p-5 space-y-3 ${
                refundResult.tokenDeductionError
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-emerald-500/30 bg-emerald-500/10'
              }`}>
                <div className={`flex items-center gap-2 ${
                  refundResult.tokenDeductionError ? 'text-amber-200' : 'text-emerald-200'
                }`}>
                  {refundResult.tokenDeductionError ? <ShieldAlert className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                  <h3 className="text-base font-bold">
                    {refundResult.tokenDeductionError
                      ? 'Refund LANDED but token deduction FAILED — manual reconcile needed'
                      : 'Refund landed end-to-end'}
                  </h3>
                </div>
                <dl className="text-sm space-y-1 text-gray-200">
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-400">Stripe refund</dt>
                    <dd className="font-mono text-right truncate">{refundResult.refundId}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-400">Amount refunded</dt>
                    <dd className="font-mono text-right">{formatStripeAmount(refundResult.refundedAmount, refundResult.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-400">Tokens deducted</dt>
                    <dd className={`font-mono text-right ${refundResult.awarded ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {refundResult.awarded ? `−${preview?.tokensAwarded ?? '?'} BROski$` : 'NOT deducted'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-400">New balance</dt>
                    <dd className="font-mono text-right text-brand-accent font-bold">{refundResult.newBalance}</dd>
                  </div>
                  {refundResult.tokenDeductionError && (
                    <div className="pt-2 border-t border-amber-500/30 text-xs text-amber-200">
                      <strong>spend_tokens error:</strong> {refundResult.tokenDeductionError}
                    </div>
                  )}
                </dl>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={reset} className="btn-secondary py-1.5 px-3 text-xs">Refund another</button>
                  <button onClick={() => onClose?.()} className="btn-primary py-1.5 px-3 text-xs">Done</button>
                </div>
              </div>
            )}

            {/* ─── FORM ───────────────────────────────────────────── */}
            {!refundResult && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="refund-pi" className="block text-[11px] font-mono uppercase tracking-widest text-gray-400">
                    Stripe payment_intent ID
                  </label>
                  <input
                    id="refund-pi"
                    type="text"
                    value={paymentIntentId}
                    onChange={(e) => { setPI(e.target.value); setPreview(null); setPreviewErr(null) }}
                    placeholder="pi_3OxxxxxxXXXxxxxx0XxX"
                    autoComplete="off"
                    spellCheck="false"
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2.5 text-sm font-mono text-gray-100 focus:outline-none focus:border-brand-accent/60"
                  />
                  {paymentIntentId.length > 0 && !piValid && (
                    <p className="text-[11px] text-amber-300">Doesn&apos;t look like a payment_intent yet (should start with pi_)</p>
                  )}
                  <p className="text-[10px] text-gray-500">
                    Find this in the Stripe dashboard on the charge details page, or in <span className="font-mono">token_transactions.stripe_payment_intent_id</span>.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Search className="w-3.5 h-3.5 text-brand-accent" />
                      Step 1 · Look up the charge + token award
                    </div>
                    <button
                      onClick={runPreview}
                      disabled={previewing || !piValid}
                      className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {previewing ? <Loader className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                      {previewing ? 'Looking up…' : 'Preview refund'}
                    </button>
                  </div>

                  {previewError && (
                    <div className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div>{previewError}</div>
                    </div>
                  )}

                  {preview && (
                    <>
                      <dl className="text-sm space-y-1 text-gray-200">
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-400">Recipient</dt>
                          <dd className="font-mono text-right truncate">{preview.user.fullName || preview.user.email || preview.user.id.slice(0, 8) + '…'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-400">Stripe charge</dt>
                          <dd className="font-mono text-right">
                            {formatStripeAmount(preview.paymentIntent.amount, preview.paymentIntent.currency)}
                            <span className="text-[10px] text-gray-500 ml-1.5">({preview.paymentIntent.status})</span>
                          </dd>
                        </div>
                        {preview.refundedAmount > 0 && (
                          <div className="flex justify-between gap-4 text-amber-300">
                            <dt>Already refunded</dt>
                            <dd className="font-mono text-right">
                              {formatStripeAmount(preview.refundedAmount, preview.paymentIntent.currency)}
                              <span className="text-[10px] ml-1.5">({preview.priorRefundCount}× prior)</span>
                            </dd>
                          </div>
                        )}
                        <div className="flex justify-between gap-4 pt-1 border-t border-white/5">
                          <dt className="text-gray-400">Tokens originally awarded</dt>
                          <dd className="font-mono text-right">{preview.tokensAwarded} BROski$</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-400">Current balance</dt>
                          <dd className="font-mono text-right text-brand-accent font-bold">{preview.user.currentBalance} BROski$</dd>
                        </div>
                        {preview.canRefund && (
                          <div className="flex justify-between gap-4 text-rose-300">
                            <dt>After refund (balance)</dt>
                            <dd className="font-mono text-right font-bold">
                              {preview.user.currentBalance - preview.tokensAwarded} BROski$
                            </dd>
                          </div>
                        )}
                      </dl>

                      {!preview.canRefund && preview.blocker && (
                        <div className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <div>{preview.blocker}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {refundError && (
                  <div className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div>{refundError}</div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">
                    Step 2 · Confirm refund (real money)
                  </p>
                  <button
                    onClick={runConfirm}
                    disabled={refunding || !preview || !preview.canRefund}
                    className="btn-primary py-2 px-4 text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      !preview ? 'Run Preview refund first' :
                      !preview.canRefund ? (preview.blocker || 'Cannot refund') :
                      `Refund ${formatStripeAmount(preview.paymentIntent.amount, preview.paymentIntent.currency)} + deduct ${preview.tokensAwarded} BROski$`
                    }
                  >
                    {refunding ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {refunding
                      ? 'Refunding…'
                      : preview
                        ? `Refund ${formatStripeAmount(preview.paymentIntent.amount, preview.paymentIntent.currency)}`
                        : 'Refund'}
                  </button>
                </div>
              </>
            )}
          </div>

          <footer className="border-t border-white/10 px-6 py-3 text-[10px] text-gray-500 font-mono uppercase tracking-widest flex items-center justify-between">
            <span>💸 Stripe refund + spend_tokens · idempotent both sides</span>
            <span>{refunding ? 'Locked — refund in flight' : 'Esc to close'}</span>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
