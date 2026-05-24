// CatchStragglers — full-panel operator overlay.
//
// Triggered from AgentActions' "Catch Stragglers" tile. Renders as a
// fixed full-screen panel (z-50, glass) so it doesn't compete with the
// Kanban underneath. Closes with the X, Escape, or a backdrop click.
//
// Read phase: fetchStragglerDrafts() — direct Supabase, mirrors how
//   runHealthPulse / runMorningBrief work.
// Send phase: sendStragglerDM() → POST /api/send-dm on the local
//   Express service (server/index.js). DISCORD_BOT_TOKEN stays server-side.
// Snooze: snoozeStraggler() — audit row only; UI-local list filtering.
//
// Operator UX honoured: tone picker (warm / curious / terse) per row,
// inline editing, bulk approve, snooze 24h, skip-from-list. Each row
// becomes a "shipped" mc_missions audit row on send.

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserCheck,
  Search,
  Loader,
  CheckCircle2,
  Clock,
  X,
  Send,
  CheckCheck,
  MessageSquare,
  Mail,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import {
  fetchStragglerDrafts,
  sendStragglerDM,
  snoozeStraggler,
} from '../../lib/supabase'

const TONES = [
  { id: 'warm',    label: 'Warm',    emoji: '🤗' },
  { id: 'curious', label: 'Curious', emoji: '🤔' },
  { id: 'terse',   label: 'Terse',   emoji: '⚡' },
]

export default function CatchStragglers({ onClose }) {
  const [loading, setLoading]         = useState(false)
  const [drafts, setDrafts]           = useState([])
  const [skipped, setSkipped]         = useState([])
  const [scanError, setScanError]     = useState(null)
  const [selectedTones, setSelected]  = useState({})
  const [edited, setEdited]           = useState({})
  const [sent, setSent]               = useState([])
  const [snoozed, setSnoozed]         = useState([])
  const [busyUser, setBusyUser]       = useState(null) // userId mid-send
  const [bulkBusy, setBulkBusy]       = useState(false)
  const [rowErrors, setRowErrors]     = useState({})   // userId -> message

  // ── Escape-to-close ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const scan = useCallback(async () => {
    setLoading(true); setScanError(null); setRowErrors({})
    try {
      const out = await fetchStragglerDrafts()
      setDrafts(out.drafts)
      setSkipped(out.skipped || [])
      const tones = {}
      out.drafts.forEach((d) => { tones[d.userId] = 'warm' })
      setSelected(tones)
      setEdited({})
      setSent([])
      setSnoozed([])
    } catch (e) {
      setScanError(e?.message || 'Scan failed')
    }
    setLoading(false)
  }, [])

  const getMessage = (draft) => {
    if (edited[draft.userId] != null) return edited[draft.userId]
    const tone = selectedTones[draft.userId] || 'warm'
    return draft.dmVariants.find((v) => v.tone === tone)?.text || ''
  }

  const recordRowError = (userId, msg) =>
    setRowErrors((m) => ({ ...m, [userId]: msg }))

  const clearRowError = (userId) =>
    setRowErrors((m) => { const n = { ...m }; delete n[userId]; return n })

  const handleSend = async (draft) => {
    setBusyUser(draft.userId); clearRowError(draft.userId)
    try {
      const out = await sendStragglerDM({
        userId: draft.userId,
        discordId: draft.discordId,
        email: draft.email,
        message: getMessage(draft),
        tone: selectedTones[draft.userId] || 'warm',
      })
      if (out.success) {
        setSent((s) => [...s, draft.userId])
      } else if (out.error === 'rate_limited') {
        const hours = Math.ceil((out.retryAfter || 0) / 3600)
        recordRowError(draft.userId, `Already DM'd in the last 24h — try again in ~${hours}h`)
      } else if (out.status === 401 || out.error === 'no_session' || out.error === 'invalid_token' || out.error === 'missing_bearer_token') {
        recordRowError(draft.userId, 'Session expired — sign out and back in, then retry')
      } else if (out.status === 403 || out.error === 'forbidden_not_admin') {
        recordRowError(draft.userId, 'Your account is not in the admin role — DM blocked server-side')
      } else {
        recordRowError(draft.userId, out.error || `HTTP ${out.status}`)
      }
    } catch (e) {
      recordRowError(draft.userId, e?.message || 'Network error')
    }
    setBusyUser(null)
  }

  const handleSnooze = async (draft) => {
    clearRowError(draft.userId)
    try {
      await snoozeStraggler(draft.userId)
    } catch {
      // audit-row failure is non-fatal; the UI-local snooze still applies
    }
    setSnoozed((s) => [...s, draft.userId])
  }

  const handleSkip = (draft) => {
    clearRowError(draft.userId)
    setSnoozed((s) => [...s, draft.userId])
  }

  const handleBulkSendAll = async () => {
    setBulkBusy(true)
    const pending = drafts.filter(
      (d) => !sent.includes(d.userId) && !snoozed.includes(d.userId),
    )
    for (const draft of pending) {
      // eslint-disable-next-line no-await-in-loop
      await handleSend(draft)
    }
    setBulkBusy(false)
  }

  const visible = drafts.filter(
    (d) => !sent.includes(d.userId) && !snoozed.includes(d.userId),
  )

  return (
    <AnimatePresence>
      <motion.div
        key="catch-stragglers-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch justify-center p-4 sm:p-8"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
        role="dialog"
        aria-modal="true"
        aria-label="Catch Stragglers"
      >
        <motion.div
          initial={{ scale: 0.97, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.97, y: 12 }}
          transition={{ duration: 0.18 }}
          className="glass-panel rounded-2xl border border-white/10 w-full max-w-5xl flex flex-col overflow-hidden"
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <header className="flex items-start gap-4 px-6 py-4 border-b border-white/10">
            <div className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-black accent-gradient-text leading-tight">
                Catch Stragglers
              </h2>
              <p className="text-xs text-gray-400">
                Idle 7+ days · review tone · approve · send. One DM per user per 24h.
              </p>
            </div>
            <button
              onClick={scan}
              disabled={loading}
              className="btn-secondary py-2 px-3 text-xs flex items-center gap-1"
            >
              {loading ? <Loader className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              {loading ? 'Scanning…' : drafts.length === 0 ? 'Scan now' : 'Re-scan'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* ── Counters strip ──────────────────────────────────────── */}
          {drafts.length > 0 && (
            <div className="px-6 py-3 border-b border-white/5 flex items-center gap-4 flex-wrap text-xs text-gray-300 font-mono">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-brand-accent" />
                <strong className="text-white">{visible.length}</strong> pending
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <strong className="text-white">{sent.length}</strong> sent
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" />
                <strong className="text-white">{snoozed.length}</strong> snoozed
              </span>
              {visible.length > 1 && (
                <button
                  onClick={handleBulkSendAll}
                  disabled={bulkBusy || busyUser !== null}
                  className="ml-auto btn-primary py-1.5 px-3 text-xs flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkBusy ? <Loader className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                  {bulkBusy ? 'Sending…' : `Approve all (${visible.length})`}
                </button>
              )}
            </div>
          )}

          {/* ── Body (scroll) ───────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
            {scanError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-sm text-rose-200">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold">Scan failed</div>
                  <div className="text-xs">{scanError}</div>
                </div>
              </div>
            )}

            {skipped.length > 0 && (
              <div className="text-[10px] text-amber-300 font-mono">
                <span className="text-amber-500 uppercase tracking-wider">Skipped probes:</span>{' '}
                {skipped.join(' · ')}
              </div>
            )}

            {!loading && drafts.length === 0 && !scanError && (
              <div className="text-center py-16 text-gray-500 text-sm">
                <Search className="w-8 h-8 mx-auto mb-3 text-gray-600" />
                Hit <span className="text-brand-accent font-bold">Scan now</span> to find students idle 7+ days.
              </div>
            )}

            {!loading && drafts.length > 0 && visible.length === 0 && (
              <div className="text-center py-12 text-emerald-300 text-sm">
                🎉 All {drafts.length} stragglers actioned!
              </div>
            )}

            {visible.map((draft) => {
              const tone = selectedTones[draft.userId] || 'warm'
              const isBusy = busyUser === draft.userId
              const rowError = rowErrors[draft.userId]
              return (
                <article
                  key={draft.userId}
                  className="glass-card rounded-xl p-4 space-y-3"
                >
                  {/* Profile + channel */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{draft.name}</p>
                      <p className="text-xs text-gray-400">
                        Level {draft.level} · {draft.totalXp} XP · idle {draft.daysIdle}d
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        Last lesson: <span className="text-gray-400">{draft.stuckModule}</span>
                      </p>
                    </div>
                    {draft.discordId ? (
                      <span className="badge-hyperfocus text-[10px] font-mono uppercase tracking-wider text-brand-accent">
                        <MessageSquare className="w-3 h-3" /> Discord
                      </span>
                    ) : draft.email ? (
                      <span className="pill-amber flex items-center gap-1">
                        <Mail className="w-3 h-3" /> Email only
                      </span>
                    ) : (
                      <span className="pill-red flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> No contact
                      </span>
                    )}
                  </div>

                  {/* Tone picker */}
                  <div className="flex flex-wrap gap-2">
                    {TONES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelected((m) => ({ ...m, [draft.userId]: t.id }))
                          setEdited((m) => { const n = { ...m }; delete n[draft.userId]; return n })
                        }}
                        className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all border ${
                          tone === t.id
                            ? 'bg-brand-accent text-brand-dark border-brand-accent'
                            : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {t.emoji} {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Editable message */}
                  <label className="sr-only" htmlFor={`msg-${draft.userId}`}>
                    DM body for {draft.name}
                  </label>
                  <textarea
                    id={`msg-${draft.userId}`}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-gray-100 resize-none focus:outline-none focus:border-brand-accent/60 font-mono leading-snug"
                    rows={3}
                    value={getMessage(draft)}
                    onChange={(e) =>
                      setEdited((m) => ({ ...m, [draft.userId]: e.target.value }))
                    }
                  />

                  {/* Row error */}
                  {rowError && (
                    <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-1.5">
                      {rowError}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => handleSnooze(draft)}
                      disabled={isBusy}
                      className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1 disabled:opacity-50"
                    >
                      <Clock className="w-3 h-3" /> Snooze 24h
                    </button>
                    <button
                      onClick={() => handleSkip(draft)}
                      disabled={isBusy}
                      className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1 disabled:opacity-50"
                    >
                      <X className="w-3 h-3" /> Skip
                    </button>
                    <button
                      onClick={() => handleSend(draft)}
                      disabled={isBusy || (!draft.discordId && !draft.email)}
                      className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!draft.discordId && !draft.email ? 'No discord_id or email on profile' : 'Send DM now'}
                    >
                      {isBusy ? <Loader className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      {isBusy ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </article>
              )
            })}

            {loading && drafts.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-brand-accent" />
                Scanning user_xp…
              </div>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <footer className="border-t border-white/10 px-6 py-3 text-[10px] text-gray-500 font-mono uppercase tracking-widest flex items-center justify-between">
            <span>🎯 Catch Stragglers · audit on Kanban</span>
            <span>Esc to close</span>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
