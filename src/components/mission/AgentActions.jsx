import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Stethoscope, Sunrise, UserCheck, Coins, Undo2, ScanSearch, Loader, X } from 'lucide-react'
import { runHealthPulse, runMorningBrief } from '../../lib/supabase'
import CatchStragglers from './CatchStragglers'
import GrantTokens from './GrantTokens'
import Refund from './Refund'

// The "do behind the scenes" panel. Each button represents an admin agent
// action — most are placeholders this commit; we ship THREE real ones now
// (Health Pulse + Morning Brief + Catch Stragglers). The first two render
// their result in the inline modal; Catch Stragglers opens a full-screen
// overlay because the operator UX is rich (tone picker, editable drafts,
// bulk approve, snooze). The others slot in commit-by-commit.
//
// ADHD pacing: one button per commit. Each ships a real working thing.

const ACTIONS = [
  { id: 'pulse',      label: 'Health Pulse',     Icon: Stethoscope, desc: 'Scan course signals → auto-create missions',            enabled: true  },
  { id: 'brief',      label: 'Morning Brief',    Icon: Sunrise,     desc: '60-second summary of the last 24h',                     enabled: true  },
  { id: 'stragglers', label: 'Catch Stragglers', Icon: UserCheck,   desc: 'Find idle students · draft DMs you approve · send',     enabled: true  },
  { id: 'grant',      label: 'Grant Tokens',     Icon: Coins,       desc: 'Pick user + amount + reason → award_tokens() w/ audit', enabled: true  },
  { id: 'refund',     label: 'Refund',           Icon: Undo2,       desc: 'Stripe + token refund in one click (reversible)',       enabled: true  },
  { id: 'drift',      label: 'Drift Scan',       Icon: ScanSearch,  desc: 'Re-run quiz true/false positional scan',                 enabled: false },
]

const LIVE_COUNT = ACTIONS.filter((a) => a.enabled).length

export default function AgentActions() {
  const [busy, setBusy]               = useState(null)  // action id currently running
  const [result, setResult]           = useState(null)  // { id, payload }
  const [error, setError]             = useState(null)
  const [showStragglers, setShowStr]  = useState(false) // overlay visibility
  const [showGrant, setShowGrant]     = useState(false) // grant overlay visibility
  const [showRefund, setShowRefund]   = useState(false) // refund overlay visibility

  const run = async (id) => {
    // Catch Stragglers is rich enough to need its own panel — open the
    // overlay instead of running inline. The audit row is written by the
    // Send action inside the overlay (server/index.js), so we don't
    // double-log here.
    if (id === 'stragglers') {
      setShowStr(true)
      return
    }
    if (id === 'grant') {
      setShowGrant(true)
      return
    }
    if (id === 'refund') {
      setShowRefund(true)
      return
    }

    setBusy(id); setError(null); setResult(null)
    try {
      if (id === 'pulse') {
        const out = await runHealthPulse()
        setResult({ id, payload: out })
      } else if (id === 'brief') {
        const out = await runMorningBrief()
        setResult({ id, payload: out })
      }
    } catch (e) {
      setError(e?.message || 'Action failed')
    }
    setBusy(null)
  }

  return (
    <section className="glass-panel rounded-2xl p-6 border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm uppercase tracking-widest text-brand-accent font-bold">Agent Actions</h2>
        <span className="text-[10px] text-gray-500 font-mono">{LIVE_COUNT} / {ACTIONS.length} live</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {ACTIONS.map(({ id, label, Icon, desc, enabled }) => (
          <button
            key={id}
            onClick={() => enabled && run(id)}
            disabled={!enabled || busy === id}
            className={`group text-left rounded-xl p-3 border transition-all flex flex-col h-full min-h-[128px] ${
              enabled
                ? 'border-brand-accent/30 bg-brand-accent/5 hover:bg-brand-accent/10 hover:border-brand-accent/60 cursor-pointer'
                : 'border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed'
            }`}
            title={desc}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {busy === id
                ? <Loader className="w-4 h-4 animate-spin text-brand-accent shrink-0" />
                : <Icon className={`w-4 h-4 shrink-0 ${enabled ? 'text-brand-accent' : 'text-gray-500'}`} />}
              <span className="text-xs font-bold text-white truncate">{label}</span>
            </div>
            <p className="text-[10px] text-gray-400 leading-snug">{desc}</p>
            {!enabled && (
              <span className="text-[9px] text-gray-600 font-mono uppercase tracking-wider mt-auto pt-2 inline-block self-start">
                SOON
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Result / error modal */}
      <AnimatePresence>
        {(result || error) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => { setResult(null); setError(null) }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-panel rounded-2xl p-6 border border-white/10 max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-base font-bold text-white">
                  {error ? 'Action failed' : result?.id === 'pulse' ? '🩺 Health Pulse complete' : '☀️ Morning Brief'}
                </h3>
                <button
                  onClick={() => { setResult(null); setError(null) }}
                  className="text-gray-400 hover:text-white"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {error && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  {error}
                </div>
              )}

              {result?.id === 'pulse' && (
                <div className="space-y-2 text-sm">
                  <div><span className="font-bold text-brand-accent">{result.payload.createdCount}</span> mission card{result.payload.createdCount === 1 ? '' : 's'} created.</div>
                  {result.payload.scanned.length > 0 && (
                    <div className="text-xs text-gray-300">
                      <span className="text-gray-500">Scanned:</span> {result.payload.scanned.join(' · ')}
                    </div>
                  )}
                  {result.payload.skipped.length > 0 && (
                    <div className="text-xs text-amber-300">
                      <span className="text-amber-500">Skipped:</span> {result.payload.skipped.join(' · ')}
                    </div>
                  )}
                </div>
              )}

              {result?.id === 'brief' && (
                <div className="space-y-3 text-sm">
                  <div className="text-xs text-gray-500 font-mono">
                    Generated {result.payload.generatedAt.toLocaleString()}
                  </div>
                  {result.payload.rows.length === 0 ? (
                    <div className="text-gray-400 italic">No signals available — see Skipped below.</div>
                  ) : (
                    <ul className="space-y-1">
                      {result.payload.rows.map((r, i) => (
                        <li key={i} className="flex items-center justify-between border-b border-white/5 py-1">
                          <span className="text-gray-300">{r.label}</span>
                          <span className="font-mono font-bold text-brand-accent">{r.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {result.payload.skipped.length > 0 && (
                    <div className="text-xs text-amber-300 mt-2">
                      <span className="text-amber-500">Skipped:</span> {result.payload.skipped.join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Catch Stragglers — full-screen overlay (its own AnimatePresence) */}
      {showStragglers && <CatchStragglers onClose={() => setShowStr(false)} />}

      {/* Grant Tokens — modal overlay (its own AnimatePresence) */}
      {showGrant && <GrantTokens onClose={() => setShowGrant(false)} />}

      {/* Refund — modal overlay (its own AnimatePresence) */}
      {showRefund && <Refund onClose={() => setShowRefund(false)} />}
    </section>
  )
}
