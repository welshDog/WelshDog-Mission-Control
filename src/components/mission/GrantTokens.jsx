// GrantTokens — admin overlay for awarding BROski$ to a user.
//
// Two-step flow (deliberate, prevents finger-trouble):
//   1. Fill in userId + amount + reason → click PREVIEW → server looks
//      up the user, returns name/email/currentBalance
//   2. Operator confirms in a "About to grant X to NAME (balance: Y)"
//      modal → click CONFIRM → server calls award_tokens() RPC,
//      emits mc_events row + mc_missions card, returns new balance
//
// Idempotency: a stable client-side UUID is generated per "session of
// editing this form" — if the operator clicks Confirm twice, or the
// network retries, the server's `(user_id, reason, source_id)` partial
// unique constraint dedups silently. `awarded: false` in the response
// means "already granted with this key" → UI shows "Already granted".
//
// Auth: every fetch attaches the operator's Supabase JWT (see
// grantTokens / previewGrantTokens in lib/supabase.js). The server's
// requireAdmin middleware verifies the role; we surface 401/403 here
// with clean error messages.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Coins,
  Search,
  Loader,
  CheckCircle2,
  X,
  AlertTriangle,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { previewGrantTokens, grantTokens } from '../../lib/supabase'

// RFC 4122 v4 shape check — cheap pre-validation so the UI catches
// fat-fingered userIds before a roundtrip.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

const errorToMessage = (out) => {
  if (!out) return 'Network error'
  if (out.error === 'no_session' || out.error === 'invalid_token' || out.error === 'missing_bearer_token' || out.status === 401)
    return 'Session expired — sign out and back in, then retry'
  if (out.error === 'forbidden_not_admin' || out.status === 403)
    return 'Your account is not in the admin role — grant blocked server-side'
  if (out.error === 'user_not_found')          return 'No user matches that ID'
  if (out.error === 'userId_must_be_uuid')     return 'User ID must be a valid UUID'
  if (out.error === 'amount_must_be_positive_integer') return 'Amount must be a positive whole number'
  if (out.error === 'amount_exceeds_cap')      return `Amount exceeds per-call cap (${out.maxGrantPerCall} BROski$)`
  if (out.error === 'reason_required_min_3_chars') return 'Reason must be at least 3 characters'
  if (out.error === 'award_tokens_rpc_failed') return `Grant failed at the DB: ${out.detail || 'unknown'}`
  return out.error || `HTTP ${out.status || '???'}`
}

export default function GrantTokens({ onClose }) {
  const [userId, setUserId]           = useState('')
  const [amount, setAmount]           = useState('')
  const [reason, setReason]           = useState('')
  const [preview, setPreview]         = useState(null)  // { email, fullName, currentBalance, maxGrantPerCall }
  const [previewing, setPreviewing]   = useState(false)
  const [previewError, setPreviewErr] = useState(null)
  const [granting, setGranting]       = useState(false)
  const [grantResult, setResult]      = useState(null)  // { awarded, newBalance, email, fullName }
  const [grantError, setGrantErr]     = useState(null)
  const [idempotencyKey]              = useState(newIdempotencyKey)

  // Esc closes (but only when not mid-grant, so a half-finished grant
  // can't be lost to a stray keystroke).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !granting) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, granting])

  // Client-side validity for enabling Preview / Confirm.
  const formValid = useMemo(() => {
    const amt = Number(amount)
    return (
      UUID_RE.test(userId.trim()) &&
      Number.isInteger(amt) && amt > 0 &&
      reason.trim().length >= 3
    )
  }, [userId, amount, reason])

  const overCap = preview?.maxGrantPerCall != null && Number(amount) > preview.maxGrantPerCall

  const runPreview = useCallback(async () => {
    setPreviewing(true); setPreviewErr(null); setPreview(null); setGrantErr(null)
    const out = await previewGrantTokens({ userId: userId.trim() })
    if (out.success) {
      setPreview({
        email: out.email,
        fullName: out.fullName,
        currentBalance: out.currentBalance,
        maxGrantPerCall: out.maxGrantPerCall,
      })
    } else {
      setPreviewErr(errorToMessage(out))
    }
    setPreviewing(false)
  }, [userId])

  const runGrant = useCallback(async () => {
    setGranting(true); setGrantErr(null)
    const out = await grantTokens({
      userId: userId.trim(),
      amount: Number(amount),
      reason: reason.trim(),
      idempotencyKey,
    })
    if (out.success) {
      setResult({
        awarded: out.awarded,
        newBalance: out.newBalance,
        email: out.email,
        fullName: out.fullName,
      })
    } else {
      setGrantErr(errorToMessage(out))
    }
    setGranting(false)
  }, [userId, amount, reason, idempotencyKey])

  // After a successful (or idempotent no-op) grant — show the success
  // card and lock the form. Operator can either close or do another
  // grant via the "Grant another" reset.
  const reset = () => {
    setResult(null); setGrantErr(null); setPreviewErr(null); setPreview(null)
    setUserId(''); setAmount(''); setReason('')
  }

  return (
    <AnimatePresence>
      <motion.div
        key="grant-tokens-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch justify-center p-4 sm:p-8"
        onClick={(e) => { if (e.target === e.currentTarget && !granting) onClose?.() }}
        role="dialog"
        aria-modal="true"
        aria-label="Grant BROski$ tokens"
      >
        <motion.div
          initial={{ scale: 0.97, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.97, y: 12 }}
          transition={{ duration: 0.18 }}
          className="glass-panel rounded-2xl border border-white/10 w-full max-w-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <header className="flex items-start gap-4 px-6 py-4 border-b border-white/10">
            <div className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-black accent-gradient-text leading-tight">Grant BROski$</h2>
              <p className="text-xs text-gray-400">
                Award tokens to a user. Audit row + mc_events emitted on every grant. Idempotent — clicking Confirm twice is safe.
              </p>
            </div>
            <button
              onClick={() => !granting && onClose?.()}
              disabled={granting}
              className="text-gray-400 hover:text-white disabled:opacity-40"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
            {/* ─── SUCCESS STATE ───────────────────────────────────────── */}
            {grantResult && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
                <div className="flex items-center gap-2 text-emerald-200">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="text-base font-bold">
                    {grantResult.awarded ? 'Tokens granted' : 'Already granted (idempotent no-op)'}
                  </h3>
                </div>
                <dl className="text-sm space-y-1 text-gray-200">
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-400">Recipient</dt>
                    <dd className="font-mono text-right truncate">{grantResult.fullName || grantResult.email || userId.slice(0, 8) + '…'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-400">Amount</dt>
                    <dd className="font-mono text-right">+{amount} BROski$</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-400">New balance</dt>
                    <dd className="font-mono text-right text-brand-accent font-bold">{grantResult.newBalance}</dd>
                  </div>
                </dl>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={reset} className="btn-secondary py-1.5 px-3 text-xs">Grant another</button>
                  <button onClick={() => onClose?.()} className="btn-primary py-1.5 px-3 text-xs">Done</button>
                </div>
              </div>
            )}

            {/* ─── FORM ─────────────────────────────────────────────────── */}
            {!grantResult && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="grant-user-id" className="block text-[11px] font-mono uppercase tracking-widest text-gray-400">
                    User ID (UUID)
                  </label>
                  <input
                    id="grant-user-id"
                    type="text"
                    value={userId}
                    onChange={(e) => { setUserId(e.target.value); setPreview(null); setPreviewErr(null) }}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    autoComplete="off"
                    spellCheck="false"
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2.5 text-sm font-mono text-gray-100 focus:outline-none focus:border-brand-accent/60"
                  />
                  {userId.length > 0 && !UUID_RE.test(userId.trim()) && (
                    <p className="text-[11px] text-amber-300">Doesn&apos;t look like a UUID yet</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="grant-amount" className="block text-[11px] font-mono uppercase tracking-widest text-gray-400">
                    Amount (BROski$)
                  </label>
                  <input
                    id="grant-amount"
                    type="number"
                    min="1"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="500"
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2.5 text-sm font-mono text-gray-100 focus:outline-none focus:border-brand-accent/60"
                  />
                  {preview?.maxGrantPerCall != null && (
                    <p className={`text-[11px] ${overCap ? 'text-rose-300' : 'text-gray-500'}`}>
                      Per-call cap: {preview.maxGrantPerCall} BROski$
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="grant-reason" className="block text-[11px] font-mono uppercase tracking-widest text-gray-400">
                    Reason (audit trail — required, min 3 chars)
                  </label>
                  <textarea
                    id="grant-reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. May contributor reward · early-access discount · manual top-up after refund"
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2.5 text-sm text-gray-100 resize-none focus:outline-none focus:border-brand-accent/60"
                  />
                </div>

                {/* Preview button + result */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-accent" />
                      Step 1 · Verify the user before granting
                    </div>
                    <button
                      onClick={runPreview}
                      disabled={previewing || !UUID_RE.test(userId.trim())}
                      className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {previewing ? <Loader className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                      {previewing ? 'Looking up…' : 'Preview user'}
                    </button>
                  </div>

                  {previewError && (
                    <div className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div>{previewError}</div>
                    </div>
                  )}

                  {preview && (
                    <dl className="text-sm space-y-1 text-gray-200">
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-400">Name</dt>
                        <dd className="font-mono text-right truncate">{preview.fullName || '(no name)'}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-400">Email</dt>
                        <dd className="font-mono text-right truncate">{preview.email || '(none)'}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-400">Current balance</dt>
                        <dd className="font-mono text-right text-brand-accent font-bold">{preview.currentBalance} BROski$</dd>
                      </div>
                      {amount && Number.isInteger(Number(amount)) && Number(amount) > 0 && !overCap && (
                        <div className="flex justify-between gap-4 pt-1 border-t border-white/5">
                          <dt className="text-gray-400">After grant</dt>
                          <dd className="font-mono text-right text-emerald-300 font-bold">
                            {preview.currentBalance + Number(amount)} BROski$
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}
                </div>

                {/* Grant button + error */}
                {grantError && (
                  <div className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div>{grantError}</div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">
                    Step 2 · Confirm grant
                  </p>
                  <button
                    onClick={runGrant}
                    disabled={granting || !formValid || !preview || overCap}
                    className="btn-primary py-2 px-4 text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      !preview ? 'Run Preview user first' :
                      overCap ? 'Amount exceeds per-call cap' :
                      !formValid ? 'Fill all fields (valid UUID + positive amount + 3+ char reason)' :
                      `Grant ${amount} BROski$ to ${preview.email || 'this user'}`
                    }
                  >
                    {granting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {granting ? 'Granting…' : `Grant ${amount || '–'} BROski$`}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <footer className="border-t border-white/10 px-6 py-3 text-[10px] text-gray-500 font-mono uppercase tracking-widest flex items-center justify-between">
            <span>💰 award_tokens() · idempotent on (user, reason, source_id)</span>
            <span>{granting ? 'Locked — grant in flight' : 'Esc to close'}</span>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
